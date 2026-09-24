import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { N, tileX, tileZ } from "./common";

const letters = "abcdefgh";
export const MODELS = {
  house: Array.from({ length: 8 }, (_, i) => `/models/suburban/building-type-${letters[i]}.glb`),
  shop: Array.from({ length: 8 }, (_, i) => `/models/commercial/building-${letters[i]}.glb`),
  tower: Array.from(
    { length: 5 },
    (_, i) => `/models/commercial/building-skyscraper-${letters[i]}.glb`,
  ),
};
Object.values(MODELS)
  .flat()
  .forEach((url) => useGLTF.preload(url));

const FOOTPRINT = { house: 0.8, shop: 0.86, tower: 0.82 };
/** KL skyscrapers read taller than Kenney's defaults. */
const HEIGHT_BOOST = { house: 1, shop: 1, tower: 1.35 };

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
function facing(grid: Tile[], i: number): number {
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
      if (t.kind !== "house" && t.kind !== "shop" && t.kind !== "tower") {
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
