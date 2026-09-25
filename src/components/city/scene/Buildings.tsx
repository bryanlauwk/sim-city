import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { districtAt } from "@/lib/city/kl";
import { N, hash, tileX, tileZ } from "./common";
import { shopParts, towerParts, type KitGeo, type KitMat, type KitPart } from "./kit";

/** Night glow shared by every building material (0 by day, up to ~0.5 at night). */
export const buildingGlow = { value: 0 };

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
// Kit buildings: every shop and tower is assembled from kit parts and drawn
// with six instanced meshes (box/cylinder × glass/concrete/signage).
// ---------------------------------------------------------------------------

/**
 * Facade shader: window grids in world space so they stay regular however a
 * part is stretched, and a scattering of lit windows at night.
 */
function facadeMaterial(kind: KitMat, map?: THREE.Texture, normalMap?: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({
    // Only the textures this kind has; three.js warns about undefined ones.
    ...(map ? { map } : {}),
    ...(normalMap ? { normalMap, normalScale: new THREE.Vector2(0.18, 0.18) } : {}),
    flatShading: false,
    roughness: kind === "glass" ? 0.25 : 0.85,
    metalness: kind === "glass" ? 0.1 : 0,
  });
  if (kind === "accent") {
    m.emissive = new THREE.Color("#ffffff");
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = buildingGlow;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uGlow;")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * (0.15 + uGlow * 1.6);",
        );
    };
    return m;
  }
  const floors = kind === "glass" ? "10.0" : "8.0";
  const cols = kind === "glass" ? "8.0" : "6.0";
  const frame = kind === "glass" ? "0.28" : "0.4";
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = buildingGlow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vKitWorld;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vKitWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vKitWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vKitWorld;\nuniform float uGlow;\nfloat kitHash(vec3 p){return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453);}",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  vec3 kw = vKitWorld * vec3(${cols}, ${floors}, ${cols});
  float floorLine = step(0.78, fract(kw.y));
  float mullion = step(0.84, fract(kw.x + kw.z));
  float frameMask = max(floorLine, mullion);
  diffuseColor.rgb *= 1.0 - ${frame} * frameMask;
  float lit = step(0.8, kitHash(floor(kw))) * (1.0 - frameMask);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * lit * uGlow * 0.9;",
      );
  };
  return m;
}

const MATS: KitMat[] = ["glass", "solid", "accent"];
const GEOS: KitGeo[] = ["box", "cyl"];
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
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

export function KitBuildings({ grid }: { grid: Tile[] }) {
  const bornRef = useRef(new Map<number, { sig: string; born: number }>());
  const lots = useMemo(() => {
    const now = performance.now() / 1000;
    const first = bornRef.current.size === 0;
    const out: Lot[] = [];
    grid.forEach((t, i) => {
      if (t.kind !== "shop" && t.kind !== "tower") {
        bornRef.current.delete(i);
        return;
      }
      const sig = `${t.kind}:${t.builtDay}`;
      const prev = bornRef.current.get(i);
      const born = prev && prev.sig === sig ? prev.born : first ? now + Math.random() * 0.8 : now;
      bornRef.current.set(i, { sig, born });
      const variant = t.variant + Math.floor(hash(i, t.builtDay) * 6);
      out.push({
        tile: i,
        rot: facing(grid, i),
        born,
        parts:
          t.kind === "tower"
            ? towerParts(i, variant, districtAt(i).id)
            : shopParts(i, variant, districtAt(i).id),
      });
    });
    return out;
  }, [grid]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lots)
      for (const p of l.parts) c[`${p.geo}-${p.mat}`] = (c[`${p.geo}-${p.mat}`] ?? 0) + 1;
    return c;
  }, [lots]);
  const [glassMap, plasterMap, plasterNormal] = useLoader(THREE.TextureLoader, [
    "/textures/curtain-glass.webp",
    "/textures/heritage-plaster.webp",
    "/textures/heritage-plaster.normal.webp",
  ]);
  useMemo(() => {
    plasterNormal.colorSpace = THREE.NoColorSpace;
    for (const texture of [glassMap, plasterMap]) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    for (const texture of [glassMap, plasterMap, plasterNormal]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
  }, [glassMap, plasterMap, plasterNormal]);
  const mats = useMemo(
    () =>
      Object.fromEntries(
        MATS.map((k) => [
          k,
          facadeMaterial(
            k,
            k === "glass" ? glassMap : k === "solid" ? plasterMap : undefined,
            k === "solid" ? plasterNormal : undefined,
          ),
        ]),
      ) as unknown as Record<KitMat, THREE.Material>,
    [glassMap, plasterMap, plasterNormal],
  );
  const geos = useMemo(
    () => ({
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
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
        tmpM.compose(tmpP, tmpQ, tmpS);
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
          const cap = Math.max(8, Math.ceil(((counts[key] ?? 0) + 8) / 32) * 32);
          return (
            <instancedMesh
              key={`${key}-${cap}`}
              ref={(r) => {
                refs.current[key] = r;
              }}
              args={[geos[g], mats[m], cap]}
              castShadow
              receiveShadow
              frustumCulled={false}
            />
          );
        }),
      )}
    </group>
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
        // A few wooden kampung houses survive on the Kampung Baru side.
        kampung: districtAt(i).id === "dang_wangi" && hash(i, 9) < 0.35,
      });
    });
    return out;
  }, [grid]);
  const [plasterMap, woodMap, roofMap, plasterNormal, woodNormal, roofNormal] = useLoader(
    THREE.TextureLoader,
    [
      "/textures/heritage-plaster.webp",
      "/textures/kampung-wood.webp",
      "/textures/terracotta-roof.webp",
      "/textures/heritage-plaster.normal.webp",
      "/textures/kampung-wood.normal.webp",
      "/textures/terracotta-roof.normal.webp",
    ],
  );
  useMemo(() => {
    for (const texture of [plasterNormal, woodNormal, roofNormal])
      texture.colorSpace = THREE.NoColorSpace;
    for (const texture of [plasterMap, woodMap, roofMap]) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    for (const texture of [plasterMap, woodMap, roofMap, plasterNormal, woodNormal, roofNormal]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
  }, [plasterMap, woodMap, roofMap, plasterNormal, woodNormal, roofNormal]);

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
        <meshStandardMaterial
          map={plasterMap}
          normalMap={plasterNormal}
          normalScale={new THREE.Vector2(0.22, 0.22)}
          roughness={0.88}
        />
      </instancedMesh>
      <instancedMesh
        key={`sr${cap}`}
        ref={shopRoof}
        args={[undefined, undefined, cap]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          map={roofMap}
          normalMap={roofNormal}
          normalScale={new THREE.Vector2(0.3, 0.3)}
          color="#ffffff"
          roughness={0.9}
        />
      </instancedMesh>
      <instancedMesh
        key={`sa${cap}`}
        ref={shopArcade}
        args={[undefined, undefined, cap]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6e5a4a" roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        key={`ks${cap}`}
        ref={kStilts}
        args={[undefined, undefined, cap]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          map={woodMap}
          normalMap={woodNormal}
          normalScale={new THREE.Vector2(0.24, 0.24)}
          color="#493725"
          roughness={0.92}
        />
      </instancedMesh>
      <instancedMesh
        key={`kb${cap}`}
        ref={kBody}
        args={[undefined, undefined, cap]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          map={woodMap}
          normalMap={woodNormal}
          normalScale={new THREE.Vector2(0.24, 0.24)}
          color="#ffffff"
          roughness={0.88}
        />
      </instancedMesh>
      <instancedMesh
        key={`kr${cap}`}
        ref={kRoof}
        args={[undefined, undefined, cap]}
        castShadow
        frustumCulled={false}
      >
        <coneGeometry args={[0.72, 1, 4]} />
        <meshStandardMaterial
          map={roofMap}
          normalMap={roofNormal}
          normalScale={new THREE.Vector2(0.3, 0.3)}
          color="#ffffff"
          roughness={0.9}
        />
      </instancedMesh>
    </group>
  );
}
