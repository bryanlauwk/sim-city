import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { districtAt } from "@/lib/city/hollow";
import { N, hash, tileX, tileZ } from "./common";
import { gableGeometry, kitMaterial } from "./facade";
import { houseParts, shopParts, towerParts, type KitGeo, type KitMat, type KitPart } from "./kit";

/** Buildings face the nearest road. */
export function facing(grid: Tile[], i: number): number {
  const x = i % N;
  const y = Math.floor(i / N);
  const road = (xx: number, yy: number) =>
    xx >= 0 && yy >= 0 && xx < N && yy < N && grid[yy * N + xx].kind === "road";
  if (road(x, y + 1)) return 0;
  if (road(x + 1, y)) return Math.PI / 2;
  if (road(x, y - 1)) return Math.PI;
  if (road(x - 1, y)) return -Math.PI / 2;
  return ((i * 7) % 4) * (Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Every house, shop and block is assembled from kit parts and drawn with a
// handful of instanced meshes (geometry × material).
// ---------------------------------------------------------------------------

const MATS: KitMat[] = ["glass", "brick", "siding", "roof", "trim", "accent"];
const GEOS: KitGeo[] = ["box", "cyl", "gable", "cone"];
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const partQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

interface Lot {
  tile: number;
  rot: number;
  born: number;
  parts: KitPart[];
}

function partsFor(t: Tile, i: number): KitPart[] {
  const variant = t.variant + Math.floor(hash(i, t.builtDay) * 6);
  const district = districtAt(i).id;
  if (t.kind === "house") return houseParts(i, variant, district);
  if (t.kind === "shop") return shopParts(i, variant, district);
  return towerParts(i, variant, district);
}

const TEXTURES = [
  "/textures/red-brick.webp",
  "/textures/clapboard.webp",
  "/textures/shingles.webp",
];

/**
 * The town's ordinary buildings. `upside` draws the Upside Down's copy of
 * them: the same streets, drained of colour, every window dark.
 */
export function TownBuildings({ grid, upside = false }: { grid: Tile[]; upside?: boolean }) {
  const bornRef = useRef(new Map<number, { sig: string; born: number }>());
  const lots = useMemo(() => {
    const now = performance.now() / 1000;
    const first = bornRef.current.size === 0;
    const out: Lot[] = [];
    grid.forEach((t, i) => {
      if (t.kind !== "house" && t.kind !== "shop" && t.kind !== "tower") {
        bornRef.current.delete(i);
        return;
      }
      const sig = `${t.kind}:${t.builtDay}`;
      const prev = bornRef.current.get(i);
      const born = prev && prev.sig === sig ? prev.born : first ? now + Math.random() * 0.8 : now;
      bornRef.current.set(i, { sig, born });
      out.push({ tile: i, rot: facing(grid, i), born, parts: partsFor(t, i) });
    });
    return out;
  }, [grid]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lots)
      for (const p of l.parts) c[`${p.geo}-${p.mat}`] = (c[`${p.geo}-${p.mat}`] ?? 0) + 1;
    return c;
  }, [lots]);
  const [brickMap, sidingMap, roofMap] = useLoader(THREE.TextureLoader, TEXTURES);
  const mats = useMemo(() => {
    for (const texture of [brickMap, sidingMap, roofMap]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
    const map: Partial<Record<KitMat, THREE.Texture>> = {
      brick: brickMap,
      siding: sidingMap,
      roof: roofMap,
    };
    return Object.fromEntries(
      MATS.map((k) => [k, kitMaterial(k, map[k], upside)]),
    ) as unknown as Record<KitMat, THREE.Material>;
  }, [brickMap, sidingMap, roofMap, upside]);
  const geos = useMemo(
    () => ({
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
      gable: gableGeometry(),
      cone: new THREE.ConeGeometry(0.5, 1, 12),
    }),
    [],
  );
  const refs = useRef<Record<string, THREE.InstancedMesh | null>>({});

  const write = (now: number) => {
    const n: Record<string, number> = {};
    for (const lot of lots) {
      const age = now - lot.born;
      const grow = age >= 0.6 ? 1 : Math.max(0.01, 1 - Math.pow(1 - Math.max(0, age) / 0.6, 3));
      tmpQ.setFromAxisAngle(UP, lot.rot);
      for (const p of lot.parts) {
        const key = `${p.geo}-${p.mat}`;
        const mesh = refs.current[key];
        if (!mesh) continue;
        const k = n[key] ?? 0;
        n[key] = k + 1;
        tmpP.set(p.pos[0], p.pos[1] * grow, p.pos[2]).applyQuaternion(tmpQ);
        tmpP.x += tileX(lot.tile);
        tmpP.z += tileZ(lot.tile);
        tmpS.set(p.size[0], p.size[1] * grow, p.size[2]);
        partQ.copy(tmpQ);
        if (p.yaw) partQ.multiply(new THREE.Quaternion().setFromAxisAngle(UP, p.yaw));
        tmpM.compose(tmpP, partQ, tmpS);
        mesh.setMatrixAt(k, tmpM);
        mesh.setColorAt(k, tmpC.set(p.color));
      }
    }
    for (const [key, mesh] of Object.entries(refs.current)) {
      if (!mesh) continue;
      mesh.count = n[key] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  useLayoutEffect(() => write(performance.now() / 1000));
  useFrame(() => {
    const now = performance.now() / 1000;
    if (lots.some((l) => now - l.born < 0.65)) write(now);
  });

  return (
    <group>
      {GEOS.flatMap((g) =>
        MATS.map((m) => {
          const key = `${g}-${m}`;
          if (!counts[key]) {
            refs.current[key] = null;
            return null;
          }
          const cap = Math.max(8, Math.ceil((counts[key] + 8) / 32) * 32);
          return (
            <instancedMesh
              key={`${key}-${cap}`}
              ref={(r) => {
                refs.current[key] = r;
              }}
              args={[geos[g], mats[m], cap]}
              castShadow={!upside}
              receiveShadow
              frustumCulled={false}
            />
          );
        }),
      )}
    </group>
  );
}
