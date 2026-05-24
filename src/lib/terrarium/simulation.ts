import { faunaById, plantById, substrateById } from "./species";
import type {
  FaunaInstance,
  PlantInstance,
  Recipe,
  SimState,
} from "./types";

const uid = () => Math.random().toString(36).slice(2, 9);

export function defaultRecipe(): Recipe {
  return {
    substrate: "loam",
    plants: ["fern", "moss"],
    fauna: { springtail: 6, isopod: 3 },
    humidity: 70,
    light: 8,
  };
}

export function createInitialState(recipe: Recipe): SimState {
  const sub = substrateById(recipe.substrate);
  const plants: PlantInstance[] = recipe.plants.map((defId, i) => ({
    id: uid(),
    defId,
    x: 0.15 + (i + 0.5) * (0.7 / Math.max(recipe.plants.length, 1)),
    health: 90,
    stage: 1,
    dead: false,
  }));
  const fauna: FaunaInstance[] = [];
  (Object.entries(recipe.fauna) as [keyof typeof recipe.fauna, number][]).forEach(
    ([id, count]) => {
      for (let i = 0; i < (count ?? 0); i++) {
        fauna.push({
          id: uid(),
          defId: id as FaunaInstance["defId"],
          x: Math.random(),
          y: 0.2 + Math.random() * 0.6,
          vx: (Math.random() - 0.5) * 0.003,
          satiety: 70,
          alive: true,
        });
      }
    },
  );

  return {
    day: 0,
    hour: 0,
    moisture: recipe.humidity * 0.9 + sub.retention * 10,
    humidity: recipe.humidity,
    nutrients: 30 + sub.fertility * 60,
    moldPressure: 0,
    moldCover: 0,
    recipe,
    plants,
    fauna,
    deadMatter: 0,
    collapsed: false,
    collapseReason: null,
    biodiversity: 0,
    bestDay: 0,
  };
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

// One simulated hour
export function tick(state: SimState): SimState {
  if (state.collapsed) return state;
  const sub = substrateById(state.recipe.substrate);

  // --- Atmosphere drift ---
  // Moisture relaxes toward (humidity * retention) and is lost to dryness/light.
  const moistureTarget = state.recipe.humidity * (0.5 + sub.retention * 0.5);
  let moisture = state.moisture + (moistureTarget - state.moisture) * 0.04;
  moisture -= 0.05 + (state.recipe.light / 16) * 0.15;

  // Humidity relaxes toward set point + plant transpiration boost.
  let humidity =
    state.humidity +
    (state.recipe.humidity - state.humidity) * 0.05 +
    state.plants.filter((p) => !p.dead).length * 0.05;

  let nutrients = state.nutrients;
  let deadMatter = state.deadMatter;
  let moldPressure = state.moldPressure;
  let moldCover = state.moldCover;

  // --- Plants ---
  const plants = state.plants.map((p) => {
    if (p.dead) return p;
    const def = plantById(p.defId);
    let dh = 0;
    const inMoist = moisture >= def.moistureMin && moisture <= def.moistureMax;
    const lightOk = state.recipe.light >= def.lightMin;
    const nutrientOk = nutrients > 5;
    if (inMoist && lightOk && nutrientOk) {
      dh += def.growth;
      nutrients -= def.nutrientUse * 0.5;
    } else {
      // distance outside band
      const dist =
        moisture < def.moistureMin
          ? def.moistureMin - moisture
          : moisture > def.moistureMax
            ? moisture - def.moistureMax
            : 0;
      dh -= 0.3 + dist * 0.05;
      if (!lightOk) dh -= 0.4;
      if (!nutrientOk) dh -= 0.3;
    }
    // mold damage
    dh -= (moldCover / 100) * 0.5;
    const health = clamp(p.health + dh);
    const stage = health > 70 ? 2 : health > 30 ? 1 : 0;
    if (health <= 0) {
      deadMatter += 10;
      return { ...p, health: 0, dead: true, stage: 0 };
    }
    return { ...p, health, stage };
  });

  // --- Mold ---
  const springtailCount = state.fauna.filter(
    (f) => f.alive && f.defId === "springtail",
  ).length;
  const moldGrowth =
    Math.max(0, moisture - 75) * 0.05 +
    Math.max(0, humidity - 80) * 0.04 +
    deadMatter * 0.01;
  moldPressure = clamp(moldPressure + moldGrowth - springtailCount * 0.4);
  moldCover = clamp(
    moldCover + (moldPressure > 40 ? 0.5 : -0.3) - springtailCount * 0.15,
  );

  // --- Fauna ---
  const livePlants = plants.filter((p) => !p.dead);
  const fauna: FaunaInstance[] = [];
  for (const f of state.fauna) {
    if (!f.alive) {
      fauna.push(f);
      continue;
    }
    const def = faunaById(f.defId);
    let satiety = f.satiety - def.hungerRate;
    // humidity tolerance
    const humOk = humidity >= def.humidityMin && humidity <= def.humidityMax;
    if (!humOk) satiety -= 0.5;
    // feed
    if (def.diet === "mold" && moldCover > 1) {
      const eat = Math.min(moldCover, 1.5);
      moldCover -= eat;
      satiety += eat * 3;
    } else if (def.diet === "decay" && deadMatter > 0.5) {
      const eat = Math.min(deadMatter, 1);
      deadMatter -= eat;
      nutrients = clamp(nutrients + eat * 2);
      satiety += eat * 3;
    } else if (def.diet === "plant" && livePlants.length > 0) {
      const victimIdx = Math.floor(Math.random() * plants.length);
      const v = plants[victimIdx];
      if (v && !v.dead) {
        const bite = 1.2;
        v.health = clamp(v.health - bite);
        satiety += bite * 4;
        if (v.health <= 0) {
          v.dead = true;
          v.stage = 0;
          deadMatter += 10;
        }
      }
    } else if (def.diet === "omnivore") {
      if (deadMatter > 0.5) {
        deadMatter -= 0.5;
        satiety += 1.5;
      } else if (livePlants.length > 0 && Math.random() < 0.3) {
        const victimIdx = Math.floor(Math.random() * plants.length);
        const v = plants[victimIdx];
        if (v && !v.dead) {
          v.health = clamp(v.health - 0.6);
          satiety += 2;
        }
      } else if (Math.random() < 0.05) {
        // hunts small fauna
        const prey = fauna.find(
          (x) => x.alive && (x.defId === "springtail" || x.defId === "isopod"),
        );
        if (prey) {
          prey.alive = false;
          deadMatter += 2;
          satiety += 5;
        }
      }
    }

    satiety = clamp(satiety);
    // movement
    let nx = f.x + f.vx;
    let vx = f.vx;
    if (nx < 0.05 || nx > 0.95) {
      vx = -vx;
      nx = clamp(nx, 0.05, 0.95);
    }
    if (Math.random() < 0.02) vx = (Math.random() - 0.5) * 0.005;

    if (satiety <= 0) {
      deadMatter += 3;
      fauna.push({ ...f, alive: false, satiety: 0 });
      continue;
    }
    // reproduce occasionally
    if (satiety > def.reproduceAt && Math.random() < 0.004 && humOk) {
      fauna.push({
        id: uid(),
        defId: f.defId,
        x: clamp(nx + (Math.random() - 0.5) * 0.05, 0.05, 0.95),
        y: clamp(f.y + (Math.random() - 0.5) * 0.05, 0.2, 0.8),
        vx: (Math.random() - 0.5) * 0.003,
        satiety: 50,
        alive: true,
      });
    }
    fauna.push({ ...f, x: nx, vx, satiety });
  }

  // --- Time advance ---
  let hour = state.hour + 1;
  let day = state.day;
  if (hour >= 24) {
    hour = 0;
    day += 1;
  }

  // --- Biodiversity ---
  const alivePlantSpecies = new Set(
    plants.filter((p) => !p.dead).map((p) => p.defId),
  );
  const aliveFaunaSpecies = new Set(
    fauna.filter((f) => f.alive).map((f) => f.defId),
  );
  const moistureOk = moisture > 15 && moisture < 95 ? 1 : 0;
  const biodiversity =
    alivePlantSpecies.size * 15 +
    aliveFaunaSpecies.size * 12 +
    moistureOk * 15 +
    Math.min(day, 365) * 0.1;

  // --- Collapse checks ---
  let collapsed = false;
  let collapseReason: string | null = null;
  if (plants.every((p) => p.dead)) {
    collapsed = true;
    collapseReason = "All flora died — the producers are gone.";
  } else if (fauna.length > 0 && fauna.every((f) => !f.alive) && moldCover > 60) {
    collapsed = true;
    collapseReason = "Mold overran the jar with no cleanup crew.";
  } else if (moisture <= 1) {
    collapsed = true;
    collapseReason = "The terrarium dried out completely.";
  } else if (moisture >= 99 && moldCover > 70) {
    collapsed = true;
    collapseReason = "Drowned in moisture and mold.";
  }

  return {
    ...state,
    day,
    hour,
    moisture: clamp(moisture),
    humidity: clamp(humidity),
    nutrients: clamp(nutrients),
    moldPressure,
    moldCover,
    plants,
    fauna,
    deadMatter: Math.max(0, deadMatter),
    collapsed,
    collapseReason,
    biodiversity,
    bestDay: Math.max(state.bestDay, day),
  };
}