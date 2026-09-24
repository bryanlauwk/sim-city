/**
 * Kuala Lumpur's city centre on a 32×32 grid, roughly 100 m per tile
 * (x ≈ (longitude − 101.690) × 1000, y ≈ (3.164 − latitude) × 1000), so the
 * streets and landmarks sit where they really are. The map runs from
 * Dataran Merdeka and Chinatown in the west to KLCC, Bukit Bintang and TRX
 * in the east. Simplified: streets snap to the grid, and buildings are
 * stylised.
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
    rect: [12, 9, 15, 12],
    mix: NONE,
    density: 0,
    protected: true,
  },
  {
    id: "lake_gardens",
    name: "Perdana Lake Gardens",
    rect: [0, 13, 1, 25],
    mix: NONE,
    density: 0,
    protected: true,
  },
  {
    id: "jalan_alor",
    name: "Jalan Alor",
    rect: [19, 17, 19, 20],
    mix: { house: 0.1, shop: 0.9, tower: 0 },
    density: 0.95,
  },
  {
    id: "changkat",
    name: "Changkat Bukit Bintang",
    rect: [14, 14, 18, 16],
    mix: { house: 0.5, shop: 0.5, tower: 0 },
    density: 0.9,
  },
  {
    id: "bukit_bintang",
    name: "Bukit Bintang",
    rect: [19, 14, 27, 20],
    mix: { house: 0.05, shop: 0.6, tower: 0.35 },
    density: 0.9,
  },
  {
    id: "raja_chulan",
    name: "Jalan Raja Chulan",
    rect: [12, 12, 28, 13],
    mix: { house: 0, shop: 0.35, tower: 0.65 },
    density: 0.85,
  },
  {
    id: "kampung_baru",
    name: "Kampung Baru",
    rect: [12, 0, 21, 4],
    mix: { house: 1, shop: 0, tower: 0 },
    density: 0.7,
  },
  {
    id: "klcc",
    name: "KLCC",
    rect: [16, 5, 27, 11],
    mix: { house: 0, shop: 0.3, tower: 0.7 },
    density: 0.8,
  },
  {
    id: "ampang",
    name: "Jalan Ampang",
    rect: [22, 0, 31, 4],
    mix: { house: 0.3, shop: 0.3, tower: 0.4 },
    density: 0.6,
  },
  {
    id: "ampang",
    name: "Jalan Ampang",
    rect: [28, 5, 31, 17],
    mix: { house: 0.3, shop: 0.3, tower: 0.4 },
    density: 0.6,
  },
  {
    id: "trx",
    name: "Tun Razak Exchange",
    rect: [28, 18, 31, 26],
    mix: { house: 0.1, shop: 0.3, tower: 0.6 },
    density: 0.5,
  },
  {
    id: "imbi",
    name: "Imbi",
    rect: [19, 21, 27, 25],
    mix: { house: 0.2, shop: 0.5, tower: 0.3 },
    density: 0.75,
  },
  {
    id: "chow_kit",
    name: "Chow Kit",
    rect: [2, 0, 15, 8],
    mix: { house: 0.35, shop: 0.55, tower: 0.1 },
    density: 0.75,
  },
  {
    id: "masjid_jamek",
    name: "Masjid Jamek",
    rect: [6, 13, 13, 16],
    mix: { house: 0.1, shop: 0.5, tower: 0.4 },
    density: 0.75,
  },
  {
    id: "merdeka",
    name: "Dataran Merdeka",
    rect: [2, 13, 5, 25],
    mix: { house: 0.3, shop: 0.4, tower: 0.3 },
    density: 0.55,
  },
  {
    id: "chinatown",
    name: "Chinatown (Petaling Street)",
    rect: [6, 17, 9, 25],
    mix: { house: 0.3, shop: 0.7, tower: 0 },
    density: 0.9,
  },
  {
    id: "pudu",
    name: "Pudu",
    rect: [10, 17, 18, 27],
    mix: { house: 0.4, shop: 0.4, tower: 0.2 },
    density: 0.75,
  },
  {
    id: "brickfields",
    name: "Brickfields",
    rect: [0, 26, 9, 31],
    mix: { house: 0.6, shop: 0.4, tower: 0 },
    density: 0.6,
  },
  {
    id: "cheras",
    name: "Cheras",
    rect: [19, 26, 31, 31],
    mix: { house: 0.7, shop: 0.3, tower: 0 },
    density: 0.5,
  },
];

const OUTSKIRTS: District = {
  id: "outskirts",
  name: "the fringes of the city centre",
  rect: [0, 0, N - 1, N - 1],
  mix: { house: 0.6, shop: 0.3, tower: 0.1 },
  density: 0.5,
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

const RIVERS: Pt[][] = [
  // Sungai Klang, in from Ampang, down past Central Market towards Brickfields
  [
    [31, 1],
    [24, 2],
    [17, 4],
    [11, 8],
    [6, 14],
    [5, 18],
    [5, 24],
    [4, 31],
  ],
  // Sungai Gombak, from the north to the confluence at Masjid Jamek
  [
    [4, 0],
    [5, 8],
    [6, 14],
  ],
];

const ROADS: Pt[][] = [
  [
    [8, 15],
    [11, 11],
    [15, 8],
    [21, 5],
    [31, 4],
  ], // Jalan Ampang
  [
    [9, 2],
    [15, 10],
    [21, 18],
    [25, 23],
    [27, 31],
  ], // Jalan Sultan Ismail
  [
    [12, 13],
    [30, 13],
  ], // Jalan Raja Chulan
  [
    [26, 13],
    [21, 18],
    [18, 20],
    [14, 22],
  ], // Jalan Bukit Bintang
  [
    [15, 9],
    [21, 10],
  ], // Jalan P. Ramlee
  [
    [18, 20],
    [30, 20],
  ], // Jalan Imbi
  [
    [9, 17],
    [20, 23],
    [27, 29],
  ], // Jalan Pudu
  [
    [30, 0],
    [30, 31],
  ], // Jalan Tun Razak
  [
    [3, 14],
    [9, 17],
  ], // Jalan Tun Perak
  [
    [7, 17],
    [7, 31],
  ], // Jalan Sultan / Tun Tan Cheng Lock
  [
    [6, 0],
    [6, 13],
  ], // Jalan Raja Laut
  [
    [2, 0],
    [2, 14],
  ], // Jalan Kuching
  [
    [7, 26],
    [15, 25],
    [21, 25],
  ], // Jalan Maharajalela / Hang Tuah
  [
    [2, 31],
    [7, 26],
  ], // Jalan Syed Putra
  [
    [16, 0],
    [16, 5],
  ], // Jalan Raja Abdullah
  [
    [26, 4],
    [26, 13],
  ], // Jalan Stonor / Kia Peng
];

export interface RailLine {
  name: string;
  color: string;
  points: Pt[];
  stations: string[];
}

export const RAIL_LINES: RailLine[] = [
  {
    name: "KL Monorail",
    color: "#86bc25",
    points: [
      [0, 31],
      [8, 25],
      [14, 24],
      [21, 21],
      [21, 18],
      [20, 13],
      [15, 11],
      [13, 5],
      [12, 0],
    ],
    stations: [
      "KL Sentral",
      "Maharajalela",
      "Hang Tuah",
      "Imbi",
      "Bukit Bintang",
      "Raja Chulan",
      "Bukit Nanas",
      "Medan Tuanku",
      "Chow Kit",
    ],
  },
  {
    name: "LRT Kelana Jaya",
    color: "#d9223b",
    points: [
      [0, 26],
      [6, 19],
      [7, 14],
      [12, 8],
      [21, 7],
      [28, 3],
      [31, 2],
    ],
    stations: [
      "KL Sentral",
      "Pasar Seni",
      "Masjid Jamek",
      "Dang Wangi",
      "KLCC",
      "Ampang Park",
      "Jelatek",
    ],
  },
  {
    name: "MRT Kajang",
    color: "#0a8a43",
    points: [
      [0, 17],
      [6, 19],
      [10, 21],
      [20, 19],
      [28, 21],
      [31, 25],
    ],
    stations: [
      "Muzium Negara",
      "Pasar Seni",
      "Merdeka",
      "Bukit Bintang",
      "Tun Razak Exchange",
      "Cochrane",
    ],
  },
  {
    name: "LRT Ampang / Sri Petaling",
    color: "#e57200",
    points: [
      [5, 0],
      [6, 8],
      [7, 14],
      [9, 19],
      [14, 24],
      [16, 31],
    ],
    stations: ["Sultan Ismail", "Bandaraya", "Masjid Jamek", "Plaza Rakyat", "Hang Tuah", "Pudu"],
  },
];

const lm = (name: string, shape: Landmark["shape"], color: string, height: number): Landmark => ({
  name,
  shape,
  color,
  height,
});

/** The trademark buildings, placed where they stand. */
const LANDMARKS: { at: Pt; landmark: Landmark }[] = [
  { at: [22, 6], landmark: lm("Petronas Twin Towers", "twin_towers", "#cfd5dd", 3.6) },
  { at: [22, 7], landmark: lm("Suria KLCC", "mall", "#d9d0c1", 0.7) },
  { at: [24, 11], landmark: lm("KL Convention Centre", "convention", "#bcc6cf", 0.7) },
  { at: [14, 11], landmark: lm("Menara KL", "needle", "#ece6d8", 3.6) },
  { at: [24, 15], landmark: lm("Pavilion Kuala Lumpur", "mall", "#e8dcc8", 1.3) },
  { at: [25, 17], landmark: lm("Starhill", "mall", "#c9a35a", 0.8) },
  { at: [22, 17], landmark: lm("Lot 10", "green_facade", "#5c9a52", 0.9) },
  { at: [20, 19], landmark: lm("Sungei Wang Plaza", "mall", "#d2c4a8", 0.8) },
  { at: [19, 17], landmark: lm("Jalan Alor food street", "hawker", "#c9302c", 0.3) },
  { at: [19, 18], landmark: lm("Jalan Alor food street", "hawker", "#c9302c", 0.3) },
  { at: [17, 16], landmark: lm("Changkat Bukit Bintang", "shophouses", "#e8b04a", 0.5) },
  { at: [21, 22], landmark: lm("Berjaya Times Square", "twin_block", "#d6c9b0", 2) },
  { at: [29, 22], landmark: lm("The Exchange 106", "crown_tower", "#8ea9c1", 3.9) },
  { at: [10, 23], landmark: lm("Merdeka 118", "supertall", "#8fb0cc", 5.5) },
  { at: [11, 25], landmark: lm("Stadium Merdeka", "stadium", "#e6e1d6", 0.4) },
  { at: [8, 20], landmark: lm("Petaling Street market", "hawker", "#2f7d4f", 0.35) },
  { at: [8, 21], landmark: lm("Petaling Street market", "hawker", "#2f7d4f", 0.35) },
  { at: [6, 18], landmark: lm("Central Market", "art_deco", "#6fa8c9", 0.6) },
  { at: [7, 15], landmark: lm("Masjid Jamek", "mosque", "#e9c9a0", 1) },
  { at: [4, 15], landmark: lm("Sultan Abdul Samad Building", "colonial", "#b8663c", 1.1) },
  { at: [3, 17], landmark: lm("Dataran Merdeka flagpole", "flagpole", "#ffffff", 1.2) },
  { at: [2, 22], landmark: lm("Masjid Negara", "mosque", "#dfe7ee", 1.2) },
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

  // Green lungs.
  rect(12, 9, 15, 12, "forest"); // Bukit Nanas
  rect(0, 13, 1, 25, "forest"); // edge of the Lake Gardens
  rect(22, 7, 25, 10, "park"); // KLCC Park
  rect(2, 15, 3, 17, "park"); // Dataran Merdeka padang
  rect(28, 23, 29, 25, "park"); // TRX city park
  rect(23, 9, 24, 9, "water"); // Lake Symphony

  for (const r of RIVERS) polyline(r, (x, y) => set(x, y, "water"));
  for (const r of ROADS) polyline(r, (x, y) => set(x, y, "road"));

  const landmarks = new Map<number, Landmark>();
  for (const {
    at: [x, y],
    landmark,
  } of LANDMARKS) {
    set(x, y, "landmark");
    landmarks.set(y * N + x, landmark);
  }
  return { kinds, landmarks };
}
