/**
 * Maple Hollow, 1985: a sleepy small town on a 32×32 grid. Woods and Mirror
 * Lake to the north-west, Hollow Point Lab fenced off on the hill to the
 * north-east, Elm Street's houses in the middle, Main Street across town,
 * the railroad and the high school below it, then Oak Hill, Sunbeam Mall,
 * the farms and the junkyard to the south.
 *
 * Underneath it all lies its mirror, the Upside Down: the same streets, dark,
 * overgrown and silent (drawn by scene/UpsideDown.tsx from the same grid).
 *
 * x runs west → east, y runs north → south.
 */
import { GRID_SIZE, type DistrictId, type Landmark, type TileKind } from "./types";

const N = GRID_SIZE;

export interface District {
  id: DistrictId;
  name: string;
  /** Inclusive rectangle [x0, y0, x1, y1]. First match wins. */
  rect: [number, number, number, number];
  /** Relative odds for new buildings. */
  mix: { house: number; shop: number; tower: number };
  /** Share of free lots built on at the start. */
  density: number;
  /** Nature reserves never get cleared for development. */
  protected?: boolean;
}

const NONE = { house: 0, shop: 0, tower: 0 };

export const DISTRICTS: District[] = [
  {
    id: "woods",
    name: "Blackpine Woods",
    rect: [0, 0, 12, 6],
    mix: NONE,
    density: 0,
    protected: true,
  },
  {
    id: "mirror_lake",
    name: "Mirror Lake",
    rect: [0, 7, 7, 14],
    mix: NONE,
    density: 0,
    protected: true,
  },
  {
    id: "lab",
    name: "Hollow Point Lab",
    rect: [21, 0, 31, 7],
    mix: { house: 0, shop: 0.4, tower: 0.6 },
    density: 0.25,
  },
  {
    id: "pine_acres",
    name: "Pine Acres trailer park",
    rect: [25, 8, 31, 15],
    mix: { house: 1, shop: 0, tower: 0 },
    density: 0.8,
  },
  {
    id: "elm_street",
    name: "Elm Street",
    rect: [8, 7, 23, 14],
    mix: { house: 0.95, shop: 0.05, tower: 0 },
    density: 0.85,
  },
  {
    id: "downtown",
    name: "Main Street",
    rect: [2, 15, 24, 17],
    mix: { house: 0.05, shop: 0.8, tower: 0.15 },
    density: 0.95,
  },
  {
    id: "high_school",
    name: "Maple Hollow High",
    rect: [2, 18, 12, 23],
    mix: { house: 0.6, shop: 0.2, tower: 0.2 },
    density: 0.55,
  },
  {
    id: "mall",
    name: "Sunbeam Mall",
    rect: [15, 22, 23, 28],
    mix: { house: 0, shop: 0.85, tower: 0.15 },
    density: 0.7,
  },
  {
    id: "junkyard",
    name: "Kettle's Junkyard",
    rect: [26, 26, 31, 31],
    mix: { house: 0.3, shop: 0.5, tower: 0.2 },
    density: 0.3,
  },
  {
    id: "farms",
    name: "Kettle Farms",
    rect: [15, 29, 25, 31],
    mix: { house: 0.8, shop: 0.2, tower: 0 },
    density: 0.2,
  },
  {
    id: "oak_hill",
    name: "Oak Hill",
    rect: [0, 24, 13, 31],
    mix: { house: 0.95, shop: 0.05, tower: 0 },
    density: 0.8,
  },
];

const OUTSKIRTS: District = {
  id: "outskirts",
  name: "the edge of town",
  rect: [0, 0, N - 1, N - 1],
  mix: { house: 0.6, shop: 0.3, tower: 0.1 },
  density: 0.45,
};

const districtGrid: District[] = Array.from({ length: N * N }, (_, i) => {
  const x = i % N;
  const y = Math.floor(i / N);
  return (
    DISTRICTS.find(({ rect: [x0, y0, x1, y1] }) => x >= x0 && x <= x1 && y >= y0 && y <= y1) ??
    OUTSKIRTS
  );
});

export const districtAt = (i: number): District => districtGrid[i];
export const districtName = (id: DistrictId) =>
  (DISTRICTS.find((d) => d.id === id) ?? OUTSKIRTS).name;

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

type Pt = [number, number];

/** 4-connected line so roads and creeks never touch only at corners. */
function line4([x0, y0]: Pt, [x1, y1]: Pt, cb: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let x = x0;
  let y = y0;
  let ix = 0;
  let iy = 0;
  cb(x, y);
  while (ix < dx || iy < dy) {
    if ((0.5 + ix) / dx < (0.5 + iy) / dy) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    cb(x, y);
  }
}

function polyline(points: Pt[], cb: (x: number, y: number) => void) {
  for (let k = 0; k < points.length - 1; k++) line4(points[k], points[k + 1], cb);
}

export const STREETS: { name: string; points: Pt[] }[] = [
  {
    name: "Main Street",
    points: [
      [1, 16],
      [30, 16],
    ],
  },
  {
    name: "Maple Avenue",
    points: [
      [14, 6],
      [14, 31],
    ],
  },
  {
    name: "Old Mill Road",
    points: [
      [24, 5],
      [24, 31],
    ],
  },
  {
    name: "Elm Street",
    points: [
      [8, 12],
      [23, 12],
    ],
  },
  {
    name: "Sycamore Drive",
    points: [
      [11, 8],
      [21, 8],
    ],
  },
  {
    name: "Birch Lane",
    points: [
      [11, 8],
      [11, 15],
    ],
  },
  {
    name: "Cedar Court",
    points: [
      [18, 8],
      [18, 11],
    ],
  },
  {
    name: "Lab Road",
    points: [
      [24, 5],
      [27, 5],
    ],
  },
  {
    name: "Pine Acres Drive",
    points: [
      [24, 11],
      [30, 11],
    ],
  },
  {
    name: "Quarry Road",
    points: [
      [4, 16],
      [4, 13],
    ],
  },
  {
    name: "School Road",
    points: [
      [8, 16],
      [8, 24],
    ],
  },
  {
    name: "Kettle Road",
    points: [
      [0, 24],
      [31, 24],
    ],
  },
  {
    name: "Mall Drive",
    points: [
      [14, 22],
      [24, 22],
    ],
  },
  {
    name: "Willow Way",
    points: [
      [4, 24],
      [4, 31],
    ],
  },
  {
    name: "Oak Lane",
    points: [
      [10, 24],
      [10, 31],
    ],
  },
  {
    name: "Farm Road",
    points: [
      [14, 28],
      [24, 28],
    ],
  },
];

/** Painted crosswalks on Main Street. */
export const CROSSINGS: Pt[] = [
  [14, 16],
  [8, 16],
  [24, 16],
];

/** The freight railroad across town, on its own row of tiles. */
export const RAILROAD: { name: string; row: number; from: number; to: number } = {
  name: "Maple Hollow & Western freight line",
  row: 19,
  from: 0,
  to: N - 1,
};

const lm = (
  name: string,
  shape: Landmark["shape"],
  color: string,
  height: number,
  span?: number,
): Landmark => ({ name, shape, color, height, ...(span ? { span } : {}) });

/** The town's landmarks. */
const LANDMARKS: { at: Pt; landmark: Landmark }[] = [
  { at: [26, 2], landmark: lm("Hollow Point Lab", "lab", "#d9d6cc", 1.1, 2.2) },
  { at: [5, 3], landmark: lm("WHOL radio tower", "radio_tower", "#c8412f", 4.2) },
  { at: [10, 4], landmark: lm("Hunter's cabin", "cabin", "#6b4a31", 0.5) },
  { at: [16, 10], landmark: lm("Maple Hollow water tower", "water_tower", "#bfc8cc", 2.8) },
  { at: [21, 10], landmark: lm("Hawthorne House", "victorian", "#6d6a78", 1.3, 1.2) },
  { at: [6, 15], landmark: lm("First Church of Maple Hollow", "church", "#efe9dc", 1.6) },
  { at: [10, 15], landmark: lm("Hollow Cinema", "cinema", "#7a2d34", 1.1, 1.2) },
  { at: [13, 15], landmark: lm("Town Hall", "town_hall", "#b9a488", 1.8, 1.3) },
  { at: [16, 15], landmark: lm("Rewind Video", "video_store", "#2d4f8f", 0.6) },
  { at: [12, 17], landmark: lm("Starlight Arcade", "arcade", "#2a1f4a", 0.7) },
  { at: [17, 17], landmark: lm("Maple Hollow Police", "police", "#a7a293", 0.7) },
  { at: [19, 17], landmark: lm("Dot's Diner", "diner", "#c7ccd1", 0.5) },
  { at: [22, 17], landmark: lm("Route 9 Gas", "gas_station", "#e8e2d4", 0.6) },
  { at: [6, 21], landmark: lm("Maple Hollow High", "school", "#9c4f3c", 1, 2) },
  { at: [11, 21], landmark: lm("Bulldogs Field", "stadium", "#5a8f4a", 0.3, 1.4) },
  { at: [19, 26], landmark: lm("Sunbeam Mall", "mall", "#e7dccb", 1, 2.4) },
  { at: [29, 29], landmark: lm("Kettle's Junkyard", "junkyard", "#7d6a55", 0.6, 1.8) },
  { at: [20, 30], landmark: lm("Kettle Farm", "barn", "#a33b2c", 0.9, 1.3) },
];

/** The same base map for every town; buildings are added per seed. */
export function hollowTerrain(): { kinds: TileKind[]; landmarks: Map<number, Landmark> } {
  const kinds: TileKind[] = Array(N * N).fill("empty");
  const set = (x: number, y: number, k: TileKind) => {
    if (x >= 0 && y >= 0 && x < N && y < N) kinds[y * N + x] = k;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, k: TileKind) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, k);
  };

  rect(0, 0, 12, 6, "forest"); // Blackpine Woods
  rect(0, 7, 2, 14, "forest");
  rect(3, 8, 6, 11, "water"); // Mirror Lake
  rect(4, 12, 5, 12, "water");
  // Kettle Creek runs from the lake down the west side of town.
  polyline(
    [
      [3, 12],
      [2, 18],
      [1, 25],
      [0, 31],
    ],
    (x, y) => set(x, y, "water"),
  );
  rect(16, 29, 18, 31, "park"); // pumpkin fields
  rect(21, 29, 23, 31, "park");
  rect(9, 13, 10, 14, "park"); // Elm Street playground

  for (const s of STREETS) polyline(s.points, (x, y) => set(x, y, "road"));
  // The railroad crosses the streets at grade: level crossings stay road.
  for (let x = RAILROAD.from; x <= RAILROAD.to; x++) {
    const i = RAILROAD.row * N + x;
    if (kinds[i] !== "road") kinds[i] = "rail";
  }
  // The mall's parking lot.
  rect(16, 23, 22, 23, "road");

  const landmarks = new Map<number, Landmark>();
  for (const {
    at: [x, y],
    landmark,
  } of LANDMARKS) {
    const i = y * N + x;
    kinds[i] = "landmark";
    landmarks.set(i, landmark);
    // Big buildings claim the free lots around them as grounds.
    if ((landmark.span ?? 1) >= 1.5) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = (y + dy) * N + (x + dx);
        if (x + dx < 0 || y + dy < 0 || x + dx >= N || y + dy >= N) continue;
        if (kinds[j] !== "empty" && kinds[j] !== "forest") continue;
        kinds[j] = "landmark";
        landmarks.set(j, lm("", "plaza", "#cfc8b8", 0));
      }
    }
  }
  return { kinds, landmarks };
}
