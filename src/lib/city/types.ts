export const GRID_SIZE = 32;

export type TileKind =
  | "empty"
  | "road"
  | "house"
  | "shop"
  | "tower"
  | "park"
  | "forest"
  | "rubble"
  | "water"
  | "landmark";

export const LANDMARK_SHAPES = [
  "tower",
  "dome",
  "pyramid",
  "statue",
  "crater",
  "blob",
  "spire",
  "arch",
  "twin_towers",
  "needle",
  "supertall",
  "mosque",
  "colonial",
  "crown_tower",
  "mall",
  "green_facade",
  "twin_block",
  "art_deco",
  "hawker",
  "shophouses",
  "stadium",
  "convention",
  "flagpole",
  "pavilion",
  "gold_box",
  "sign_block",
  "slim_pyramid",
  "exoskeleton",
  "curve_tower",
  "plaza",
] as const;
export type LandmarkShape = (typeof LANDMARK_SHAPES)[number];

export interface Landmark {
  name: string;
  shape: LandmarkShape;
  /** Hex colour, e.g. "#ff8800". */
  color: string;
  /** Relative height in tiles. */
  height: number;
  /** Visual footprint in tiles for buildings bigger than one lot (default 1). */
  span?: number;
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

export const DISTRICT_IDS = [
  "bukit_bintang",
  "jalan_alor",
  "changkat",
  "klcc",
  "raja_chulan",
  "trx",
  "imbi",
  "pudu",
  "bukit_nanas",
  "dang_wangi",
  "ampang",
  "outskirts",
] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

export const TILE_TARGETS = [
  "random",
  "center",
  "edge",
  "river",
  "residential",
  "commercial",
  "towers",
  "parks",
  "forest",
  "roads",
  "empty",
  "landmarks",
  ...DISTRICT_IDS,
] as const;
export type TileTarget = (typeof TILE_TARGETS)[number];

export const TILE_OPS = ["destroy", "burn", "flood", "build", "landmark", "clear"] as const;
export type TileOpKind = (typeof TILE_OPS)[number];

export const BUILD_KINDS = ["house", "shop", "tower", "park", "road", "forest"] as const;
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

// --- Spectacle: purely visual choreography for an event ---------------------

export const ACTOR_KINDS = [
  "whale",
  "meteor",
  "giant_object",
  "kaiju",
  "creature",
  "ufo",
  "tornado",
  "swarm",
  "convoy",
  "rain_of",
  "wave",
  "storm",
  "fireworks",
] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const ACTOR_SHAPES = ["sphere", "box", "cone", "spiky", "ring", "blob"] as const;
export type ActorShape = (typeof ACTOR_SHAPES)[number];

export const CROWD_REACTIONS = ["flee", "gather", "celebrate", "ignore"] as const;
export type CrowdReaction = (typeof CROWD_REACTIONS)[number];

export const RESPONDERS = ["fire", "police", "ambulance", "army", "cleanup"] as const;
export type Responder = (typeof RESPONDERS)[number];

export interface Actor {
  kind: ActorKind;
  label: string;
  color: string;
  /** 1 – 8 */
  size: number;
  /** For swarms, convoys and rain: how many. */
  count: number;
  shape: ActorShape;
}

export interface Spectacle {
  actors: Actor[];
  crowd: CrowdReaction;
  responders: Responder[];
}

export interface Followup {
  delay_days: number;
  note: string;
  stat_changes: Stats;
  tile_ops: TileOp[];
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
  spectacle: Spectacle;
  followups: Followup[];
}

export interface EventRecord {
  day: number;
  input: string;
  result: EventResult;
}

export interface ScheduledFollowup extends Followup {
  day: number;
  source: string;
}

export interface Bulletin {
  day: number;
  text: string;
  source: string;
}

export interface CityState {
  version: 2;
  name: string;
  seed: number;
  /** Current RNG state; the sim is fully deterministic from seed + events. */
  rng: number;
  day: number;
  grid: Tile[];
  stats: Stats;
  ongoing: OngoingEffect[];
  scheduled: ScheduledFollowup[];
  bulletins: Bulletin[];
  log: EventRecord[];
  collapsed: boolean;
}

export const SCALE_COST: Record<EventScale, number> = {
  minor: 1,
  citywide: 2,
  apocalyptic: 3,
};
