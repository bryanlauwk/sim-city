/**
 * Kuala Lumpur's Golden Triangle — Bukit Bintang, KLCC and Raja Chulan — on
 * a 32×32 grid at roughly 66 m per tile, placed from real coordinates:
 * x ≈ (longitude − 101.7015) / 0.00062, y ≈ (3.1615 − latitude) / 0.00062.
 * North is Jalan Ampang and the Petronas Towers, south is Jalan Imbi and
 * Berjaya Times Square, west is Bukit Nanas, east is Jalan Tun Razak and TRX.
 * Streets snap to the grid; buildings are stylised.
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
    id: "bukit_nanas",
    name: "Bukit Nanas forest reserve",
    rect: [1, 11, 6, 17],
    mix: NONE,
    density: 0,
    protected: true,
  },
  {
    id: "jalan_alor",
    name: "Jalan Alor",
    rect: [9, 23, 13, 27],
    mix: { house: 0.3, shop: 0.7, tower: 0 },
    density: 0.95,
  },
  {
    id: "changkat",
    name: "Changkat Bukit Bintang",
    rect: [6, 19, 12, 22],
    mix: { house: 0.6, shop: 0.4, tower: 0 },
    density: 0.9,
  },
  {
    id: "bukit_bintang",
    name: "Bukit Bintang",
    rect: [13, 18, 24, 27],
    mix: { house: 0.05, shop: 0.6, tower: 0.35 },
    density: 0.9,
  },
  {
    id: "trx",
    name: "Tun Razak Exchange",
    rect: [25, 24, 31, 31],
    mix: { house: 0, shop: 0.3, tower: 0.7 },
    density: 0.55,
  },
  {
    id: "imbi",
    name: "Imbi",
    rect: [12, 28, 24, 31],
    mix: { house: 0.2, shop: 0.5, tower: 0.3 },
    density: 0.8,
  },
  {
    id: "pudu",
    name: "Pudu",
    rect: [0, 23, 11, 31],
    mix: { house: 0.5, shop: 0.4, tower: 0.1 },
    density: 0.8,
  },
  {
    id: "klcc",
    name: "KLCC",
    rect: [12, 0, 24, 14],
    mix: { house: 0, shop: 0.25, tower: 0.75 },
    density: 0.8,
  },
  {
    id: "ampang",
    name: "Jalan Ampang",
    rect: [25, 0, 31, 14],
    mix: { house: 0.2, shop: 0.3, tower: 0.5 },
    density: 0.65,
  },
  {
    id: "dang_wangi",
    name: "Dang Wangi",
    rect: [0, 0, 11, 14],
    mix: { house: 0.2, shop: 0.4, tower: 0.4 },
    density: 0.75,
  },
  {
    id: "raja_chulan",
    name: "Jalan Raja Chulan",
    rect: [0, 15, 31, 23],
    mix: { house: 0.05, shop: 0.35, tower: 0.6 },
    density: 0.85,
  },
];

const OUTSKIRTS: District = {
  id: "outskirts",
  name: "the edge of the Golden Triangle",
  rect: [0, 0, N - 1, N - 1],
  mix: { house: 0.4, shop: 0.4, tower: 0.2 },
  density: 0.6,
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

/** 4-connected line so roads and rivers never touch only at corners. */
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

const ROADS: Pt[][] = [
  [
    [0, 7],
    [6, 6],
    [17, 3],
    [31, 1],
  ], // Jalan Ampang
  [
    [2, 5],
    [6, 10],
    [16, 25],
    [21, 31],
  ], // Jalan Sultan Ismail
  [
    [6, 17],
    [29, 15],
  ], // Jalan Raja Chulan
  [
    [11, 31],
    [16, 25],
    [24, 17],
  ], // Jalan Bukit Bintang
  [
    [6, 10],
    [15, 13],
  ], // Jalan P. Ramlee
  [
    [16, 9],
    [16, 16],
  ], // Jalan Pinang
  [
    [23, 12],
    [23, 18],
  ], // Jalan Kia Peng
  [
    [12, 29],
    [30, 26],
  ], // Jalan Imbi
  [
    [0, 23],
    [11, 31],
  ], // Jalan Pudu
  [
    [30, 0],
    [30, 31],
  ], // Jalan Tun Razak
  [
    [7, 20],
    [13, 21],
  ], // Changkat Bukit Bintang
  [
    [9, 23],
    [13, 27],
  ], // Jalan Alor
  [
    [24, 2],
    [25, 12],
  ], // Jalan Yap Kwan Seng
  [
    [25, 7],
    [29, 7],
  ], // Jalan Binjai
  [
    [26, 15],
    [26, 26],
  ], // Jalan Conlay
  [
    [10, 0],
    [10, 4],
  ], // Jalan Kamunting
  [
    [2, 18],
    [6, 22],
  ], // Jalan Bukit Bintang (west)
  [
    [18, 26],
    [22, 27],
  ], // Jalan Walter Grenier
];

/** The Bukit Bintang scramble crossing and other painted crossings. */
export const CROSSINGS: Pt[] = [
  [16, 25],
  [13, 21],
  [21, 20],
];

export interface RailLine {
  name: string;
  color: string;
  points: Pt[];
  stations: string[];
  /** Covered pedestrian walkway rather than a railway. */
  walkway?: boolean;
}

export const RAIL_LINES: RailLine[] = [
  {
    name: "KL Monorail",
    color: "#86bc25",
    points: [
      [5, 5],
      [8, 9],
      [14, 18],
      [16, 25],
      [13, 30],
      [12, 31],
    ],
    stations: ["Medan Tuanku", "Bukit Nanas", "Raja Chulan", "Bukit Bintang", "Imbi", "Hang Tuah"],
  },
  {
    name: "LRT Kelana Jaya",
    color: "#d9223b",
    points: [
      [0, 8],
      [19, 4],
      [29, 2],
      [31, 1],
    ],
    stations: ["Dang Wangi", "KLCC", "Ampang Park", "Jelatek"],
  },
  {
    name: "MRT Kajang",
    color: "#0a8a43",
    points: [
      [0, 28],
      [15, 25],
      [26, 29],
      [31, 31],
    ],
    stations: ["Merdeka", "Bukit Bintang", "Tun Razak Exchange", "Cochrane"],
  },
  {
    name: "Pavilion–KLCC walkway",
    color: "#e7e2d6",
    points: [
      [19, 19],
      [19, 15],
      [17, 13],
      [16, 9],
    ],
    stations: ["Pavilion", "Jalan Raja Chulan", "Convention Centre", "Suria KLCC"],
    walkway: true,
  },
];

const lm = (
  name: string,
  shape: Landmark["shape"],
  color: string,
  height: number,
  span?: number,
): Landmark => ({ name, shape, color, height, ...(span ? { span } : {}) });

/** The trademark buildings, placed where they stand. */
const LANDMARKS: { at: Pt; landmark: Landmark }[] = [
  { at: [16, 6], landmark: lm("Petronas Twin Towers", "twin_towers", "#cfd5dd", 5.4, 1.8) },
  { at: [16, 8], landmark: lm("Suria KLCC", "mall", "#ddd3c2", 0.8, 1.7) },
  { at: [19, 6], landmark: lm("Menara Maxis", "slim_pyramid", "#9fb3c4", 3.3) },
  { at: [21, 4], landmark: lm("Four Seasons Place", "curve_tower", "#d7dde2", 4.1) },
  { at: [12, 5], landmark: lm("Ilham Tower", "exoskeleton", "#c9c4bb", 3.3) },
  { at: [19, 14], landmark: lm("KL Convention Centre", "convention", "#bcc6cf", 0.8, 1.5) },
  { at: [4, 14], landmark: lm("Menara KL", "needle", "#ece6d8", 5) },
  { at: [19, 20], landmark: lm("Pavilion Kuala Lumpur", "pavilion", "#e9dfcb", 2.6, 1.8) },
  { at: [20, 23], landmark: lm("Starhill", "gold_box", "#c9a35a", 0.9, 1.3) },
  { at: [17, 23], landmark: lm("Lot 10", "green_facade", "#5c9a52", 1.1, 1.2) },
  { at: [18, 25], landmark: lm("Fahrenheit88", "sign_block", "#f58220", 1, 1.2) },
  { at: [15, 26], landmark: lm("Sungei Wang Plaza", "sign_block", "#3a6fb0", 1.1, 1.2) },
  { at: [14, 28], landmark: lm("BB Plaza", "sign_block", "#d23f3f", 0.9) },
  { at: [14, 30], landmark: lm("Berjaya Times Square", "twin_block", "#d6c9b0", 2.6, 1.6) },
  { at: [10, 25], landmark: lm("Jalan Alor food street", "hawker", "#c9302c", 0.3) },
  { at: [12, 26], landmark: lm("Jalan Alor food street", "hawker", "#c9302c", 0.3) },
  { at: [11, 23], landmark: lm("Jalan Alor food street", "hawker", "#c9302c", 0.3) },
  { at: [9, 21], landmark: lm("Changkat Bukit Bintang", "shophouses", "#e8b04a", 0.5) },
  { at: [11, 22], landmark: lm("Changkat Bukit Bintang", "shophouses", "#e8b04a", 0.5) },
  { at: [27, 30], landmark: lm("The Exchange 106", "crown_tower", "#8ea9c1", 5.3, 1.3) },
  { at: [1, 30], landmark: lm("Merdeka 118", "supertall", "#8fb0cc", 7.5, 1.3) },
];

/** The same base map for every city; buildings are added per city seed. */
export function klTerrain(): { kinds: TileKind[]; landmarks: Map<number, Landmark> } {
  const kinds: TileKind[] = Array(N * N).fill("empty");
  const set = (x: number, y: number, k: TileKind) => {
    if (x >= 0 && y >= 0 && x < N && y < N) kinds[y * N + x] = k;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, k: TileKind) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, k);
  };

  rect(1, 11, 6, 17, "forest"); // Bukit Nanas
  rect(17, 8, 22, 12, "park"); // KLCC Park
  rect(18, 10, 20, 10, "water"); // Lake Symphony
  rect(28, 27, 29, 31, "park"); // TRX city park

  for (const r of ROADS) polyline(r, (x, y) => set(x, y, "road"));

  const landmarks = new Map<number, Landmark>();
  for (const {
    at: [x, y],
    landmark,
  } of LANDMARKS) {
    const i = y * N + x;
    kinds[i] = "landmark";
    landmarks.set(i, landmark);
    // Big buildings claim the free lots around them as a forecourt.
    if ((landmark.span ?? 1) >= 1.5) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = (y + dy) * N + (x + dx);
        if (x + dx < 0 || y + dy < 0 || x + dx >= N || y + dy >= N) continue;
        if (kinds[j] !== "empty") continue;
        kinds[j] = "landmark";
        landmarks.set(j, lm("", "plaza", "#d8d2c4", 0));
      }
    }
  }
  return { kinds, landmarks };
}
