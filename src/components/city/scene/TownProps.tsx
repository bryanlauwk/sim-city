import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { districtAt } from "@/lib/city/hollow";
import { facing } from "./Buildings";
import { hash, tileX, tileZ } from "./common";
import { buildingGlow } from "./facade";

/**
 * Small-town clutter, October 1985: jack-o'-lanterns on the porches (lit
 * after dark), raked leaf piles on the lawns, and fire hydrants, phone booths,
 * mailboxes and trash cans along the streets.
 */

type Geo = "box" | "cyl" | "sphere";
type MatKey = "paint" | "steel" | "glass" | "pumpkin" | "leaves";

interface Part {
  geo: Geo;
  mat: MatKey;
  pos: [number, number, number];
  size: [number, number, number];
  color?: string;
}

interface Placed {
  geo: Geo;
  mat: MatKey;
  matrix: THREE.Matrix4;
  color?: string;
}

const GEOMETRY: Record<Geo, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
};

const pumpkin = new THREE.MeshStandardMaterial({
  color: "#e0701f",
  emissive: "#ff8a1c",
  roughness: 0.6,
});
pumpkin.onBeforeCompile = (shader) => {
  shader.uniforms.uGlow = buildingGlow;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uGlow;")
    .replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.05 + uGlow * 2.2;",
    );
};

// Tinted materials are white so each instance's colour comes through as-is.
const MATERIAL: Record<MatKey, THREE.Material> = {
  paint: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55 }),
  steel: new THREE.MeshStandardMaterial({ color: "#8f969a", metalness: 0.5, roughness: 0.4 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#b9d2d8",
    roughness: 0.2,
    transparent: true,
    opacity: 0.5,
  }),
  pumpkin,
  leaves: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }),
};

const CASTS_SHADOW = new Set(["box:paint", "cyl:paint", "sphere:pumpkin"]);

const HYDRANT: Part[] = [
  { geo: "cyl", mat: "paint", pos: [0, 0.035, 0], size: [0.035, 0.07, 0.035], color: "#c0392b" },
  { geo: "sphere", mat: "paint", pos: [0, 0.07, 0], size: [0.035, 0.03, 0.035], color: "#c0392b" },
  { geo: "cyl", mat: "paint", pos: [0, 0.045, 0], size: [0.012, 0.012, 0.06], color: "#d9d9d9" },
];

const PHONE_BOOTH: Part[] = [
  { geo: "box", mat: "glass", pos: [0, 0.12, 0], size: [0.08, 0.2, 0.08] },
  { geo: "box", mat: "paint", pos: [0, 0.23, 0], size: [0.09, 0.03, 0.09], color: "#2b5ca8" },
  { geo: "box", mat: "steel", pos: [0, 0.01, 0], size: [0.09, 0.02, 0.09] },
];

const MAILBOX: Part[] = [
  { geo: "box", mat: "paint", pos: [0, 0.06, 0], size: [0.05, 0.08, 0.05], color: "#1f4fa8" },
  { geo: "cyl", mat: "paint", pos: [0, 0.1, 0], size: [0.05, 0.02, 0.05], color: "#1f4fa8" },
];

const TRASH_CAN: Part[] = [
  { geo: "cyl", mat: "steel", pos: [0, 0.035, 0], size: [0.045, 0.07, 0.045] },
  { geo: "cyl", mat: "steel", pos: [0, 0.074, 0], size: [0.05, 0.008, 0.05] },
];

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** Place a prop's parts in the world, turned by `yaw` around its origin. */
function place(out: Placed[], at: [number, number, number], yaw: number, parts: Part[]) {
  const prop = new THREE.Matrix4().compose(
    new THREE.Vector3(...at),
    tmpQ.setFromEuler(tmpE.set(0, yaw, 0)),
    tmpS.set(1, 1, 1),
  );
  for (const p of parts) {
    const local = new THREE.Matrix4().compose(
      tmpV.set(...p.pos),
      tmpQ.identity(),
      tmpS.set(...p.size),
    );
    out.push({ geo: p.geo, mat: p.mat, color: p.color, matrix: prop.clone().multiply(local) });
  }
}

function PartBatch({ items }: { items: Placed[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { geo, mat } = items[0];
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const c = new THREE.Color();
    items.forEach((it, i) => {
      m.setMatrixAt(i, it.matrix);
      if (it.color) m.setColorAt(i, c.set(it.color));
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[GEOMETRY[geo], MATERIAL[mat], items.length]}
      castShadow={CASTS_SHADOW.has(`${geo}:${mat}`)}
    />
  );
}

const LEAVES = ["#c4541c", "#d98a1f", "#a8321c", "#c9a227"];

export function TownProps({ grid }: { grid: Tile[] }) {
  const groups = useMemo(() => {
    const parts: Placed[] = [];
    grid.forEach((t, i) => {
      const x = tileX(i);
      const z = tileZ(i);
      if (t.kind === "house") {
        const yaw = facing(grid, i);
        const front = (dx: number, dz: number): [number, number, number] => [
          x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
          0,
          z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
        ];
        // A jack-o'-lantern (or two) on the front step.
        if (hash(i, 501) < 0.45) {
          const n = hash(i, 502) < 0.4 ? 2 : 1;
          for (let k = 0; k < n; k++)
            place(parts, front(-0.08 + k * 0.16, 0.24), yaw, [
              { geo: "sphere", mat: "pumpkin", pos: [0, 0.025, 0], size: [0.06, 0.05, 0.06] },
              {
                geo: "cyl",
                mat: "paint",
                pos: [0, 0.055, 0],
                size: [0.01, 0.015, 0.01],
                color: "#4a6b2a",
              },
            ]);
        }
        // A raked pile of leaves on the lawn.
        if (hash(i, 503) < 0.3)
          place(parts, front((hash(i, 504) - 0.5) * 0.5, 0.33), yaw, [
            {
              geo: "sphere",
              mat: "leaves",
              pos: [0, 0.01, 0],
              size: [0.14, 0.05, 0.1],
              color: LEAVES[Math.floor(hash(i, 505) * LEAVES.length)],
            },
          ]);
        return;
      }
      if (t.kind !== "road") return;
      const downtown = districtAt(i).id === "downtown";
      const cx = hash(i, 511) < 0.5 ? -0.42 : 0.42;
      const cz = hash(i, 512) < 0.5 ? -0.42 : 0.42;
      if (hash(i, 513) < 0.08) place(parts, [x + cx, 0, z - cz], 0, HYDRANT);
      if (downtown) {
        if (hash(i, 514) < 0.18) place(parts, [x - cx, 0, z + cz], 0, PHONE_BOOTH);
        if (hash(i, 515) < 0.25) place(parts, [x + cx * 0.9, 0, z + cz * 0.9], 0, MAILBOX);
        if (hash(i, 516) < 0.35) place(parts, [x - cx * 0.9, 0, z - cz * 0.9], 0, TRASH_CAN);
      }
    });
    // One instanced mesh per geometry and material, instead of a mesh per part.
    const byKey = new Map<string, Placed[]>();
    for (const part of parts) {
      const k = `${part.geo}:${part.mat}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(part);
    }
    return [...byKey.entries()];
  }, [grid]);

  return (
    <group>
      {groups.map(([k, items]) => (
        <PartBatch key={k} items={items} />
      ))}
    </group>
  );
}
