import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { CROSSINGS } from "@/lib/city/hollow";
import { CENTER, hash, tileX, tileZ } from "./common";
import { env } from "./env";

// October in Maple Hollow: lawns, a little yellowed.
const BASE: Record<string, string> = {
  empty: "#9cae6c",
  road: "#4e5058",
  house: "#8bab62",
  shop: "#bdb7aa",
  tower: "#b3ada2",
  park: "#86a85c",
  forest: "#4d6a3c",
  rubble: "#8a7f72",
  water: "#3f6f8c",
  rail: "#6f655a",
  landmark: "#c9c2b0",
};

// The same ground in the Upside Down: ash and dead grass.
const UPSIDE: Record<string, string> = {
  empty: "#3b3f47",
  road: "#24262c",
  house: "#393d44",
  shop: "#34373d",
  tower: "#33363c",
  park: "#383c42",
  forest: "#2e3238",
  rubble: "#2c2d30",
  water: "#141a22",
  rail: "#2a2a2c",
  landmark: "#35383e",
};

const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

/** Every tile's base slab in one draw call. */
export function Ground({ grid, upside = false }: { grid: Tile[]; upside?: boolean }) {
  const palette = upside ? UPSIDE : BASE;
  const land = useRef<THREE.InstancedMesh>(null);
  const roads = useRef<THREE.InstancedMesh>(null);
  const puddles = useRef<THREE.InstancedMesh>(null);
  const water = useRef<THREE.InstancedMesh>(null);
  const puddleSpots = useMemo(
    () =>
      grid.flatMap((t, i) =>
        t.kind === "road" && hash(i, 401) < 0.18
          ? [
              {
                x: tileX(i) + (hash(i, 409) - 0.5) * 0.44,
                z: tileZ(i) + (hash(i, 419) - 0.5) * 0.44,
                sx: 0.08 + hash(i, 421) * 0.16,
                sz: 0.035 + hash(i, 431) * 0.07,
              },
            ]
          : [],
      ),
    [grid],
  );
  const counts = useMemo(() => {
    let w = 0;
    let r = 0;
    for (const t of grid) {
      if (t.kind === "water") w++;
      if (t.kind === "road") r++;
    }
    return { land: grid.length - w, water: w, roads: r };
  }, [grid]);

  useLayoutEffect(() => {
    let l = 0;
    let w = 0;
    let r = 0;
    grid.forEach((t, i) => {
      const x = tileX(i);
      const z = tileZ(i);
      if (t.kind === "water") {
        tmpM.makeTranslation(x, -0.1, z);
        water.current?.setMatrixAt(w++, tmpM);
        return;
      }
      tmpM.makeTranslation(x, -0.05, z);
      land.current?.setMatrixAt(l, tmpM);
      // A little per-tile variation keeps grass and forest from looking flat.
      tmpC.set(palette[t.kind]).offsetHSL(0, 0, (hash(i, 3) - 0.5) * 0.05);
      land.current?.setColorAt(l++, tmpC);
      if (t.kind === "road") {
        const q = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.floor(hash(i, 42) * 4) * (Math.PI / 2),
        );
        tmpM.compose(new THREE.Vector3(x, 0.006, z), q, new THREE.Vector3(1, 1, 1));
        roads.current?.setMatrixAt(r++, tmpM);
      }
    });
    if (land.current) {
      land.current.count = l;
      land.current.instanceMatrix.needsUpdate = true;
      if (land.current.instanceColor) land.current.instanceColor.needsUpdate = true;
    }
    if (water.current) {
      water.current.count = w;
      water.current.instanceMatrix.needsUpdate = true;
    }
    if (roads.current) {
      roads.current.count = r;
      roads.current.instanceMatrix.needsUpdate = true;
    }
    if (puddles.current) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      puddleSpots.forEach((spot, i) => {
        tmpM.compose(
          new THREE.Vector3(spot.x, 0.016, spot.z),
          q,
          new THREE.Vector3(spot.sx, spot.sz, 1),
        );
        puddles.current?.setMatrixAt(i, tmpM);
      });
      puddles.current.count = puddleSpots.length;
      puddles.current.instanceMatrix.needsUpdate = true;
    }
  }, [grid, puddleSpots, palette]);

  const [roadMap, roadNormal] = useLoader(THREE.TextureLoader, [
    "/textures/wet-asphalt.webp",
    "/textures/wet-asphalt.normal.webp",
  ]);
  const roadMat = useMemo(() => {
    roadMap.colorSpace = THREE.SRGBColorSpace;
    roadNormal.colorSpace = THREE.NoColorSpace;
    for (const texture of [roadMap, roadNormal]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
    return new THREE.MeshPhysicalMaterial({
      map: roadMap,
      ...(upside ? { color: "#3a3d44" } : {}),
      normalMap: roadNormal,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.88,
      metalness: 0.04,
      clearcoat: 0.001,
    });
  }, [roadMap, roadNormal, upside]);

  const puddleMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#7da2ad",
        roughness: 0.08,
        metalness: 0.2,
        clearcoat: 1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  const waterMat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: palette.water,
      roughness: 0.15,
      metalness: 0.1,
      clearcoat: 0.8,
      transparent: true,
      opacity: 0.92,
    });
    return m;
  }, [palette]);
  useFrame(({ clock }, dt) => {
    if (upside) waterMat.color.setHSL(0.6, 0.3, 0.07);
    else waterMat.color.setHSL(0.55, 0.38, 0.36 + Math.sin(clock.elapsedTime * 1.3) * 0.02);
    const blend = Math.min(1, dt * 1.3);
    roadMat.roughness += ((env.raining ? 0.3 : 0.88) - roadMat.roughness) * blend;
    roadMat.clearcoat += ((env.raining ? 0.75 : 0.001) - roadMat.clearcoat) * blend;
    puddleMat.opacity += ((env.raining ? 0.32 : 0) - puddleMat.opacity) * blend;
  });

  return (
    <group>
      <instancedMesh
        ref={land}
        args={[undefined, undefined, grid.length]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.99, 0.1, 0.99]} />
        <meshStandardMaterial flatShading roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={roads}
        args={[undefined, roadMat, Math.max(1, counts.roads)]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.99, 0.012, 0.99]} />
      </instancedMesh>
      <instancedMesh
        ref={puddles}
        args={[undefined, puddleMat, Math.max(1, puddleSpots.length)]}
        frustumCulled={false}
        renderOrder={1}
      >
        <circleGeometry args={[1, 24]} />
      </instancedMesh>
      <instancedMesh
        ref={water}
        args={[undefined, waterMat, Math.max(1, counts.water)]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.08, 1]} />
      </instancedMesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.11, 0]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color={upside ? "#2e3238" : "#6f8a4f"} />
      </mesh>
    </group>
  );
}

/** Street lamps that switch on at night. */
export const lampGlow = { value: 0 };

export function StreetLamps({ grid }: { grid: Tile[] }) {
  const posts = useRef<THREE.InstancedMesh>(null);
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(
    () =>
      grid
        .map((t, i) => i)
        .filter((i) => grid[i].kind === "road" && hash(i, 11) < 0.35)
        .map((i) => ({ x: tileX(i) + 0.38, z: tileZ(i) + 0.38 })),
    [grid],
  );
  const bulbMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#fff3c4", emissive: "#ffd27a" }),
    [],
  );

  useLayoutEffect(() => {
    spots.forEach((s, k) => {
      tmpM.makeTranslation(s.x, 0.18, s.z);
      posts.current?.setMatrixAt(k, tmpM);
      tmpM.makeTranslation(s.x, 0.37, s.z);
      bulbs.current?.setMatrixAt(k, tmpM);
    });
    [posts, bulbs].forEach((r) => {
      if (!r.current) return;
      r.current.count = spots.length;
      r.current.instanceMatrix.needsUpdate = true;
    });
  }, [spots]);

  useFrame(() => {
    bulbMat.emissiveIntensity = lampGlow.value * 2.2;
  });

  return (
    <group>
      <instancedMesh
        ref={posts}
        args={[undefined, undefined, spots.length + 1]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.012, 0.015, 0.36, 5]} />
        <meshStandardMaterial color="#3b3d42" />
      </instancedMesh>
      <instancedMesh
        ref={bulbs}
        args={[undefined, bulbMat, spots.length + 1]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.035, 6, 4]} />
      </instancedMesh>
    </group>
  );
}

/** Canopies sway in the wind. */
export const treeWind = { value: 1 };
const treeTime = { value: 0 };

function swayMaterial(color: string, map?: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({
    color,
    ...(map ? { map } : {}),
    flatShading: false,
    roughness: 0.85,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = treeTime;
    shader.uniforms.uWind = treeWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
  float h = position.y + 0.3;
  transformed.x += sin(uTime * 1.6 + ph) * 0.05 * uWind * h;
  transformed.z += cos(uTime * 1.2 + ph) * 0.035 * uWind * h;
#endif`,
      );
  };
  return m;
}

interface TreeSpot {
  x: number;
  z: number;
  s: number;
  pine: boolean;
  shade: number;
}

/** Autumn leaves: mostly reds, oranges and golds, with some green holding on. */
function autumn(shade: number, k: number, out: THREE.Color) {
  const r = hash(Math.floor(shade * 997), k);
  if (r < 0.2) return out.setHSL(0.24 + shade * 0.06, 0.34, 0.26);
  return out.setHSL(0.005 + shade * 0.1, 0.72 + r * 0.2, 0.28 + r * 0.08);
}

/**
 * Trees for the woods, parks, lawns and streets: October maples and oaks,
 * and dark pines. In the Upside Down (`upside`) they are dead: bare trunks
 * and grey, needle-less pines.
 */
export function Trees({ grid, upside = false }: { grid: Tile[]; upside?: boolean }) {
  const spots = useMemo(() => {
    const out: TreeSpot[] = [];
    grid.forEach((t, i) => {
      const n = t.kind === "forest" ? 3 : t.kind === "park" ? 2 : 0;
      for (let k = 0; k < n; k++) {
        out.push({
          x: tileX(i) + (hash(i, k * 2) - 0.5) * 0.7,
          z: tileZ(i) + (hash(i, k * 2 + 1) - 0.5) * 0.7,
          s: 0.8 + hash(i, k + 20) * 0.6 * (t.kind === "forest" ? 1.3 : 1),
          pine: t.kind === "forest" ? hash(i, k + 40) < 0.55 : hash(i, k + 40) < 0.15,
          shade: hash(i, k + 60),
        });
      }
      // A backyard tree behind many houses.
      if (t.kind === "house" && hash(i, 70) < 0.55) {
        out.push({
          x: tileX(i) + (hash(i, 71) - 0.5) * 0.6,
          z: tileZ(i) + (hash(i, 72) - 0.5) * 0.6,
          s: 0.6 + hash(i, 73) * 0.35,
          pine: hash(i, 74) < 0.2,
          shade: hash(i, 75),
        });
      }
      // Street trees along a quarter of the streets.
      if (t.kind === "road" && hash(i, 77) < 0.25) {
        const cx = hash(i, 78) < 0.5 ? -0.42 : 0.42;
        const cz = hash(i, 79) < 0.5 ? -0.42 : 0.42;
        out.push({
          x: tileX(i) + cx,
          z: tileZ(i) + cz,
          s: 0.65 + hash(i, 80) * 0.35,
          pine: false,
          shade: hash(i, 82),
        });
      }
    });
    return out;
  }, [grid]);

  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const tiers = useRef<THREE.InstancedMesh>(null);
  const crownMat = useMemo(() => swayMaterial("#ffffff"), []);
  const tierMat = useMemo(() => swayMaterial(upside ? "#3a3d42" : "#2f4a34"), [upside]);

  useLayoutEffect(() => {
    let c = 0;
    let f = 0;
    const q = new THREE.Quaternion();
    spots.forEach((sp, k) => {
      const h = sp.pine ? 0.3 * sp.s : 0.34 * sp.s;
      q.identity();
      tmpM.compose(
        new THREE.Vector3(sp.x, h / 2, sp.z),
        q,
        new THREE.Vector3(sp.s * (upside ? 0.8 : 1), h / 0.3, sp.s * (upside ? 0.8 : 1)),
      );
      trunks.current?.setMatrixAt(k, tmpM);
      if (sp.pine) {
        // Three stacked cones, narrowing to the top.
        for (let tier = 0; tier < 3; tier++) {
          const w = (0.5 - tier * 0.12) * sp.s * (upside ? 0.55 : 1);
          tmpM.compose(
            new THREE.Vector3(sp.x, h + (0.12 + tier * 0.16) * sp.s, sp.z),
            q,
            new THREE.Vector3(w, 0.32 * sp.s, w),
          );
          tiers.current?.setMatrixAt(f++, tmpM);
        }
      } else if (!upside) {
        const clusters = [
          [0, 0, 0],
          [-0.3, -0.05, 0],
          [0.3, -0.04, 0],
          [0, -0.03, -0.28],
          [0, -0.02, 0.28],
        ];
        clusters.forEach(([ox, oy, oz], leaf) => {
          tmpM.compose(
            new THREE.Vector3(sp.x + ox * sp.s, h + 0.18 * sp.s + oy * sp.s, sp.z + oz * sp.s),
            q,
            new THREE.Vector3(
              (leaf === 0 ? 0.52 : 0.4) * sp.s,
              (leaf === 0 ? 0.46 : 0.36) * sp.s,
              (leaf === 0 ? 0.52 : 0.4) * sp.s,
            ),
          );
          crowns.current?.setMatrixAt(c, tmpM);
          crowns.current?.setColorAt(c++, autumn(sp.shade, leaf, tmpC));
        });
      }
    });
    if (trunks.current) {
      trunks.current.count = spots.length;
      trunks.current.instanceMatrix.needsUpdate = true;
    }
    if (crowns.current) {
      crowns.current.count = c;
      crowns.current.instanceMatrix.needsUpdate = true;
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
    }
    if (tiers.current) {
      tiers.current.count = f;
      tiers.current.instanceMatrix.needsUpdate = true;
    }
  }, [spots, upside]);

  useFrame(({ clock }) => {
    treeTime.value = clock.elapsedTime;
  });

  return (
    <group>
      <instancedMesh
        ref={trunks}
        args={[undefined, undefined, spots.length + 1]}
        castShadow={!upside}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.022, 0.035, 0.3, 5]} />
        <meshStandardMaterial color={upside ? "#2a2c30" : "#5e4632"} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={crowns}
        args={[undefined, crownMat, Math.max(1, spots.length * 5)]}
        castShadow
        frustumCulled={false}
      >
        <sphereGeometry args={[0.2, 14, 10]} />
      </instancedMesh>
      <instancedMesh
        ref={tiers}
        args={[undefined, tierMat, Math.max(1, spots.length * 3)]}
        castShadow={!upside}
        frustumCulled={false}
      >
        <coneGeometry args={[0.5, 1, 8]} />
      </instancedMesh>
    </group>
  );
}

/** Zebra crossings on Main Street. */
export function Crossings({ grid }: { grid: Tile[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const stripes = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    for (const [cx, cy] of CROSSINGS) {
      if (grid[cy * 32 + cx]?.kind !== "road") continue;
      const x = cx - CENTER;
      const z = cy - CENTER;
      for (let k = -2; k <= 2; k++) {
        out.push({ x: x + k * 0.16, z: z - 0.38, rot: 0 });
        out.push({ x: x + k * 0.16, z: z + 0.38, rot: 0 });
        out.push({ x: x - 0.38, z: z + k * 0.16, rot: Math.PI / 2 });
        out.push({ x: x + 0.38, z: z + k * 0.16, rot: Math.PI / 2 });
      }
    }
    return out;
  }, [grid]);
  useLayoutEffect(() => {
    const q = new THREE.Quaternion();
    stripes.forEach((st, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.rot);
      tmpM.compose(new THREE.Vector3(st.x, 0.004, st.z), q, new THREE.Vector3(1, 1, 1));
      ref.current?.setMatrixAt(k, tmpM);
    });
    if (ref.current) {
      ref.current.count = stripes.length;
      ref.current.instanceMatrix.needsUpdate = true;
    }
  }, [stripes]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, Math.max(1, stripes.length)]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.07, 0.01, 0.2]} />
      <meshStandardMaterial color="#f4f1e8" />
    </instancedMesh>
  );
}
