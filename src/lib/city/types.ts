export const GRID_SIZE = 16;

export type TileKind =
  | "empty"
  | "road"
  | "house"
  | "shop"
  | "tower"
  | "park"
  | "rubble"
  | "water"
  | "landmark";

export type LandmarkShape =
  | "tower"
  | "dome"
  | "pyramid"
  | "statue"
  | "crater"
  | "blob"
  | "spire"
  | "arch";

export interface Landmark {
  name: string;
  shape: LandmarkShape;
  /** Hex colour, e.g. "#ff8800". */
  color: string;
  /** Relative height, 0.3 – 4 tiles. */
  height: number;
}

export interface Tile {
  kind: TileKind;
  /** Picks which model variant to render for buildings. */
  variant: number;
  /** Days of fire remaining; 0 = not burning. */
  fire: number;
  /** Days of flooding remaining; 0 = dry. */
  flood: number;
  /** Day the tile last changed — used for pop-in animations. */
  builtDay: number;
  landmark?: Landmark;
}

export interface Stats {
  population: number;
  /** 0 – 100 */
  happiness: number;
  money: number;
  /** 0 – 100 */
  pollution: number;
  /** 0 – 100 */
  chaos: number;
}

export type StatKey = keyof Stats;

export interface OngoingEffect {
  label: string;
  daysLeft: number;
  perDay: Stats;
}

export type EventScale = "minor" | "citywide" | "apocalyptic";

export const TILE_TARGETS = [
  "random",
  "center",
  "edge",
  "residential",
  "commercial",
  "towers",
  "parks",
  "roads",
  "empty",
  "landmarks",
] as const;
export type TileTarget = (typeof TILE_TARGETS)[number];

export const TILE_OPS = ["destroy", "burn", "flood", "build", "landmark", "clear"] as const;
export type TileOpKind = (typeof TILE_OPS)[number];

export const BUILD_KINDS = ["house", "shop", "tower", "park", "road"] as const;
export type BuildKind = (typeof BUILD_KINDS)[number];

export interface TileOp {
  op: TileOpKind;
  target: TileTarget;
  count: number;
  build_kind: BuildKind | null;
  landmark: Landmark | null;
}

export interface Quote {
  name: string;
  role: string;
  text: string;
}

/** What the newsroom (Claude) decides happened. Validated before use. */
export interface EventResult {
  scale: EventScale;
  headline: string;
  subhead: string;
  quotes: Quote[];
  stat_changes: Stats;
  tile_ops: TileOp[];
  ongoing: { label: string; duration_days: number; per_day: Stats } | null;
}

export interface EventRecord {
  day: number;
  input: string;
  result: EventResult;
}

export interface CityState {
  version: 1;
  name: string;
  seed: number;
  /** Current RNG state; the sim is fully deterministic from seed + events. */
  rng: number;
  day: number;
  grid: Tile[];
  stats: Stats;
  ongoing: OngoingEffect[];
  log: EventRecord[];
  collapsed: boolean;
}

export const SCALE_COST: Record<EventScale, number> = {
  minor: 1,
  citywide: 2,
  apocalyptic: 3,
};
