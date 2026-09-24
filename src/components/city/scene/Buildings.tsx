import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { districtAt } from "@/lib/city/kl";
import { N, hash, tileX, tileZ } from "./common";

const letters = "abcdefgh";
export const MODELS = {
  shop: Array.from({ length: 8 }, (_, i) => `/models/commercial/building-${letters[i]}.glb`),
  tower: Array.from(
    { length: 5 },
    (_, i) => `/models/commercial/building-skyscraper-${letters[i]}.glb`,
  ),
};
Object.values(MODELS)
  .flat()
  .forEach((url) => useGLTF.preload(url));

const FOOTPRINT = { shop: 0.86, tower: 0.82 };
/**
 * Ordinary towers stay well below the icons (Petronas ~4.5 tiles, Merdeka 118
 * ~5.5), as they do in the real skyline.
 */
const HEIGHT_BOOST = { shop: 0.9, tower: 0.8 };

type Kind = keyof typeof MODELS;

/** Night glow shared by every building material. */
export const buildingGlow = { value: 0 };

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Mesh transform relative to the normalised model origin. */
  matrix: THREE.Matrix4;
}

function useModelParts(url: string, kind: Kind): Part[] {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const s = FOOTPRINT[kind] / Math.max(size.x, size.z, 0.001);
    const norm = new THREE.Matrix4()
      .makeScale(s, s * HEIGHT_BOOST[kind], s)
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
    const parts: Part[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      // Warm window glow at night: the colour map doubles as an emissive map.
      material.emissive = new THREE.Color("#ffc47a");
      material.emissiveMap = material.map;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uGlow = buildingGlow;
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uGlow;")
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uGlow;",
          );
      };
      parts.push({
        geometry: mesh.geometry,
        material,
        matrix: norm.clone().multiply(mesh.matrixWorld),
      });
    });
    return parts;
  }, [scene, kind]);
}

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

const tmp = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface Placement {
  tile: number;
  rot: number;
  born: number;
}

function ModelInstances({
  url,
  kind,
  placements,
}: {
  url: string;
  kind: Kind;
  placements: Placement[];
}) {
  const parts = useModelParts(url, kind);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const capacity = Math.max(8, Math.ceil((placements.length + 4) / 16) * 16);

  const write = (k: number, now: number) => {
    const p = placements[k];
    const age = now - p.born;
    const grow = age >= 0.6 ? 1 : Math.max(0.01, 1 - Math.pow(1 - age / 0.6, 3));
    tmpP.set(tileX(p.tile), 0, tileZ(p.tile));
    tmpQ.setFromAxisAngle(UP, p.rot);
    tmpS.set(grow, grow, grow);
    tmp.compose(tmpP, tmpQ, tmpS);
    parts.forEach((part, j) => {
      const mesh = refs.current[j];
      if (!mesh) return;
      mesh.setMatrixAt(k, tmp.clone().multiply(part.matrix));
    });
  };

  useLayoutEffect(() => {
    const now = performance.now() / 1000;
    for (let k = 0; k < placements.length; k++) write(k, now);
    refs.current.forEach((m) => {
      if (!m) return;
      m.count = placements.length;
      m.instanceMatrix.needsUpdate = true;
    });
  });

  useFrame(() => {
    const now = performance.now() / 1000;
    let dirty = false;
    for (let k = 0; k < placements.length; k++) {
      if (now - placements[k].born < 0.65) {
        write(k, now);
        dirty = true;
      }
    }
    if (dirty) refs.current.forEach((m) => m && (m.instanceMatrix.needsUpdate = true));
  });

  return (
    <>
      {parts.map((part, j) => (
        <instancedMesh
          key={`${j}-${capacity}`}
          ref={(m) => {
            refs.current[j] = m;
          }}
          args={[part.geometry, part.material, capacity]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  );
}

/** All Kenney buildings, instanced per model so a 32×32 city stays fast. */
export function Buildings({ grid }: { grid: Tile[] }) {
  // Remember when each tile's current building appeared, for the pop-in.
  const bornRef = useRef(new Map<number, { sig: string; born: number }>());
  const groups = useMemo(() => {
    const now = performance.now() / 1000;
    const first = bornRef.current.size === 0;
    const out = new Map<string, { kind: Kind; placements: Placement[] }>();
    grid.forEach((t, i) => {
      if (t.kind !== "shop" && t.kind !== "tower") {
        bornRef.current.delete(i);
        return;
      }
      const list = MODELS[t.kind];
      const url = list[t.variant % list.length];
      const sig = `${url}:${t.builtDay}`;
      const prev = bornRef.current.get(i);
      const born = prev && prev.sig === sig ? prev.born : first ? now + Math.random() * 0.8 : now;
      bornRef.current.set(i, { sig, born });
      if (!out.has(url)) out.set(url, { kind: t.kind, placements: [] });
      out.get(url)!.placements.push({ tile: i, rot: facing(grid, i), born });
    });
    return out;
  }, [grid]);

  return (
    <>
      {[...groups].map(([url, g]) => (
        <Suspense key={url} fallback={null}>
          <ModelInstances url={url} kind={g.kind} placements={g.placements} />
        </Suspense>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Local housing, built procedurally: rows of pastel shophouses with
// terracotta roofs, and wooden kampung houses on stilts in Kampung Baru.
// ---------------------------------------------------------------------------

const SHOPHOUSE_COLORS = [
  "#efc56a",
  "#8fd0bd",
  "#f0a3a0",
  "#a9c3ea",
  "#f3eee2",
  "#c9e39a",
  "#e7b3d6",
];

interface HouseSpot {
  tile: number;
  rot: number;
  born: number;
  kampung: boolean;
}

const hm = new THREE.Matrix4();
const hq = new THREE.Quaternion();
const hp = new THREE.Vector3();
const hs = new THREE.Vector3();
const hc = new THREE.Color();

export function LocalHouses({ grid }: { grid: Tile[] }) {
  const bornRef = useRef(new Map<number, { day: number; born: number }>());
  const spots = useMemo(() => {
    const now = performance.now() / 1000;
    const first = bornRef.current.size === 0;
    const out: HouseSpot[] = [];
    grid.forEach((t, i) => {
      if (t.kind !== "house") {
        bornRef.current.delete(i);
        return;
      }
      const prev = bornRef.current.get(i);
      const born =
        prev && prev.day === t.builtDay ? prev.born : first ? now + Math.random() * 0.8 : now;
      bornRef.current.set(i, { day: t.builtDay, born });
      out.push({
        tile: i,
        rot: facing(grid, i),
        born,
        kampung: districtAt(i).id === "kampung_baru",
      });
    });
    return out;
  }, [grid]);

  const shopBody = useRef<THREE.InstancedMesh>(null);
  const shopRoof = useRef<THREE.InstancedMesh>(null);
  const shopArcade = useRef<THREE.InstancedMesh>(null);
  const kBody = useRef<THREE.InstancedMesh>(null);
  const kRoof = useRef<THREE.InstancedMesh>(null);
  const kStilts = useRef<THREE.InstancedMesh>(null);
  const cap = spots.length * 3 + 8;

  const place = (
    sp: HouseSpot,
    local: THREE.Vector3,
    scale: THREE.Vector3,
    grow: number,
    rotY = 0,
  ) => {
    hq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.rot);
    hp.copy(local).multiplyScalar(grow).applyQuaternion(hq);
    hp.x += tileX(sp.tile);
    hp.z += tileZ(sp.tile);
    if (rotY)
      hq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY));
    hm.compose(hp, hq, hs.copy(scale).multiplyScalar(grow));
    return hm;
  };

  const write = (now: number) => {
    let b = 0;
    let a = 0;
    let k = 0;
    for (const sp of spots) {
      const age = now - sp.born;
      const grow = age >= 0.6 ? 1 : Math.max(0.01, 1 - Math.pow(1 - Math.max(0, age) / 0.6, 3));
      if (sp.kampung) {
        kStilts.current?.setMatrixAt(
          k,
          place(sp, new THREE.Vector3(0, 0.06, 0), new THREE.Vector3(0.5, 0.12, 0.42), grow),
        );
        kBody.current?.setMatrixAt(
          k,
          place(sp, new THREE.Vector3(0, 0.24, 0), new THREE.Vector3(0.56, 0.24, 0.48), grow),
        );
        kRoof.current?.setMatrixAt(
          k,
          place(
            sp,
            new THREE.Vector3(0, 0.48, 0),
            new THREE.Vector3(0.62, 0.26, 0.55),
            grow,
            Math.PI / 4,
          ),
        );
        k++;
        continue;
      }
      // Two or three shophouse units per lot, each its own colour.
      const units = hash(sp.tile, 5) < 0.5 ? 3 : 2;
      const w = 0.84 / units;
      const tall = 0.36 + hash(sp.tile, 6) * 0.2;
      for (let u = 0; u < units; u++) {
        const x = -0.42 + w * (u + 0.5);
        shopBody.current?.setMatrixAt(
          b,
          place(
            sp,
            new THREE.Vector3(x, tall / 2, -0.02),
            new THREE.Vector3(w - 0.02, tall, 0.72),
            grow,
          ),
        );
        hc.set(SHOPHOUSE_COLORS[Math.floor(hash(sp.tile, u + 10) * SHOPHOUSE_COLORS.length)]);
        shopBody.current?.setColorAt(b, hc);
        shopRoof.current?.setMatrixAt(
          b,
          place(
            sp,
            new THREE.Vector3(x, tall + 0.03, -0.02),
            new THREE.Vector3(w, 0.06, 0.76),
            grow,
          ),
        );
        b++;
      }
      // The five-foot way arcade along the street front.
      shopArcade.current?.setMatrixAt(
        a++,
        place(sp, new THREE.Vector3(0, 0.08, 0.38), new THREE.Vector3(0.84, 0.16, 0.08), grow),
      );
    }
    const fin = (m: THREE.InstancedMesh | null, n: number) => {
      if (!m) return;
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    fin(shopBody.current, b);
    fin(shopRoof.current, b);
    fin(shopArcade.current, a);
    fin(kBody.current, k);
    fin(kRoof.current, k);
    fin(kStilts.current, k);
  };

  useLayoutEffect(() => write(performance.now() / 1000));
  useFrame(() => {
    const now = performance.now() / 1000;
    if (spots.some((sp) => now - sp.born < 0.65)) write(now);
  });

  return (
    <group>
      <instancedMesh
        key={`sb${cap}`}
        ref={shopBody}
        args={[undefined, undefined, cap]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial flatShading roughness={0.8} />
      </instancedMesh>
      <instancedMesh
        key={`sr${cap}`}
        ref={shopRoof}
        args={[undefined, undefined, cap]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#b5532f" flatShading />
      </instancedMesh>
      <instancedMesh
        key={`sa${cap}`}
        ref={shopArcade}
        args={[undefined, undefined, cap]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6e5a4a" flatShading />
      </instancedMesh>
      <instancedMesh
        key={`ks${cap}`}
        ref={kStilts}
        args={[undefined, undefined, cap]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3d2c20" flatShading />
      </instancedMesh>
      <instancedMesh
        key={`kb${cap}`}
        ref={kBody}
        args={[undefined, undefined, cap]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#9a6a3f" flatShading />
      </instancedMesh>
      <instancedMesh
        key={`kr${cap}`}
        ref={kRoof}
        args={[undefined, undefined, cap]}
        castShadow
        frustumCulled={false}
      >
        <coneGeometry args={[0.72, 1, 4]} />
        <meshStandardMaterial color="#5b3a24" flatShading />
      </instancedMesh>
    </group>
  );
}
