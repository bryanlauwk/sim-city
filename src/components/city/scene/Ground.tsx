import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { CROSSINGS } from "@/lib/city/kl";
import { CENTER, hash, tileX, tileZ } from "./common";

const BASE: Record<string, string> = {
  empty: "#a3c78a",
  road: "#4e5058",
  house: "#c9cfb8",
  shop: "#cfcac0",
  tower: "#c2bfb8",
  park: "#7fc46a",
  forest: "#4f8f45",
  rubble: "#8a7f72",
  water: "#3f8fc9",
  landmark: "#d9d2c0",
};

const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

/** Every tile's base slab in one draw call. */
export function Ground({ grid }: { grid: Tile[] }) {
  const land = useRef<THREE.InstancedMesh>(null);
  const water = useRef<THREE.InstancedMesh>(null);
  const counts = useMemo(() => {
    let w = 0;
    for (const t of grid) if (t.kind === "water") w++;
    return { land: grid.length - w, water: w };
  }, [grid]);

  useLayoutEffect(() => {
    let l = 0;
    let w = 0;
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
      tmpC.set(BASE[t.kind]).offsetHSL(0, 0, (hash(i, 3) - 0.5) * 0.05);
      land.current?.setColorAt(l++, tmpC);
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
  }, [grid]);

  const waterMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: BASE.water,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
    });
    return m;
  }, []);
  useFrame(({ clock }) => {
    waterMat.color.setHSL(0.57, 0.52, 0.47 + Math.sin(clock.elapsedTime * 1.3) * 0.02);
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
        ref={water}
        args={[undefined, waterMat, Math.max(1, counts.water)]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.08, 1]} />
      </instancedMesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.11, 0]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#7fa872" />
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

/** Tropical trees for forest and park tiles; canopies sway in the wind. */
export const treeWind = { value: 1 };
const treeTime = { value: 0 };

function swayMaterial(color: string) {
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
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
  palm: boolean;
  shade: number;
}

export function Trees({ grid }: { grid: Tile[] }) {
  const spots = useMemo(() => {
    const out: TreeSpot[] = [];
    grid.forEach((t, i) => {
      const n = t.kind === "forest" ? 3 : t.kind === "park" ? 2 : 0;
      for (let k = 0; k < n; k++) {
        out.push({
          x: tileX(i) + (hash(i, k * 2) - 0.5) * 0.7,
          z: tileZ(i) + (hash(i, k * 2 + 1) - 0.5) * 0.7,
          s: 0.8 + hash(i, k + 20) * 0.6 * (t.kind === "forest" ? 1.3 : 1),
          palm: t.kind === "park" ? hash(i, k + 40) < 0.5 : hash(i, k + 40) < 0.15,
          shade: hash(i, k + 60),
        });
      }
      // Rain trees shade a third of the streets from the kerb.
      if (t.kind === "road" && hash(i, 77) < 0.33) {
        const cx = hash(i, 78) < 0.5 ? -0.42 : 0.42;
        const cz = hash(i, 79) < 0.5 ? -0.42 : 0.42;
        out.push({
          x: tileX(i) + cx,
          z: tileZ(i) + cz,
          s: 0.7 + hash(i, 80) * 0.4,
          palm: hash(i, 81) < 0.2,
          shade: hash(i, 82),
        });
      }
    });
    return out;
  }, [grid]);

  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const fronds = useRef<THREE.InstancedMesh>(null);
  const crownMat = useMemo(() => swayMaterial("#ffffff"), []);
  const frondMat = useMemo(() => swayMaterial("#5aa33c"), []);

  useLayoutEffect(() => {
    let c = 0;
    let f = 0;
    const q = new THREE.Quaternion();
    spots.forEach((sp, k) => {
      const h = sp.palm ? 0.5 * sp.s : 0.24 * sp.s;
      tmpM.compose(new THREE.Vector3(sp.x, h / 2, sp.z), q, new THREE.Vector3(sp.s, h / 0.3, sp.s));
      trunks.current?.setMatrixAt(k, tmpM);
      if (sp.palm) {
        tmpM.compose(new THREE.Vector3(sp.x, h, sp.z), q, new THREE.Vector3(sp.s, sp.s, sp.s));
        fronds.current?.setMatrixAt(f++, tmpM);
      } else {
        tmpM.compose(
          new THREE.Vector3(sp.x, h + 0.08 * sp.s, sp.z),
          q,
          new THREE.Vector3(sp.s * 1.1, sp.s * 0.75, sp.s * 1.1),
        );
        crowns.current?.setMatrixAt(c, tmpM);
        tmpC.setHSL(0.27 + sp.shade * 0.08, 0.45, 0.3 + sp.shade * 0.12);
        crowns.current?.setColorAt(c++, tmpC);
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
    if (fronds.current) {
      fronds.current.count = f;
      fronds.current.instanceMatrix.needsUpdate = true;
    }
  }, [spots]);

  useFrame(({ clock }) => {
    treeTime.value = clock.elapsedTime;
  });

  const cap = spots.length + 1;
  return (
    <group>
      <instancedMesh
        ref={trunks}
        args={[undefined, undefined, cap]}
        castShadow
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.022, 0.035, 0.3, 5]} />
        <meshStandardMaterial color="#6b4f35" flatShading />
      </instancedMesh>
      <instancedMesh
        ref={crowns}
        args={[undefined, crownMat, cap]}
        castShadow
        frustumCulled={false}
      >
        <icosahedronGeometry args={[0.2, 0]} />
      </instancedMesh>
      <instancedMesh
        ref={fronds}
        args={[undefined, frondMat, cap]}
        castShadow
        frustumCulled={false}
      >
        <coneGeometry args={[0.22, 0.1, 7]} />
      </instancedMesh>
    </group>
  );
}

/** Zebra stripes, including the Bukit Bintang scramble crossing. */
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
      // The diagonal scramble legs.
      out.push({ x, z, rot: Math.PI / 4 });
      out.push({ x, z, rot: -Math.PI / 4 });
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
