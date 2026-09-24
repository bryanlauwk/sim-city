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
const ROAD_LINES = [2, 7, 12];

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

function neighbors(i: number): number[] {
  const { x, y } = xy(i);
  const out: number[] = [];
  if (x > 0) out.push(idx(x - 1, y));
  if (x < N - 1) out.push(idx(x + 1, y));
  if (y > 0) out.push(idx(x, y - 1));
  if (y < N - 1) out.push(idx(x, y + 1));
  return out;
}

function distToCenter(i: number): number {
  const { x, y } = xy(i);
  return Math.hypot(x - CENTER, y - CENTER);
}

const BUILDINGS: TileKind[] = ["house", "shop", "tower", "park", "landmark"];
export const isBuilding = (t: Tile) => BUILDINGS.includes(t.kind);

function blankTile(kind: TileKind, day = 0): Tile {
  return { kind, variant: 0, fire: 0, flood: 0, builtDay: day };
}

const VARIANTS: Partial<Record<TileKind, number>> = {
  house: 8,
  shop: 8,
  tower: 5,
  park: 2,
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
    rubble: 0,
    water: 0,
    landmark: 0,
  };
  for (const t of grid) c[t.kind]++;
  return c;
}

// ---------------------------------------------------------------------------
// City creation
// ---------------------------------------------------------------------------

const NAME_A = ["Port", "New", "East", "Lower", "Greater", "North", "Old", "Upper", "Saint"];
const NAME_B = [
  "Gridley",
  "Mulchford",
  "Boxborough",
  "Tarmac Falls",
  "Culvert",
  "Zoning",
  "Beigeville",
  "Permitton",
  "Cul-de-Sac",
  "Mediocria",
];

export function createCity(seed: number): CityState {
  const s: CityState = {
    version: 1,
    name: "",
    seed,
    rng: seed | 0,
    day: 0,
    grid: Array.from({ length: N * N }, () => blankTile("empty")),
    stats: { population: 0, happiness: 62, money: 1000, pollution: 8, chaos: 0 },
    ongoing: [],
    log: [],
    collapsed: false,
  };
  s.name = `${pick(s, NAME_A)} ${pick(s, NAME_B)}`;

  for (let i = 0; i < N * N; i++) {
    const { x, y } = xy(i);
    if (ROAD_LINES.includes(x) || ROAD_LINES.includes(y)) s.grid[i] = blankTile("road");
  }
  // A small lake in one corner.
  for (let y = 0; y < 2; y++)
    for (let x = N - 2; x < N; x++) s.grid[idx(x, y)] = blankTile("water");

  // Seed ~20 buildings around the middle, weighted towards the centre.
  const lots = s.grid
    .map((t, i) => i)
    .filter((i) => s.grid[i].kind === "empty" && nearRoad(s, i) && distToCenter(i) < 6)
    .sort((a, b) => distToCenter(a) - distToCenter(b) + (rand(s) - 0.5) * 3);
  lots.slice(0, 20).forEach((i, n) => {
    const d = distToCenter(i);
    const kind: TileKind = n < 2 ? "tower" : d < 3 ? "shop" : n % 7 === 0 ? "park" : "house";
    setKind(s, i, kind);
  });

  s.stats.population = capacity(countKinds(s.grid));
  return s;
}

function nearRoad(s: CityState, i: number): boolean {
  return neighbors(i).some((n) => s.grid[n].kind === "road");
}

function nearBuilding(s: CityState, i: number): boolean {
  return neighbors(i).some((n) => ["house", "shop", "tower"].includes(s.grid[n].kind));
}

function capacity(c: Record<TileKind, number>): number {
  return c.house * 12 + c.shop * 3 + c.tower * 60;
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

export function tick(prev: CityState): CityState {
  if (prev.collapsed) return prev;
  const s: CityState = structuredClone(prev);
  s.day += 1;
  const st = s.stats;

  // Ongoing effects from earlier events.
  for (const eff of s.ongoing) {
    for (const k of Object.keys(st) as (keyof Stats)[]) st[k] += eff.perDay[k];
    eff.daysLeft -= 1;
  }
  s.ongoing = s.ongoing.filter((e) => e.daysLeft > 0);

  // Fire spreads, then burns out into rubble.
  const burning = s.grid.map((t, i) => (t.fire > 0 ? i : -1)).filter((i) => i >= 0);
  for (const i of burning) {
    const t = s.grid[i];
    if (rand(s) < 0.12 + st.chaos / 400) {
      const n = pick(s, neighbors(i));
      if (isBuilding(s.grid[n]) && s.grid[n].fire === 0) s.grid[n].fire = 3;
    }
    t.fire -= 1;
    if (t.fire === 0) setKind(s, i, "rubble");
  }

  // Floods recede, occasionally taking a building with them.
  for (let i = 0; i < s.grid.length; i++) {
    const t = s.grid[i];
    if (t.flood <= 0) continue;
    t.flood -= 1;
    if (isBuilding(t) && t.kind !== "park" && rand(s) < 0.08) setKind(s, i, "rubble");
  }

  // Rubble eventually gets cleared.
  for (let i = 0; i < s.grid.length; i++) {
    const t = s.grid[i];
    if (t.kind === "rubble" && s.day - t.builtDay >= 6 && rand(s) < 0.25) setKind(s, i, "empty");
  }

  // Growth: the city builds itself when people are happy and it isn't broke.
  const attempts = 1 + Math.floor(st.happiness / 35);
  const growthChance = ((0.55 * st.happiness) / 60) * (st.money > -500 ? 1 : 0.3);
  for (let a = 0; a < attempts; a++) {
    if (rand(s) >= growthChance) continue;
    const lots = s.grid
      .map((t, i) => i)
      .filter(
        (i) =>
          s.grid[i].kind === "empty" &&
          s.grid[i].flood === 0 &&
          (nearRoad(s, i) || nearBuilding(s, i)),
      );
    if (!lots.length) {
      // Out of land: densify by replacing a house with a tower.
      const homes = s.grid.map((t, i) => i).filter((i) => s.grid[i].kind === "house");
      if (homes.length && st.happiness > 45 && rand(s) < 0.15) setKind(s, pick(s, homes), "tower");
      break;
    }
    // Prefer lots near the centre so the city grows outwards.
    lots.sort((p, q) => distToCenter(p) - distToCenter(q) + (rand(s) - 0.5) * 6);
    const i = lots[0];
    const busyNeighbour = neighbors(i).some((n) => ["shop", "tower"].includes(s.grid[n].kind));
    let kind: TileKind = "house";
    const r = rand(s);
    if (st.pollution > 45 && r < 0.2) kind = "park";
    else if (st.population > 500 && busyNeighbour && r < 0.2) kind = "tower";
    else if (r < 0.35) kind = "shop";
    setKind(s, i, kind);
  }

  // Misery: people abandon homes.
  if (st.happiness < 25 && rand(s) < 0.3) {
    const homes = s.grid.map((t, i) => i).filter((i) => s.grid[i].kind === "house");
    if (homes.length) setKind(s, pick(s, homes), "rubble");
  }

  // Economy & mood.
  const c = countKinds(s.grid);
  const fires = s.grid.filter((t) => t.fire > 0).length;
  const floods = s.grid.filter((t) => t.flood > 0).length;
  const cap = capacity(c);
  const targetPop = cap * (0.5 + st.happiness / 200);
  st.population += (targetPop - st.population) * 0.12;

  const taxes = st.population * 0.03 + c.shop * 4 + c.tower * 10;
  const upkeep = c.road * 0.5 + c.park * 1.5 + c.landmark * 3;
  st.money += taxes - upkeep;

  const targetPollution = c.tower * 3 + c.shop + c.road * 0.1 + fires * 4 - c.park * 2;
  st.pollution += (targetPollution - st.pollution) * 0.1;

  const targetHappiness =
    60 +
    c.park * 1.5 +
    c.landmark * 2 -
    st.pollution * 0.4 -
    st.chaos * 0.3 -
    fires * 3 -
    floods * 1 -
    (st.money < 0 ? 12 : 0);
  st.happiness += (targetHappiness - st.happiness) * 0.08;
  st.chaos *= 0.93;
  clampStats(st);

  const occupied = c.house + c.shop + c.tower;
  if (s.day > 5 && (occupied === 0 || st.population < 5)) s.collapsed = true;
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
      .map((i) => [i, distToCenter(i) + rand(s) * 2] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([i]) => i);
  if (target === "edge")
    return shuffle(
      s,
      all.filter((i) => {
        const { x, y } = xy(i);
        return Math.min(x, y, N - 1 - x, N - 1 - y) <= 1;
      }),
    );
  return shuffle(s, all);
}

/** Buildable lots in (or next to) the targeted area. */
function buildLots(s: CityState, target: TileTarget): number[] {
  const free = (i: number) => ["empty", "rubble"].includes(s.grid[i].kind);
  const kind = TARGET_KIND[target];
  let lots: number[];
  if (kind && kind !== "empty") {
    const near = new Set<number>();
    s.grid.forEach((t, i) => {
      if (t.kind === kind)
        neighbors(i)
          .filter(free)
          .forEach((n) => near.add(n));
    });
    lots = shuffle(s, [...near]);
  } else {
    lots = targetTiles(s, target).filter(free);
  }
  if (lots.length) return lots;
  return targetTiles(s, "center").filter(free);
}

const DEFAULT_LANDMARK: Landmark = {
  name: "Monument",
  shape: "statue",
  color: "#c9a227",
  height: 1.5,
};

function applyOp(s: CityState, op: TileOp) {
  const max = op.op === "landmark" ? 2 : 24;
  const count = clamp(Math.round(op.count), 1, max);
  let tiles: number[] = [];

  switch (op.op) {
    case "destroy":
      tiles = targetTiles(s, op.target).filter((i) => s.grid[i].kind !== "empty");
      tiles.slice(0, count).forEach((i) => setKind(s, i, "rubble"));
      break;
    case "burn":
      tiles = targetTiles(s, op.target).filter(
        (i) => isBuilding(s.grid[i]) && s.grid[i].fire === 0,
      );
      tiles.slice(0, count).forEach((i) => (s.grid[i].fire = 3 + randInt(s, 3)));
      break;
    case "flood":
      tiles = targetTiles(s, op.target);
      tiles.slice(0, count).forEach((i) => (s.grid[i].flood = 4 + randInt(s, 3)));
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
  const s: CityState = structuredClone(prev);
  const st = s.stats;
  for (const k of Object.keys(st) as (keyof Stats)[]) st[k] += result.stat_changes[k];
  st.chaos += SCALE_CHAOS[result.scale];
  for (const op of result.tile_ops.slice(0, 6)) applyOp(s, op);
  if (result.ongoing) {
    s.ongoing.push({
      label: result.ongoing.label,
      daysLeft: clamp(Math.round(result.ongoing.duration_days), 1, 30),
      perDay: { ...result.ongoing.per_day },
    });
  }
  clampStats(st);
  s.log.push({ day: s.day, input, result });
  // An event can revive a collapsed city (e.g. "a thousand settlers arrive").
  const c = countKinds(s.grid);
  if (c.house + c.shop + c.tower > 0 && st.population >= 5) s.collapsed = false;
  return s;
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
