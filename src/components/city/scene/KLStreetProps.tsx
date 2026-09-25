import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { districtAt } from "@/lib/city/kl";
import { hash, N, tileX, tileZ } from "./common";

interface StallSpot {
  tile: number;
  x: number;
  z: number;
  side: number;
  awning: string;
  cart: string;
}

interface BusStopSpot {
  tile: number;
  x: number;
  z: number;
  alongX: boolean;
}

interface DrainSpot {
  tile: number;
  x: number;
  z: number;
  alongX: boolean;
}

const AWNINGS = ["#bd332d", "#19816f", "#e1ae43", "#315f99"];
const CARTS = ["#d8d4c6", "#687a7a", "#b8a57a"];
const steel = new THREE.MeshStandardMaterial({
  color: "#aab3b4",
  metalness: 0.55,
  roughness: 0.34,
});
const charcoal = new THREE.MeshStandardMaterial({ color: "#2b2c2c", roughness: 0.75 });
const lantern = new THREE.MeshStandardMaterial({
  color: "#d52422",
  emissive: "#f02c19",
  emissiveIntensity: 0.55,
  roughness: 0.4,
});
const shelterGlass = new THREE.MeshPhysicalMaterial({
  color: "#a8cbd0",
  metalness: 0.12,
  roughness: 0.24,
  transparent: true,
  opacity: 0.55,
  clearcoat: 0.7,
});
const rapidRed = new THREE.MeshStandardMaterial({ color: "#d6262e", roughness: 0.5 });
const signWhite = new THREE.MeshStandardMaterial({ color: "#f4f0e6", roughness: 0.82 });
const drainDark = new THREE.MeshStandardMaterial({
  color: "#30363a",
  metalness: 0.35,
  roughness: 0.82,
});

type Geo = "box" | "cyl" | "sphere";
type MatKey =
  | "steel"
  | "charcoal"
  | "lantern"
  | "glass"
  | "red"
  | "white"
  | "drain"
  | "cart"
  | "awning"
  | "bulb"
  | "stool"
  | "brass";

/** One primitive of a prop, in the prop's own frame. Cylinders and spheres take diameters. */
interface Part {
  geo: Geo;
  mat: MatKey;
  pos: [number, number, number];
  size: [number, number, number];
  tilt?: number;
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
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
};

// Tinted materials are white so each instance's colour comes through as-is.
const MATERIAL: Record<MatKey, THREE.Material> = {
  steel,
  charcoal,
  lantern,
  glass: shelterGlass,
  red: rapidRed,
  white: signWhite,
  drain: drainDark,
  cart: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.48, metalness: 0.3 }),
  awning: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }),
  bulb: new THREE.MeshStandardMaterial({
    color: "#ffcf79",
    emissive: "#ff9e45",
    emissiveIntensity: 1.3,
  }),
  stool: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: "#d9a63d", metalness: 0.45, roughness: 0.45 }),
};

const CASTS_SHADOW = new Set(["box:cart", "box:steel", "box:awning"]);

/** Rapid KL shelter: red route panel, clear rain screen and curbside bench. */
const BUS_STOP: Part[] = [
  ...[-0.2, 0.2].map(
    (x): Part => ({ geo: "cyl", mat: "steel", pos: [x, 0.23, 0], size: [0.021, 0.44, 0.021] }),
  ),
  { geo: "box", mat: "steel", pos: [0, 0.47, 0], size: [0.48, 0.025, 0.2] },
  { geo: "box", mat: "glass", pos: [0, 0.31, -0.085], size: [0.4, 0.24, 0.012] },
  { geo: "box", mat: "red", pos: [0.145, 0.4, 0.11], size: [0.12, 0.09, 0.012] },
  { geo: "box", mat: "white", pos: [0.145, 0.402, 0.118], size: [0.075, 0.012, 0.004] },
  { geo: "box", mat: "red", pos: [0, 0.09, 0.1], size: [0.27, 0.025, 0.08] },
  { geo: "box", mat: "steel", pos: [0, 0.018, 0.1], size: [0.27, 0.025, 0.08] },
];

/** A Jalan Alor food cart with its shade, light, stools and lanterns. */
function stallParts(cart: string, awning: string): Part[] {
  return [
    // Stainless cart, counter and serving shelf.
    { geo: "box", mat: "cart", pos: [0, 0.16, 0], size: [0.19, 0.2, 0.15], color: cart },
    { geo: "box", mat: "steel", pos: [0, 0.28, 0.015], size: [0.23, 0.035, 0.19] },
    { geo: "box", mat: "charcoal", pos: [0, 0.2, 0.096], size: [0.12, 0.11, 0.008] },
    // Striped canvas shade, poles and warm stall light.
    {
      geo: "box",
      mat: "awning",
      pos: [0, 0.52, -0.015],
      size: [0.3, 0.025, 0.24],
      tilt: 0.03,
      color: awning,
    },
    ...[-0.11, 0.11].map(
      (x): Part => ({
        geo: "cyl",
        mat: "steel",
        pos: [x, 0.4, -0.015],
        size: [0.018, 0.25, 0.018],
      }),
    ),
    { geo: "sphere", mat: "bulb", pos: [0, 0.35, 0.075], size: [0.05, 0.05, 0.05] },
    // Plastic stools at the curb, the familiar Jalan Alor seating.
    ...[-0.17, 0.17].flatMap((x, k): Part[] => [
      {
        geo: "cyl",
        mat: "stool",
        pos: [x, 0.055, 0.2],
        size: [0.085, 0.06, 0.085],
        color: k ? "#207c74" : "#bc3930",
      },
      { geo: "cyl", mat: "charcoal", pos: [x, 0.015, 0.2], size: [0.062, 0.03, 0.062] },
    ]),
    // Hanging red lanterns and their brass caps.
    ...[-0.13, 0, 0.13].flatMap((x): Part[] => [
      { geo: "sphere", mat: "lantern", pos: [x, 0.66, 0.05], size: [0.07, 0.07, 0.07] },
      { geo: "cyl", mat: "brass", pos: [x, 0.615, 0.05], size: [0.006, 0.035, 0.006] },
    ]),
  ];
}

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
      tmpQ.setFromEuler(tmpE.set(p.tilt ?? 0, 0, 0)),
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

/** Small food carts and lanterns give Jalan Alor a distinct night-market edge. */
export function KLStreetProps({ grid }: { grid: Tile[] }) {
  const stalls = useMemo(() => {
    const out: StallSpot[] = [];
    grid.forEach((tile, i) => {
      if (tile.kind !== "road") return;
      const district = districtAt(i).id;
      const chance = district === "jalan_alor" ? 0.58 : district === "changkat" ? 0.18 : 0;
      // Keep the roadside clear where the existing rain trees are planted.
      if (!chance || hash(i, 101) > chance || hash(i, 77) < 0.33) return;
      const side = hash(i, 103) < 0.5 ? -1 : 1;
      out.push({
        tile: i,
        x: tileX(i) + side * 0.39,
        z: tileZ(i) + (hash(i, 104) - 0.5) * 0.34,
        side,
        awning: AWNINGS[Math.floor(hash(i, 105) * AWNINGS.length)],
        cart: CARTS[Math.floor(hash(i, 106) * CARTS.length)],
      });
    });
    return out;
  }, [grid]);

  const busStops = useMemo(() => {
    const out: BusStopSpot[] = [];
    grid.forEach((tile, i) => {
      if (tile.kind !== "road") return;
      const district = districtAt(i).id;
      if (
        !(
          district === "klcc" ||
          district === "bukit_bintang" ||
          district === "dang_wangi" ||
          district === "raja_chulan"
        )
      )
        return;
      if (hash(i, 109) > 0.025 || hash(i, 77) < 0.4) return;
      const x = i % N;
      const y = Math.floor(i / N);
      const horizontal =
        (x > 0 && grid[i - 1]?.kind === "road") || (x < N - 1 && grid[i + 1]?.kind === "road");
      const vertical =
        (y > 0 && grid[i - N]?.kind === "road") || (y < N - 1 && grid[i + N]?.kind === "road");
      if (!horizontal && !vertical) return;
      const alongX = horizontal && (!vertical || hash(i, 211) < 0.5);
      const side = hash(i, 223) < 0.5 ? -1 : 1;
      out.push({
        tile: i,
        x: tileX(i) + (alongX ? 0 : side * 0.33),
        z: tileZ(i) + (alongX ? side * 0.33 : 0),
        alongX,
      });
    });
    return out;
  }, [grid]);

  const drains = useMemo(() => {
    const out: DrainSpot[] = [];
    grid.forEach((tile, i) => {
      if (tile.kind !== "road" || hash(i, 227) > 0.11) return;
      const x = i % N;
      const y = Math.floor(i / N);
      const horizontal =
        (x > 0 && grid[i - 1]?.kind === "road") || (x < N - 1 && grid[i + 1]?.kind === "road");
      const vertical =
        (y > 0 && grid[i - N]?.kind === "road") || (y < N - 1 && grid[i + N]?.kind === "road");
      const alongX = horizontal && (!vertical || hash(i, 229) < 0.5);
      const curb = hash(i, 233) < 0.5 ? -0.42 : 0.42;
      out.push({
        tile: i,
        x: tileX(i) + (alongX ? 0 : curb),
        z: tileZ(i) + (alongX ? curb : 0),
        alongX,
      });
    });
    return out;
  }, [grid]);

  const groups = useMemo(() => {
    const parts: Placed[] = [];
    for (const d of drains)
      place(parts, [d.x, 0.015, d.z], d.alongX ? 0 : Math.PI / 2, [
        // Covered monsoon drain with its curb grate bars.
        { geo: "box", mat: "drain", pos: [0, 0, 0], size: [0.26, 0.008, 0.075] },
        ...[-0.025, 0, 0.025].map(
          (z): Part => ({
            geo: "box",
            mat: "steel",
            pos: [0, 0.006, z],
            size: [0.2, 0.004, 0.006],
          }),
        ),
      ]);
    for (const b of busStops) place(parts, [b.x, 0, b.z], b.alongX ? 0 : Math.PI / 2, BUS_STOP);
    for (const st of stalls)
      place(parts, [st.x, 0, st.z], st.side < 0 ? 0 : Math.PI, stallParts(st.cart, st.awning));
    // One instanced mesh per geometry and material, instead of a mesh per part.
    const byKey = new Map<string, Placed[]>();
    for (const part of parts) {
      const k = `${part.geo}:${part.mat}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(part);
    }
    return [...byKey.entries()];
  }, [drains, busStops, stalls]);

  return (
    <group>
      {groups.map(([k, items]) => (
        <PartBatch key={k} items={items} />
      ))}
    </group>
  );
}
