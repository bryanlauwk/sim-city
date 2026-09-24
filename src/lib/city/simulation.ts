import { districtAt, klTerrain } from "./kl";
import {
  GRID_SIZE,
  SCALE_COST,
  type BuildKind,
  type CityState,
  type EventRecord,
  type EventResult,
  type Landmark,
  type Stats,
  type Tile,
  type TileKind,
  type TileOp,
  type TileTarget,
} from "./types";

const N = GRID_SIZE;
const CENTER = (N - 1) / 2;

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32). The state lives on CityState so a city can
// be replayed exactly from its seed and event log.
// ---------------------------------------------------------------------------

function rand(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randInt(s: { rng: number }, max: number): number {
  return Math.floor(rand(s) * max);
}

function pick<T>(s: { rng: number }, items: readonly T[]): T {
  return items[randInt(s, items.length)];
}

function shuffle<T>(s: { rng: number }, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

export const idx = (x: number, y: number) => y * N + x;
export const xy = (i: number) => ({ x: i % N, y: Math.floor(i / N) });

const NEIGHBORS: number[][] = Array.from({ length: N * N }, (_, i) => {
  const { x, y } = xy(i);
  const out: number[] = [];
  if (x > 0) out.push(idx(x - 1, y));
  if (x < N - 1) out.push(idx(x + 1, y));
  if (y > 0) out.push(idx(x, y - 1));
  if (y < N - 1) out.push(idx(x, y + 1));
  return out;
});
export const neighbors = (i: number) => NEIGHBORS[i];

function distToCenter(i: number): number {
  const { x, y } = xy(i);
  return Math.hypot(x - CENTER, y - CENTER);
}

const BUILDINGS: TileKind[] = ["house", "shop", "tower", "park", "landmark"];
export const isBuilding = (t: Tile) => BUILDINGS.includes(t.kind);
const isOccupied = (t: Tile) => t.kind === "house" || t.kind === "shop" || t.kind === "tower";

const VARIANTS: Partial<Record<TileKind, number>> = {
  house: 8,
  shop: 8,
  tower: 5,
  park: 4,
  forest: 4,
  rubble: 3,
};

function setKind(s: CityState, i: number, kind: TileKind, landmark?: Landmark) {
  s.grid[i] = {
    kind,
    variant: randInt(s, VARIANTS[kind] ?? 1),
    fire: 0,
    flood: 0,
    builtDay: s.day,
    ...(landmark ? { landmark } : {}),
  };
}

export function countKinds(grid: Tile[]): Record<TileKind, number> {
  const c: Record<TileKind, number> = {
    empty: 0,
    road: 0,
    house: 0,
    shop: 0,
    tower: 0,
    park: 0,
    forest: 0,
    rubble: 0,
    water: 0,
    landmark: 0,
  };
  for (const t of grid) c[t.kind]++;
  return c;
}

/** 0–100: how green and alive the city is. Derived, not stored. */
export function natureScore(grid: Tile[], pollution: number): number {
  const c = countKinds(grid);
  const land = grid.length - c.water;
  const green = (c.forest + c.park * 0.7) / Math.max(1, land);
  return Math.round(Math.min(100, Math.max(0, green * 750 - pollution * 0.3)));
}

const nearRoad = (s: CityState, i: number) => NEIGHBORS[i].some((n) => s.grid[n].kind === "road");
const nearBuilt = (s: CityState, i: number) => NEIGHBORS[i].some((n) => isOccupied(s.grid[n]));

function capacity(c: Record<TileKind, number>): number {
  return c.house * 1500 + c.shop * 400 + c.tower * 9000;
}

function pickKind(s: CityState, i: number): TileKind {
  const { mix } = districtAt(i);
  const total = mix.house + mix.shop + mix.tower || 1;
  const r = rand(s) * total;
  if (r < mix.tower) return "tower";
  if (r < mix.tower + mix.shop) return "shop";
  return "house";
}

// ---------------------------------------------------------------------------
// City creation
// ---------------------------------------------------------------------------

export function createCity(seed: number): CityState {
  const { kinds, landmarks } = klTerrain();
  const s: CityState = {
    version: 2,
    name: "Kuala Lumpur",
    seed,
    rng: seed | 0,
    day: 0,
    grid: kinds.map((kind, i) => ({
      kind,
      variant: 0,
      fire: 0,
      flood: 0,
      builtDay: 0,
      ...(landmarks.has(i) ? { landmark: landmarks.get(i) } : {}),
    })),
    stats: { population: 0, happiness: 60, money: 5_000_000, pollution: 20, chaos: 0 },
    ongoing: [],
    scheduled: [],
    bulletins: [],
    log: [],
    collapsed: false,
  };

  for (let i = 0; i < s.grid.length; i++) {
    const t = s.grid[i];
    if (VARIANTS[t.kind]) t.variant = randInt(s, VARIANTS[t.kind]!);
    if (t.kind !== "empty") continue;
    const d = districtAt(i);
    if (d.protected) {
      t.kind = "forest";
      t.variant = randInt(s, 4);
      continue;
    }
    const road = nearRoad(s, i);
    if (rand(s) < d.density * (road ? 1 : 0.55)) setKind(s, i, pickKind(s, i));
    else if (d.id === "outskirts" && !road && rand(s) < 0.12) setKind(s, i, "forest");
  }

  s.stats.population = capacity(countKinds(s.grid));
  return s;
}

// ---------------------------------------------------------------------------
// Daily tick
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function clampStats(st: Stats) {
  st.population = Math.max(0, Math.round(st.population));
  st.money = Math.round(st.money);
  st.happiness = clamp(st.happiness, 0, 100);
  st.pollution = clamp(st.pollution, 0, 100);
  st.chaos = clamp(st.chaos, 0, 100);
}

function addStats(st: Stats, d: Stats) {
  for (const k of Object.keys(st) as (keyof Stats)[]) st[k] += d[k];
}

function cloneState(prev: CityState): CityState {
  return {
    ...prev,
    grid: prev.grid.map((t) => ({ ...t })),
    stats: { ...prev.stats },
    ongoing: prev.ongoing.map((o) => ({ ...o })),
    scheduled: [...prev.scheduled],
    bulletins: [...prev.bulletins],
    log: [...prev.log],
  };
}

export function tick(prev: CityState): CityState {
  if (prev.collapsed) return prev;
  const s = cloneState(prev);
  s.day += 1;
  const st = s.stats;

  // Ongoing effects from earlier events.
  for (const eff of s.ongoing) {
    addStats(st, eff.perDay);
    eff.daysLeft -= 1;
  }
  s.ongoing = s.ongoing.filter((e) => e.daysLeft > 0);

  // Chain reactions scheduled by earlier events.
  const due = s.scheduled.filter((f) => f.day <= s.day);
  if (due.length) {
    s.scheduled = s.scheduled.filter((f) => f.day > s.day);
    for (const f of due) {
      addStats(st, f.stat_changes);
      for (const op of f.tile_ops.slice(0, 4)) applyOp(s, op);
      s.bulletins.push({ day: s.day, text: f.note, source: f.source });
    }
  }

  // Fire spreads, then burns out into rubble.
  const burning = s.grid.map((t, i) => (t.fire > 0 ? i : -1)).filter((i) => i >= 0);
  for (const i of burning) {
    const t = s.grid[i];
    if (rand(s) < 0.12 + st.chaos / 400) {
      const n = pick(s, NEIGHBORS[i]);
      const nt = s.grid[n];
      if ((isBuilding(nt) || nt.kind === "forest") && nt.fire === 0) nt.fire = 3;
    }
    t.fire -= 1;
    if (t.fire === 0) setKind(s, i, "rubble");
  }

  // Floods recede, occasionally taking a building with them.
  for (let i = 0; i < s.grid.length; i++) {
    const t = s.grid[i];
    if (t.flood <= 0) continue;
    t.flood -= 1;
    if (isOccupied(t) && rand(s) < 0.06) setKind(s, i, "rubble");
  }

  // Rubble gets cleared; abandoned land slowly turns back into forest.
  for (let i = 0; i < s.grid.length; i++) {
    const t = s.grid[i];
    if (t.kind === "rubble" && s.day - t.builtDay >= 5 && rand(s) < 0.3) setKind(s, i, "empty");
    else if (t.kind === "empty" && s.day - t.builtDay > 30 && rand(s) < 0.004 && !nearRoad(s, i))
      setKind(s, i, "forest");
  }

  // Growth: the city builds itself when people are happy and it isn't broke.
  const lots: number[] = [];
  for (let i = 0; i < s.grid.length; i++) {
    const t = s.grid[i];
    if (t.kind === "empty" && t.flood === 0 && (nearRoad(s, i) || nearBuilt(s, i))) lots.push(i);
  }
  const attempts = 2 + Math.floor(st.happiness / 20);
  const growthChance = ((0.6 * st.happiness) / 60) * (st.money > -2_000_000 ? 1 : 0.3);
  for (let a = 0; a < attempts && lots.length; a++) {
    if (rand(s) >= growthChance) continue;
    // Prefer busy districts and lots on a road.
    let best = -1;
    let bestScore = -1;
    for (let k = 0; k < 6; k++) {
      const i = lots[randInt(s, lots.length)];
      const score = districtAt(i).density + (nearRoad(s, i) ? 0.3 : 0) + rand(s) * 0.4;
      if (score > bestScore) [best, bestScore] = [i, score];
    }
    lots.splice(lots.indexOf(best), 1);
    const kind: TileKind = st.pollution > 55 && rand(s) < 0.25 ? "park" : pickKind(s, best);
    setKind(s, best, kind);
  }

  // Sprawl: when land runs short, forest at the edge of town gets cleared.
  if (lots.length < 25 && st.happiness > 35 && rand(s) < 0.5) {
    const edge = s.grid
      .map((t, i) => i)
      .filter(
        (i) =>
          s.grid[i].kind === "forest" &&
          !districtAt(i).protected &&
          (nearRoad(s, i) || nearBuilt(s, i)),
      );
    if (edge.length) setKind(s, pick(s, edge), "empty");
  }

  // Redevelopment: old low-rise gets replaced by denser buildings.
  if (st.happiness > 35 && rand(s) < 0.35) {
    const i = randInt(s, s.grid.length);
    const t = s.grid[i];
    const { mix } = districtAt(i);
    if (t.kind === "house" && mix.shop + mix.tower > 0.3)
      setKind(s, i, rand(s) < mix.tower ? "tower" : "shop");
    else if (t.kind === "shop" && rand(s) < mix.tower) setKind(s, i, "tower");
  }

  // Greening: when the air gets bad, the council turns a block into a park.
  if (st.pollution > 45 && rand(s) < 0.2) {
    const i = randInt(s, s.grid.length);
    if (isOccupied(s.grid[i]) || s.grid[i].kind === "empty") setKind(s, i, "park");
  }

  // Misery: people abandon homes.
  if (st.happiness < 25 && rand(s) < 0.4) {
    const homes = s.grid.map((t, i) => i).filter((i) => isOccupied(s.grid[i]));
    if (homes.length) setKind(s, pick(s, homes), "rubble");
  }

  // Economy & mood.
  const c = countKinds(s.grid);
  const fires = s.grid.filter((t) => t.fire > 0).length;
  const floods = s.grid.filter((t) => t.flood > 0).length;
  const targetPop = capacity(c) * (0.5 + st.happiness / 200);
  st.population += (targetPop - st.population) * 0.12;

  const taxes = st.population * 0.1 + c.shop * 600 + c.tower * 2000;
  const upkeep = c.road * 200 + c.park * 400 + c.landmark * 1000;
  st.money += taxes - upkeep;

  const targetPollution =
    c.tower * 0.22 + c.shop * 0.08 + c.road * 0.04 + fires * 3 - c.park * 0.4 - c.forest * 0.15;
  st.pollution += (targetPollution - st.pollution) * 0.1;

  const nature = natureScore(s.grid, st.pollution);
  const targetHappiness =
    52 +
    nature * 0.2 +
    Math.min(c.landmark, 10) * 0.6 -
    st.pollution * 0.35 -
    st.chaos * 0.3 -
    fires * 2 -
    floods * 0.5 -
    (st.money < 0 ? 12 : 0);
  st.happiness += (targetHappiness - st.happiness) * 0.08;
  st.chaos *= 0.93;
  clampStats(st);

  if (s.day > 5 && (c.house + c.shop + c.tower === 0 || st.population < 5)) s.collapsed = true;
  return s;
}

// ---------------------------------------------------------------------------
// Applying a typed event
// ---------------------------------------------------------------------------

const TARGET_KIND: Partial<Record<TileTarget, TileKind>> = {
  residential: "house",
  commercial: "shop",
  towers: "tower",
  parks: "park",
  forest: "forest",
  roads: "road",
  empty: "empty",
  landmarks: "landmark",
};

/** Tiles in the targeted area, best matches first. */
function targetTiles(s: CityState, target: TileTarget): number[] {
  const all = s.grid.map((_, i) => i).filter((i) => s.grid[i].kind !== "water");
  const kind = TARGET_KIND[target];
  if (kind)
    return shuffle(
      s,
      all.filter((i) => s.grid[i].kind === kind),
    );
  if (target === "center")
    return all
      .map((i) => [i, distToCenter(i) + rand(s) * 3] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([i]) => i);
  if (target === "edge")
    return shuffle(
      s,
      all.filter((i) => {
        const { x, y } = xy(i);
        return Math.min(x, y, N - 1 - x, N - 1 - y) <= 2;
      }),
    );
  if (target === "river")
    return shuffle(
      s,
      all.filter((i) => NEIGHBORS[i].some((n) => s.grid[n].kind === "water")),
    );
  if (target === "random") return shuffle(s, all);
  // A district name.
  const inDistrict = all.filter((i) => districtAt(i).id === target);
  return shuffle(s, inDistrict);
}

/** Buildable lots in (or next to) the targeted area. */
function buildLots(s: CityState, target: TileTarget): number[] {
  const free = (i: number) => ["empty", "rubble"].includes(s.grid[i].kind);
  const kind = TARGET_KIND[target];
  let lots: number[];
  if (kind && kind !== "empty") {
    const near = new Set<number>();
    s.grid.forEach((t, i) => {
      if (t.kind === kind) NEIGHBORS[i].filter(free).forEach((n) => near.add(n));
    });
    lots = shuffle(s, [...near]);
  } else {
    lots = targetTiles(s, target).filter(free);
  }
  return lots;
}

const DEFAULT_LANDMARK: Landmark = {
  name: "Monument",
  shape: "statue",
  color: "#c9a227",
  height: 1.5,
};

function applyOp(s: CityState, op: TileOp) {
  const max = op.op === "landmark" ? 2 : 30;
  const count = clamp(Math.round(op.count), 1, max);
  let tiles: number[] = [];

  switch (op.op) {
    case "destroy":
      tiles = targetTiles(s, op.target).filter(
        (i) => !["empty", "rubble"].includes(s.grid[i].kind),
      );
      tiles.slice(0, count).forEach((i) => setKind(s, i, "rubble"));
      break;
    case "burn":
      tiles = targetTiles(s, op.target).filter(
        (i) => (isBuilding(s.grid[i]) || s.grid[i].kind === "forest") && s.grid[i].fire === 0,
      );
      tiles.slice(0, count).forEach((i) => (s.grid[i].fire = 3 + randInt(s, 3)));
      break;
    case "flood":
      tiles = targetTiles(s, op.target);
      tiles.slice(0, count).forEach((i) => (s.grid[i].flood = 3 + randInt(s, 3)));
      break;
    case "clear":
      tiles = targetTiles(s, op.target).filter((i) => {
        const t = s.grid[i];
        return t.kind === "rubble" || t.fire > 0 || t.flood > 0;
      });
      tiles.slice(0, count).forEach((i) => {
        if (s.grid[i].kind === "rubble") setKind(s, i, "empty");
        s.grid[i].fire = 0;
        s.grid[i].flood = 0;
      });
      break;
    case "build": {
      const kind: BuildKind = op.build_kind ?? "house";
      buildLots(s, op.target)
        .slice(0, count)
        .forEach((i) => setKind(s, i, kind));
      break;
    }
    case "landmark": {
      const lm = op.landmark ?? DEFAULT_LANDMARK;
      let lots = buildLots(s, op.target);
      if (!lots.length) lots = targetTiles(s, op.target).filter((i) => s.grid[i].kind !== "road");
      lots.slice(0, count).forEach((i) => setKind(s, i, "landmark", lm));
      break;
    }
  }
}

const SCALE_CHAOS = { minor: 2, citywide: 6, apocalyptic: 15 };

export function applyEvent(prev: CityState, input: string, result: EventResult): CityState {
  const s = cloneState(prev);
  const st = s.stats;
  addStats(st, result.stat_changes);
  st.chaos += SCALE_CHAOS[result.scale];
  for (const op of result.tile_ops.slice(0, 6)) applyOp(s, op);
  if (result.ongoing) {
    s.ongoing.push({
      label: result.ongoing.label,
      daysLeft: clamp(Math.round(result.ongoing.duration_days), 1, 30),
      perDay: { ...result.ongoing.per_day },
    });
  }
  for (const f of result.followups.slice(0, 3)) {
    s.scheduled.push({
      ...f,
      day: s.day + clamp(Math.round(f.delay_days), 1, 10),
      source: result.headline,
    });
  }
  clampStats(st);
  s.log.push({ day: s.day, input, result });
  // An event can revive a collapsed city (e.g. "a thousand settlers arrive").
  const c = countKinds(s.grid);
  if (c.house + c.shop + c.tower > 0 && st.population >= 5) s.collapsed = false;
  return s;
}

/** Tiles whose look changed between two states — where the action is. */
export function changedTiles(a: CityState, b: CityState): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.grid.length; i++) {
    const p = a.grid[i];
    const q = b.grid[i];
    if (p.kind !== q.kind || p.fire !== q.fire || p.flood !== q.flood || p.builtDay !== q.builtDay)
      out.push(i);
  }
  return out;
}

/** Rebuilds a city exactly from its seed and event history. */
export function replay(seed: number, log: EventRecord[], finalDay: number): CityState {
  let s = createCity(seed);
  for (const ev of log) {
    while (s.day < ev.day && !s.collapsed) s = tick(s);
    s = applyEvent(s, ev.input, ev.result);
  }
  while (s.day < finalDay && !s.collapsed) s = tick(s);
  return s;
}

export const eventCost = (r: EventResult) => SCALE_COST[r.scale];
