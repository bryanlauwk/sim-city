import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityState, Tile } from "@/lib/city/types";
import { natureScore } from "@/lib/city/simulation";
import {
  N,
  isWalkable,
  tileX,
  tileZ,
  worldToTile,
  type SpawnRequest,
  type WorldBus,
} from "./common";
import { env } from "./env";

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const partM = new THREE.Matrix4();
const partQ = new THREE.Quaternion();
const partP = new THREE.Vector3();
const partS = new THREE.Vector3();
const detailBaseP = new THREE.Vector3();
const detailBaseQ = new THREE.Quaternion();
const WHEEL_AXLE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

function setVehiclePart(
  mesh: THREE.InstancedMesh | null,
  index: number,
  offset: [number, number, number],
  size: [number, number, number],
  localRotation?: THREE.Quaternion,
) {
  if (!mesh) return;
  partP
    .set(...offset)
    .applyQuaternion(detailBaseQ)
    .add(detailBaseP);
  partQ.copy(detailBaseQ);
  if (localRotation) partQ.multiply(localRotation);
  partM.compose(partP, partQ, partS.set(...size));
  mesh.setMatrixAt(index, partM);
}

const rnd = Math.random;
const pickOne = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

// ---------------------------------------------------------------------------
// Road network helpers
// ---------------------------------------------------------------------------

function roadNeighbors(grid: Tile[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  grid.forEach((t, i) => {
    if (t.kind !== "road") return;
    const x = i % N;
    const y = Math.floor(i / N);
    const ns: number[] = [];
    if (x > 0 && grid[i - 1].kind === "road") ns.push(i - 1);
    if (x < N - 1 && grid[i + 1].kind === "road") ns.push(i + 1);
    if (y > 0 && grid[i - N].kind === "road") ns.push(i - N);
    if (y < N - 1 && grid[i + N].kind === "road") ns.push(i + N);
    out.set(i, ns);
  });
  return out;
}

function bfsPath(graph: Map<number, number[]>, from: number, to: number): number[] | null {
  const prev = new Map<number, number>([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of graph.get(cur) ?? []) {
      if (!prev.has(n)) {
        prev.set(n, cur);
        queue.push(n);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: number[] = [];
  for (let c = to; c !== -1; c = prev.get(c)!) path.push(c);
  return path.reverse();
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

interface Vehicle {
  from: number;
  to: number;
  t: number;
  speed: number;
  color: THREE.Color;
  /** Scripted route for emergency services and convoys. */
  path?: number[];
  step?: number;
  until?: number;
  flashing?: boolean;
  size?: number;
}

const CAR_COLORS = [
  "#d8d8d8",
  "#2b2b2b",
  "#b3202a",
  "#f2f2f2",
  "#1f4e8c",
  "#8c8c8c",
  "#d9a41e",
  "#5b6b3a",
];
const BIKE_COLORS = ["#222", "#c0392b", "#2c3e50", "#7f8c8d"];

function lanePosition(v: Vehicle, out: THREE.Vector3): number {
  const ax = tileX(v.from);
  const az = tileZ(v.from);
  const bx = tileX(v.to);
  const bz = tileZ(v.to);
  let dx = bx - ax;
  let dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const t = Math.min(1, v.t);
  // Malaysia drives on the left.
  out.set(ax + (bx - ax) * t + dz * 0.2, 0.06, az + (bz - az) * t - dx * 0.2);
  return Math.atan2(dx, dz);
}

function useVehicles(
  grid: Tile[],
  graph: Map<number, number[]>,
  want: number,
  speed: number,
  colors: string[],
) {
  const list = useRef<Vehicle[]>([]);
  const roads = useMemo(() => [...graph.keys()], [graph]);
  useEffect(() => {
    const keep = list.current.filter((v) => graph.has(v.from) && graph.has(v.to));
    while (keep.length < want && roads.length) {
      const from = pickOne(roads);
      keep.push({
        from,
        to: from,
        t: 1,
        speed: speed * (0.7 + rnd() * 0.6),
        color: new THREE.Color(pickOne(colors)),
      });
    }
    list.current = keep.slice(0, want);
  }, [graph, roads, want, speed, colors]);
  return list;
}

function stepVehicle(
  v: Vehicle,
  dt: number,
  grid: Tile[],
  graph: Map<number, number[]>,
  mul: number,
) {
  v.t += dt * v.speed * mul;
  if (v.t < 1) return;
  const passable = (n: number) => grid[n].fire === 0 && grid[n].flood === 0;
  const opts = (graph.get(v.to) ?? []).filter((n) => n !== v.from && passable(n));
  const next = opts.length ? pickOne(opts) : (graph.get(v.to) ?? []).find(passable);
  if (next === undefined) {
    v.t = 1; // Stuck in a jam.
    return;
  }
  v.from = v.to;
  v.to = next;
  v.t -= 1;
}

// ---------------------------------------------------------------------------
// Pedestrians and animals
// ---------------------------------------------------------------------------

interface Walker {
  x: number;
  z: number;
  tx: number;
  tz: number;
  speed: number;
  phase: number;
  y: number;
}

type Habitat = (i: number) => boolean;

function retarget(w: Walker, habitat: Habitat, range = 1) {
  const here = worldToTile(w.x, w.z);
  const opts: number[] = here >= 0 && habitat(here) ? [here] : [];
  if (here >= 0) {
    const x = here % N;
    const y = Math.floor(here / N);
    for (let dy = -range; dy <= range; dy++)
      for (let dx = -range; dx <= range; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        if (habitat(ny * N + nx)) opts.push(ny * N + nx);
      }
  }
  if (!opts.length) return false;
  const t = pickOne(opts);
  w.tx = tileX(t) + (rnd() - 0.5) * 0.8;
  w.tz = tileZ(t) + (rnd() - 0.5) * 0.8;
  return true;
}

function spawnWalkers(habitat: Habitat, count: number, speed: number) {
  const tiles = Array.from({ length: N * N }, (_, i) => i).filter(habitat);
  return Array.from({ length: tiles.length ? count : 0 }, () => {
    const t = pickOne(tiles);
    const w: Walker = {
      x: tileX(t) + (rnd() - 0.5) * 0.8,
      z: tileZ(t) + (rnd() - 0.5) * 0.8,
      tx: 0,
      tz: 0,
      speed: speed * (0.6 + rnd() * 0.8),
      phase: rnd() * 10,
      y: 0,
    };
    w.tx = w.x;
    w.tz = w.z;
    return w;
  });
}

/** Moves a walker toward its target, bending its path around disturbances. */
function stepWalker(
  w: Walker,
  dt: number,
  now: number,
  bus: WorldBus,
  habitat: Habitat,
  skittish = 1,
) {
  let vx = w.tx - w.x;
  let vz = w.tz - w.z;
  const d = Math.hypot(vx, vz);
  if (d < 0.05) {
    if (rnd() < dt * 2) retarget(w, habitat);
    vx = 0;
    vz = 0;
  } else {
    vx = (vx / d) * w.speed;
    vz = (vz / d) * w.speed;
  }
  w.y = 0;
  for (const s of bus.disturbances) {
    if (now < s.start || now > s.until) continue;
    const dx = w.x - s.x;
    const dz = w.z - s.z;
    const r = Math.hypot(dx, dz) || 0.001;
    if (s.mode === "flee" && r < s.radius * 2.2) {
      const push = (1 - r / (s.radius * 2.2)) * 2.4 * skittish;
      vx += (dx / r) * push;
      vz += (dz / r) * push;
    } else if (s.mode === "gather" && r < s.radius * 4) {
      const ring = s.radius * 1.1;
      const pull = r > ring ? -0.7 : 0.4;
      vx += (dx / r) * pull;
      vz += (dz / r) * pull;
    } else if (s.mode === "celebrate" && r < s.radius * 3) {
      w.y = Math.abs(Math.sin(now * 9 + w.phase)) * 0.12;
    }
  }
  const nx = w.x + vx * dt;
  const nz = w.z + vz * dt;
  const t = worldToTile(nx, nz);
  if (t >= 0 && habitat(t)) {
    w.x = nx;
    w.z = nz;
  } else retarget(w, habitat);
  return Math.hypot(vx, vz);
}

interface Bird {
  p: THREE.Vector3;
  v: THREE.Vector3;
}

// ---------------------------------------------------------------------------

export function Life({ city, bus }: { city: CityState; bus: WorldBus }) {
  const grid = city.grid;
  const graph = useMemo(() => roadNeighbors(grid), [grid]);
  const pop = city.stats.population;
  const nature = natureScore(grid, city.stats.pollution);

  const carCount = Math.round(Math.min(170, Math.max(40, pop / 7000)));
  const cars = useVehicles(grid, graph, carCount, 1.6, CAR_COLORS);
  const bikes = useVehicles(grid, graph, Math.round(carCount * 0.5), 2.3, BIKE_COLORS);
  const buses = useVehicles(grid, graph, 10, 1.1, ["#d63a2f", "#f4f4f4"]);
  const special = useRef<Vehicle[]>([]);

  const walkerCount = Math.round(Math.min(320, Math.max(80, pop / 4000)));
  const walkers = useRef<Walker[]>([]);
  const walkerColors = useRef<THREE.Color[]>([]);
  const walkerSkinColors = useRef<THREE.Color[]>([]);
  useEffect(() => {
    walkers.current = spawnWalkers(walkable, walkerCount, 0.35);
    walkerColors.current = walkers.current.map(() =>
      new THREE.Color().setHSL(rnd(), 0.55, 0.35 + rnd() * 0.35),
    );
    const skin = ["#f0c6a0", "#d7a47b", "#b77c58", "#8b5b42"];
    walkerSkinColors.current = walkers.current.map(() => new THREE.Color(pickOne(skin)));
    // Re-spawn only when the crowd size changes; walkers re-route themselves.
  }, [walkerCount]);

  const gridRef = useRef(grid);
  gridRef.current = grid;
  const walkable: Habitat = (i) => isWalkable(gridRef.current[i]);
  const isGreen: Habitat = (i) => {
    const t = gridRef.current[i];
    return (t.kind === "forest" || t.kind === "park") && t.fire === 0;
  };
  const monkeyCount = Math.round(Math.min(30, Math.max(3, nature / 3)));
  const monkeys = useRef<Walker[]>([]);
  useEffect(() => {
    monkeys.current = spawnWalkers(isGreen, monkeyCount, 0.5);
  }, [monkeyCount]);

  const riverbank = useMemo(() => {
    const bank = new Set<number>();
    grid.forEach((t, i) => {
      if (t.kind === "water") return;
      const x = i % N;
      const y = Math.floor(i / N);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < N && ny < N && grid[ny * N + nx].kind === "water")
          bank.add(i);
      }
    });
    return bank;
  }, [grid]);
  const isBank: Habitat = (i) => riverbank.has(i);
  const lizards = useRef<Walker[]>([]);
  useEffect(() => {
    const tiles = [...riverbank];
    lizards.current = Array.from({ length: Math.min(8, tiles.length) }, () => {
      const t = pickOne(tiles);
      return {
        x: tileX(t),
        z: tileZ(t),
        tx: tileX(t),
        tz: tileZ(t),
        speed: 0.12,
        phase: rnd() * 6,
        y: 0,
      };
    });
  }, [riverbank]);

  const birds = useRef<Bird[][]>(
    Array.from({ length: 3 }, (_, f) =>
      Array.from({ length: 14 }, () => ({
        p: new THREE.Vector3((f - 1) * 8 + rnd() * 2, 4 + rnd(), rnd() * 4 - 2),
        v: new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize().multiplyScalar(1.5),
      })),
    ),
  );

  // --- meshes ---------------------------------------------------------------
  const carMesh = useRef<THREE.InstancedMesh>(null);
  const carRoofMesh = useRef<THREE.InstancedMesh>(null);
  const carGlassMesh = useRef<THREE.InstancedMesh>(null);
  const carWheelMesh = useRef<THREE.InstancedMesh>(null);
  const bikeMesh = useRef<THREE.InstancedMesh>(null);
  const bikeWheelMesh = useRef<THREE.InstancedMesh>(null);
  const busMesh = useRef<THREE.InstancedMesh>(null);
  const busGlassMesh = useRef<THREE.InstancedMesh>(null);
  const busWheelMesh = useRef<THREE.InstancedMesh>(null);
  const specialMesh = useRef<THREE.InstancedMesh>(null);
  const beaconMesh = useRef<THREE.InstancedMesh>(null);
  const lightMesh = useRef<THREE.InstancedMesh>(null);
  const walkerMesh = useRef<THREE.InstancedMesh>(null);
  const walkerHeadMesh = useRef<THREE.InstancedMesh>(null);
  const walkerHairMesh = useRef<THREE.InstancedMesh>(null);
  const walkerBagMesh = useRef<THREE.InstancedMesh>(null);
  const monkeyMesh = useRef<THREE.InstancedMesh>(null);
  const lizardMesh = useRef<THREE.InstancedMesh>(null);
  const birdMesh = useRef<THREE.InstancedMesh>(null);
  const birdGeo = useMemo(() => new THREE.ConeGeometry(0.06, 0.16, 3).rotateX(Math.PI / 2), []);

  const spawnSpecial = (req: SpawnRequest) => {
    const roads = [...graph.keys()];
    if (!roads.length) return;
    const target = roads.reduce((best, i) =>
      Math.hypot(tileX(i) - req.x, tileZ(i) - req.z) <
      Math.hypot(tileX(best) - req.x, tileZ(best) - req.z)
        ? i
        : best,
    );
    const far = roads.filter((i) => Math.hypot(tileX(i) - req.x, tileZ(i) - req.z) > 9);
    for (let k = 0; k < req.count; k++) {
      const start = pickOne(far.length ? far : roads);
      const path = bfsPath(graph, start, target);
      if (!path || path.length < 2) continue;
      special.current.push({
        from: path[0],
        to: path[1],
        t: -k * 0.8, // stagger departures
        speed: 2.6,
        color: new THREE.Color(req.color),
        path,
        step: 1,
        until: req.until,
        flashing: req.flashing,
        size: req.size,
      });
    }
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = state.clock.elapsedTime;
    bus.now = now;
    const night = env.night;
    const jam = (city.stats.chaos > 50 ? 0.45 : 1) * (env.raining ? 0.75 : 1);

    while (bus.spawns.length) spawnSpecial(bus.spawns.shift()!);
    bus.disturbances = bus.disturbances.filter((d) => d.until > now);

    // Ordinary traffic.
    const drawTraffic = (
      mesh: THREE.InstancedMesh | null,
      list: Vehicle[],
      scale: [number, number, number],
      lightOffset: number,
      lightStart: number,
      vehicleKind: "car" | "bike" | "bus",
    ) => {
      if (!mesh) return lightStart;
      let l = lightStart;
      const partMeshes =
        vehicleKind === "car"
          ? [carRoofMesh.current, carGlassMesh.current, carWheelMesh.current]
          : vehicleKind === "bike"
            ? [bikeWheelMesh.current]
            : [busGlassMesh.current, busWheelMesh.current];
      const visible = night ? Math.ceil(list.length * 0.55) : list.length;
      list.forEach((v, k) => {
        if (k >= visible) {
          mesh.setMatrixAt(k, HIDDEN);
          if (vehicleKind === "car") {
            carRoofMesh.current?.setMatrixAt(k, HIDDEN);
            carGlassMesh.current?.setMatrixAt(k, HIDDEN);
            for (let wheel = 0; wheel < 4; wheel++)
              carWheelMesh.current?.setMatrixAt(k * 4 + wheel, HIDDEN);
          } else if (vehicleKind === "bike") {
            for (let wheel = 0; wheel < 2; wheel++)
              bikeWheelMesh.current?.setMatrixAt(k * 2 + wheel, HIDDEN);
          } else {
            busGlassMesh.current?.setMatrixAt(k, HIDDEN);
            for (let wheel = 0; wheel < 4; wheel++)
              busWheelMesh.current?.setMatrixAt(k * 4 + wheel, HIDDEN);
          }
          return;
        }
        if (v.from === v.to) stepVehicle(v, 1, grid, graph, 1);
        stepVehicle(v, dt, grid, graph, jam);
        const yaw = lanePosition(v, tmpP);
        tmpQ.setFromAxisAngle(UP, yaw);
        tmpS.set(...scale);
        tmpM.compose(tmpP, tmpQ, tmpS);
        mesh.setMatrixAt(k, tmpM);
        mesh.setColorAt(k, v.color);
        detailBaseP.copy(tmpP);
        detailBaseQ.copy(tmpQ);
        if (vehicleKind === "car") {
          setVehiclePart(carRoofMesh.current, k, [0, 0.045, -0.005], [0.075, 0.038, 0.13]);
          carRoofMesh.current?.setColorAt(k, v.color);
          setVehiclePart(carGlassMesh.current, k, [0, 0.065, -0.005], [0.066, 0.025, 0.11]);
          const wheels = [
            [-0.052, -0.022, -0.068],
            [0.052, -0.022, -0.068],
            [-0.052, -0.022, 0.068],
            [0.052, -0.022, 0.068],
          ] as const;
          wheels.forEach((offset, wheel) =>
            setVehiclePart(
              carWheelMesh.current,
              k * 4 + wheel,
              [...offset],
              [0.034, 0.022, 0.034],
              WHEEL_AXLE,
            ),
          );
        } else if (vehicleKind === "bike") {
          [-0.042, 0.042].forEach((z, wheel) =>
            setVehiclePart(
              bikeWheelMesh.current,
              k * 2 + wheel,
              [0, -0.02, z],
              [0.06, 0.018, 0.06],
              WHEEL_AXLE,
            ),
          );
        } else {
          setVehiclePart(busGlassMesh.current, k, [0, 0.025, -0.015], [0.137, 0.072, 0.31]);
          const wheels = [
            [-0.067, -0.035, -0.15],
            [0.067, -0.035, -0.15],
            [-0.067, -0.035, 0.15],
            [0.067, -0.035, 0.15],
          ] as const;
          wheels.forEach((offset, wheel) =>
            setVehiclePart(
              busWheelMesh.current,
              k * 4 + wheel,
              [...offset],
              [0.048, 0.03, 0.048],
              WHEEL_AXLE,
            ),
          );
        }
        if (night && lightMesh.current && l < 400) {
          tmpP.x += Math.sin(yaw) * lightOffset;
          tmpP.z += Math.cos(yaw) * lightOffset;
          tmpP.y = 0.08;
          tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
          lightMesh.current.setMatrixAt(l++, tmpM);
        }
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      for (const part of partMeshes) {
        if (!part) continue;
        part.count =
          vehicleKind === "car"
            ? part === carWheelMesh.current
              ? list.length * 4
              : list.length
            : vehicleKind === "bike"
              ? list.length * 2
              : part === busWheelMesh.current
                ? list.length * 4
                : list.length;
        part.instanceMatrix.needsUpdate = true;
        if (part.instanceColor) part.instanceColor.needsUpdate = true;
      }
      return l;
    };
    let lights = 0;
    lights = drawTraffic(carMesh.current, cars.current, [1, 1, 1], 0.12, lights, "car");
    lights = drawTraffic(bikeMesh.current, bikes.current, [1, 1, 1], 0.07, lights, "bike");
    lights = drawTraffic(busMesh.current, buses.current, [1, 1, 1], 0.21, lights, "bus");
    if (lightMesh.current) {
      lightMesh.current.count = lights;
      lightMesh.current.instanceMatrix.needsUpdate = true;
    }

    // Emergency services and convoys follow their route, then park.
    special.current = special.current.filter((v) => (v.until ?? 0) > now);
    special.current.forEach((v, k) => {
      if (v.t < 0) v.t += dt;
      else if (v.path && v.step! < v.path.length) {
        v.t += dt * v.speed;
        while (v.t >= 1 && v.step! < v.path.length - 1) {
          v.t -= 1;
          v.step!++;
          v.from = v.path[v.step! - 1];
          v.to = v.path[v.step!];
        }
        if (v.step === v.path.length - 1 && v.t > 1) v.t = 1;
      }
      const yaw = lanePosition(v, tmpP);
      const s = v.size ?? 1;
      tmpQ.setFromAxisAngle(UP, yaw);
      tmpM.compose(tmpP, tmpQ, tmpS.set(s, s, s));
      specialMesh.current?.setMatrixAt(k, v.t < 0 ? HIDDEN : tmpM);
      specialMesh.current?.setColorAt(k, v.color);
      tmpP.y += 0.12 * s;
      tmpM.compose(tmpP, tmpQ, tmpS.set(s, s, s));
      beaconMesh.current?.setMatrixAt(k, v.t < 0 || !v.flashing ? HIDDEN : tmpM);
      beaconMesh.current?.setColorAt(
        k,
        tmpC.set(Math.floor(now * 6 + k) % 2 ? "#ff2a2a" : "#2a6bff"),
      );
    });
    for (const m of [specialMesh.current, beaconMesh.current]) {
      if (!m) continue;
      m.count = special.current.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // People.
    const wm = walkerMesh.current;
    if (wm) {
      const visible = night ? Math.ceil(walkers.current.length * 0.35) : walkers.current.length;
      walkers.current.forEach((w, k) => {
        if (k >= visible) {
          wm.setMatrixAt(k, HIDDEN);
          walkerHeadMesh.current?.setMatrixAt(k, HIDDEN);
          walkerHairMesh.current?.setMatrixAt(k, HIDDEN);
          walkerBagMesh.current?.setMatrixAt(k, HIDDEN);
          return;
        }
        const sp = stepWalker(w, dt, now, bus, walkable, 1);
        const bob = sp > 0.05 ? Math.abs(Math.sin(now * 10 * sp + w.phase)) * 0.02 : 0;
        tmpP.set(w.x, 0.1 + w.y + bob, w.z);
        tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(1.4, 1.4, 1.4));
        wm.setMatrixAt(k, tmpM);
        detailBaseP.copy(tmpP);
        detailBaseQ.identity();
        setVehiclePart(walkerHeadMesh.current, k, [0, 0.118, 0.003], [0.075, 0.075, 0.075]);
        setVehiclePart(walkerHairMesh.current, k, [0, 0.151, 0.005], [0.077, 0.033, 0.077]);
        if (k % 4 === 0)
          setVehiclePart(walkerBagMesh.current, k, [0, 0.065, -0.047], [0.045, 0.06, 0.025]);
        else walkerBagMesh.current?.setMatrixAt(k, HIDDEN);
        const c = walkerColors.current[k];
        if (c) wm.setColorAt(k, c);
        const skin = walkerSkinColors.current[k];
        if (skin) walkerHeadMesh.current?.setColorAt(k, skin);
        if (c) walkerBagMesh.current?.setColorAt(k, c);
      });
      wm.count = walkers.current.length;
      wm.instanceMatrix.needsUpdate = true;
      if (wm.instanceColor) wm.instanceColor.needsUpdate = true;
      for (const part of [walkerHeadMesh.current, walkerHairMesh.current, walkerBagMesh.current]) {
        if (!part) continue;
        part.count = walkers.current.length;
        part.instanceMatrix.needsUpdate = true;
        if (part.instanceColor) part.instanceColor.needsUpdate = true;
      }
    }

    // Macaques hop between trees; monitor lizards patrol the riverbanks.
    const mm = monkeyMesh.current;
    if (mm) {
      monkeys.current.forEach((w, k) => {
        const sp = stepWalker(w, dt, now, bus, isGreen, 1.5);
        const hop = sp > 0.05 ? Math.abs(Math.sin(now * 7 + w.phase)) * 0.12 : 0;
        tmpP.set(w.x, 0.05 + hop, w.z);
        tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(1, 1, 1));
        mm.setMatrixAt(k, tmpM);
      });
      mm.count = monkeys.current.length;
      mm.instanceMatrix.needsUpdate = true;
    }
    const lm = lizardMesh.current;
    if (lm) {
      lizards.current.forEach((w, k) => {
        stepWalker(w, dt, now, bus, isBank, 1);
        const yaw = Math.atan2(w.tx - w.x, w.tz - w.z);
        tmpP.set(w.x, 0.02, w.z);
        tmpQ.setFromAxisAngle(UP, yaw + Math.sin(now * 6 + w.phase) * 0.2);
        tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
        lm.setMatrixAt(k, tmpM);
      });
      lm.count = lizards.current.length;
      lm.instanceMatrix.needsUpdate = true;
    }

    // Birds flock by day and scatter from anything alarming.
    const bm = birdMesh.current;
    if (bm) {
      let k = 0;
      const centre = new THREE.Vector3();
      const avg = new THREE.Vector3();
      for (const flock of birds.current) {
        centre.set(0, 0, 0);
        avg.set(0, 0, 0);
        flock.forEach((b) => {
          centre.add(b.p);
          avg.add(b.v);
        });
        centre.divideScalar(flock.length);
        avg.divideScalar(flock.length);
        for (const b of flock) {
          const steer = new THREE.Vector3()
            .addScaledVector(new THREE.Vector3().subVectors(centre, b.p), 0.25)
            .addScaledVector(new THREE.Vector3().subVectors(avg, b.v), 0.4);
          for (const o of flock) {
            if (o === b) continue;
            const d = b.p.distanceTo(o.p);
            if (d < 0.5)
              steer.addScaledVector(new THREE.Vector3().subVectors(b.p, o.p), (0.5 - d) * 4);
          }
          if (Math.abs(b.p.x) > 13) steer.x -= Math.sign(b.p.x) * 1.5;
          if (Math.abs(b.p.z) > 13) steer.z -= Math.sign(b.p.z) * 1.5;
          steer.y += (4.5 - b.p.y) * 0.6;
          for (const s of bus.disturbances) {
            if (now - s.start > 4 || now < s.start) continue;
            const away = new THREE.Vector3(b.p.x - s.x, 0.5, b.p.z - s.z);
            const r = away.length();
            if (r < s.radius * 4) steer.addScaledVector(away.normalize(), 6);
          }
          steer.x += (rnd() - 0.5) * 0.8;
          steer.z += (rnd() - 0.5) * 0.8;
          b.v.addScaledVector(steer, dt);
          const sp = b.v.length();
          if (sp > 3) b.v.multiplyScalar(3 / sp);
          if (sp < 1.2) b.v.multiplyScalar(1.2 / Math.max(sp, 0.01));
          b.p.addScaledVector(b.v, dt);
          if (night) {
            bm.setMatrixAt(k++, HIDDEN);
            continue;
          }
          tmpQ.setFromUnitVectors(FWD, tmpP.copy(b.v).normalize());
          const flap = 1 + Math.sin(now * 22 + k) * 0.5;
          tmpM.compose(b.p, tmpQ, tmpS.set(flap, 1, 1));
          bm.setMatrixAt(k++, tmpM);
        }
      }
      bm.count = k;
      bm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={carMesh}
        args={[undefined, undefined, 200]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.12, 0.08, 0.22]} />
        <meshStandardMaterial roughness={0.4} metalness={0.3} />
      </instancedMesh>
      <instancedMesh
        ref={carRoofMesh}
        args={[undefined, undefined, 200]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.075, 0.038, 0.13]} />
        <meshStandardMaterial roughness={0.38} metalness={0.24} />
      </instancedMesh>
      <instancedMesh ref={carGlassMesh} args={[undefined, undefined, 200]} frustumCulled={false}>
        <boxGeometry args={[0.066, 0.025, 0.11]} />
        <meshStandardMaterial color="#32414a" roughness={0.22} metalness={0.12} />
      </instancedMesh>
      <instancedMesh ref={carWheelMesh} args={[undefined, undefined, 800]} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 1, 12]} />
        <meshStandardMaterial color="#202225" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={bikeMesh} args={[undefined, undefined, 120]} frustumCulled={false}>
        <boxGeometry args={[0.04, 0.08, 0.12]} />
        <meshStandardMaterial roughness={0.65} />
      </instancedMesh>
      <instancedMesh ref={bikeWheelMesh} args={[undefined, undefined, 240]} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 1, 12]} />
        <meshStandardMaterial color="#17191b" roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={busMesh}
        args={[undefined, undefined, 16]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.15, 0.14, 0.42]} />
        <meshStandardMaterial roughness={0.65} />
      </instancedMesh>
      <instancedMesh ref={busGlassMesh} args={[undefined, undefined, 16]} frustumCulled={false}>
        <boxGeometry args={[0.137, 0.072, 0.31]} />
        <meshStandardMaterial color="#263d4b" roughness={0.2} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={busWheelMesh} args={[undefined, undefined, 64]} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 1, 12]} />
        <meshStandardMaterial color="#202225" roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={specialMesh}
        args={[undefined, undefined, 64]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.15, 0.12, 0.3]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={beaconMesh} args={[undefined, undefined, 64]} frustumCulled={false}>
        <boxGeometry args={[0.1, 0.035, 0.05]} />
        <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0.9} />
      </instancedMesh>
      <instancedMesh ref={lightMesh} args={[undefined, undefined, 400]} frustumCulled={false}>
        <boxGeometry args={[0.09, 0.025, 0.02]} />
        <meshBasicMaterial color="#fff2b0" />
      </instancedMesh>
      <instancedMesh
        ref={walkerMesh}
        args={[undefined, undefined, 340]}
        castShadow
        frustumCulled={false}
      >
        <capsuleGeometry args={[0.028, 0.07, 2, 5]} />
        <meshStandardMaterial roughness={0.65} />
      </instancedMesh>
      <instancedMesh
        ref={walkerHeadMesh}
        args={[undefined, undefined, 340]}
        castShadow
        frustumCulled={false}
      >
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={walkerHairMesh} args={[undefined, undefined, 340]} frustumCulled={false}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial color="#26211e" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={walkerBagMesh}
        args={[undefined, undefined, 340]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh
        ref={monkeyMesh}
        args={[undefined, undefined, 40]}
        castShadow
        frustumCulled={false}
      >
        <dodecahedronGeometry args={[0.05, 0]} />
        <meshStandardMaterial color="#8a6a45" flatShading />
      </instancedMesh>
      <instancedMesh ref={lizardMesh} args={[undefined, undefined, 10]} frustumCulled={false}>
        <boxGeometry args={[0.05, 0.025, 0.22]} />
        <meshStandardMaterial color="#4f5a3a" flatShading />
      </instancedMesh>
      <instancedMesh ref={birdMesh} args={[birdGeo, undefined, 60]} frustumCulled={false}>
        <meshStandardMaterial color="#222222" flatShading />
      </instancedMesh>
    </group>
  );
}
