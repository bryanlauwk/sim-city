export type SubstrateId = "coir" | "loam" | "sandy" | "sphagnum";
export type PlantId = "fern" | "moss" | "pilea" | "lichen" | "orchid";
export type FaunaId = "springtail" | "isopod" | "snail" | "ant";

export interface SubstrateDef {
  id: SubstrateId;
  name: string;
  retention: number; // 0..1 how well it holds moisture
  fertility: number; // 0..1
  acidity: number; // 0..1 (1 = acidic)
  color: string;
  blurb: string;
}

export interface PlantDef {
  id: PlantId;
  name: string;
  moistureMin: number;
  moistureMax: number;
  lightMin: number;
  growth: number; // health/tick when happy
  nutrientUse: number;
  edibleValue: number;
  color: string;
  accent: string;
  blurb: string;
}

export interface FaunaDef {
  id: FaunaId;
  name: string;
  diet: "mold" | "decay" | "plant" | "omnivore";
  hungerRate: number;
  humidityMin: number;
  humidityMax: number;
  reproduceAt: number; // satiety threshold
  color: string;
  blurb: string;
}

export interface PlantInstance {
  id: string;
  defId: PlantId;
  x: number; // 0..1 across substrate
  health: number; // 0..100
  stage: number; // 0..2
  dead: boolean;
}

export interface FaunaInstance {
  id: string;
  defId: FaunaId;
  x: number; // 0..1
  y: number; // 0..1 within livable band
  vx: number;
  satiety: number; // 0..100
  alive: boolean;
}

export interface Recipe {
  substrate: SubstrateId;
  plants: PlantId[]; // multiset
  fauna: Partial<Record<FaunaId, number>>;
  humidity: number; // 0..100
  light: number; // 0..16 hours/day
}

export interface SimState {
  day: number;
  hour: number; // 0..23
  moisture: number; // 0..100
  humidity: number; // 0..100
  nutrients: number; // 0..100
  moldPressure: number; // 0..100
  moldCover: number; // 0..100 visible coverage
  recipe: Recipe;
  plants: PlantInstance[];
  fauna: FaunaInstance[];
  deadMatter: number;
  collapsed: boolean;
  collapseReason: string | null;
  biodiversity: number;
  bestDay: number;
}

export type Phase = "setup" | "running" | "collapsed" | "thriving";