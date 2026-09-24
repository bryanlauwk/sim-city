/**
 * A stylised Kuala Lumpur on a 32×32 grid. Not to scale — it keeps the
 * shape people recognise: the Klang and Gombak rivers meeting at Masjid
 * Jamek, the colonial core around Dataran Merdeka, Chinatown to the south,
 * the KLCC / Bukit Bintang golden triangle to the east, green lungs at the
 * Lake Gardens, Bukit Nanas and Titiwangsa, and suburbs sprawling outwards.
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

export const DISTRICTS: District[] = [
  {
    id: "bukit_nanas",
    name: "Bukit Nanas",
    rect: [16, 12, 19, 14],
    mix: { house: 0, shop: 0, tower: 0 },
    density: 0,
    protected: true,
  },
  {
    id: "lake_gardens",
    name: "Perdana Lake Gardens",
    rect: [1, 11, 6, 19],
    mix: { house: 0, shop: 0, tower: 0 },
    density: 0,
    protected: true,
  },
  {
    id: "titiwangsa",
    name: "Titiwangsa",
    rect: [12, 0, 19, 5],
    mix: { house: 0.6, shop: 0.3, tower: 0.1 },
    density: 0.3,
  },
  {
    id: "chow_kit",
    name: "Chow Kit",
    rect: [11, 6, 14, 11],
    mix: { house: 0.3, shop: 0.6, tower: 0.1 },
    density: 0.6,
  },
  {
    id: "kampung_baru",
    name: "Kampung Baru",
    rect: [15, 6, 19, 11],
    mix: { house: 0.85, shop: 0.15, tower: 0 },
    density: 0.6,
  },
  {
    id: "klcc",
    name: "KLCC",
    rect: [20, 6, 27, 13],
    mix: { house: 0.05, shop: 0.35, tower: 0.6 },
    density: 0.6,
  },
  {
    id: "merdeka",
    name: "Dataran Merdeka",
    rect: [7, 10, 11, 15],
    mix: { house: 0.2, shop: 0.5, tower: 0.3 },
    density: 0.5,
  },
  {
    id: "chinatown",
    name: "Chinatown",
    rect: [12, 15, 16, 19],
    mix: { house: 0.2, shop: 0.8, tower: 0 },
    density: 0.75,
  },
  {
    id: "bukit_bintang",
    name: "Bukit Bintang",
    rect: [17, 15, 25, 19],
    mix: { house: 0.05, shop: 0.55, tower: 0.4 },
    density: 0.7,
  },
  {
    id: "sentral",
    name: "KL Sentral",
    rect: [7, 20, 12, 24],
    mix: { house: 0.1, shop: 0.4, tower: 0.5 },
    density: 0.6,
  },
  {
    id: "pudu",
    name: "Pudu",
    rect: [13, 20, 19, 25],
    mix: { house: 0.35, shop: 0.4, tower: 0.25 },
    density: 0.5,
  },
  {
    id: "brickfields",
    name: "Brickfields",
    rect: [5, 25, 11, 29],
    mix: { house: 0.6, shop: 0.4, tower: 0 },
    density: 0.5,
  },
  {
    id: "bangsar",
    name: "Bangsar",
    rect: [0, 23, 4, 31],
    mix: { house: 0.8, shop: 0.2, tower: 0 },
    density: 0.4,
  },
  {
    id: "mont_kiara",
    name: "Mont Kiara",
    rect: [0, 0, 8, 8],
    mix: { house: 0.5, shop: 0.1, tower: 0.4 },
    density: 0.35,
  },
  {
    id: "cheras",
    name: "Cheras",
    rect: [20, 20, 31, 31],
    mix: { house: 0.8, shop: 0.2, tower: 0 },
    density: 0.25,
  },
  {
    id: "ampang",
    name: "Ampang",
    rect: [28, 0, 31, 19],
    mix: { house: 0.7, shop: 0.3, tower: 0 },
    density: 0.25,
  },
];

const OUTSKIRTS: District = {
  id: "outskirts",
  name: "the outskirts",
  rect: [0, 0, N - 1, N - 1],
  mix: { house: 0.8, shop: 0.2, tower: 0 },
  density: 0.15,
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
  // Sungai Klang, from Ampang down past Brickfields
  [
    [31, 1],
    [26, 4],
    [21, 8],
    [16, 11],
    [12, 14],
    [11, 18],
    [9, 23],
    [8, 27],
    [7, 31],
  ],
  // Sungai Gombak, from the north down to the confluence
  [
    [9, 0],
    [10, 5],
    [11, 10],
    [12, 14],
  ],
];

const ROADS: Pt[][] = [
  [
    [5, 6],
    [27, 6],
    [27, 24],
  ], // Jalan Tun Razak
  [
    [13, 12],
    [31, 12],
  ], // Jalan Ampang
  [
    [13, 9],
    [20, 9],
    [21, 17],
  ], // Jalan Sultan Ismail
  [
    [13, 17],
    [31, 17],
  ], // Jalan Pudu / Bukit Bintang
  [
    [0, 24],
    [11, 21],
    [16, 19],
  ], // Federal Highway
  [
    [12, 15],
    [12, 31],
  ], // Jalan Tun Sambanthan
  [
    [13, 0],
    [13, 17],
  ], // Jalan Tuanku Abdul Rahman
  [
    [0, 10],
    [12, 12],
  ], // Jalan Parlimen
  [
    [16, 19],
    [22, 31],
  ], // Jalan Syed Putra
  [
    [27, 24],
    [31, 28],
  ], // Middle Ring Road (east)
  [
    [27, 6],
    [31, 3],
  ], // Middle Ring Road (north-east)
  [
    [12, 10],
    [4, 0],
  ], // Jalan Ipoh
  [
    [11, 22],
    [2, 30],
  ], // Jalan Bangsar
  [
    [27, 17],
    [27, 24],
  ],
  [
    [17, 24],
    [31, 24],
  ], // Jalan Cheras
  [
    [0, 5],
    [5, 6],
  ], // Jalan Duta
];

export interface RailLine {
  name: string;
  color: string;
  points: Pt[];
  stations: string[];
}

export const RAIL_LINES: RailLine[] = [
  {
    name: "LRT Kelana Jaya",
    color: "#d9223b",
    points: [
      [0, 28],
      [9, 22],
      [11, 18],
      [13, 15],
      [15, 12],
      [22, 11],
      [26, 9],
      [31, 6],
    ],
    stations: [
      "Kerinchi",
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
      [0, 9],
      [8, 14],
      [11, 17],
      [15, 17],
      [20, 17],
      [24, 21],
      [31, 27],
    ],
    stations: [
      "Semantan",
      "Muzium Negara",
      "Pasar Seni",
      "Merdeka",
      "Bukit Bintang",
      "Tun Razak Exchange",
      "Cochrane",
    ],
  },
  {
    name: "KL Monorail",
    color: "#86bc25",
    points: [
      [9, 22],
      [13, 20],
      [19, 18],
      [21, 14],
      [17, 10],
      [15, 4],
    ],
    stations: [
      "KL Sentral",
      "Maharajalela",
      "Bukit Bintang",
      "Raja Chulan",
      "Medan Tuanku",
      "Titiwangsa",
    ],
  },
];

/** Pre-placed icons of the skyline. */
const LANDMARKS: { at: Pt; landmark: Landmark }[] = [
  {
    at: [22, 10],
    landmark: { name: "Petronas Twin Towers", shape: "twin_towers", color: "#cfd5dd", height: 4 },
  },
  { at: [17, 13], landmark: { name: "Menara KL", shape: "needle", color: "#ece6d8", height: 3.4 } },
  {
    at: [15, 21],
    landmark: { name: "Merdeka 118", shape: "supertall", color: "#8fb0cc", height: 4 },
  },
  {
    at: [13, 14],
    landmark: { name: "Masjid Jamek", shape: "mosque", color: "#e9dcc6", height: 1 },
  },
  {
    at: [10, 13],
    landmark: {
      name: "Sultan Abdul Samad Building",
      shape: "colonial",
      color: "#b8663c",
      height: 1.1,
    },
  },
  {
    at: [9, 18],
    landmark: { name: "Masjid Negara", shape: "mosque", color: "#dfe7ee", height: 1.2 },
  },
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

  // Green lungs and hills.
  rect(1, 11, 6, 19, "forest"); // Lake Gardens
  rect(2, 13, 5, 17, "park");
  rect(16, 12, 19, 14, "forest"); // Bukit Nanas
  rect(29, 0, 31, 10, "forest"); // Ampang hills
  rect(30, 11, 31, 22, "forest");
  rect(28, 28, 31, 31, "forest");
  rect(0, 0, 2, 3, "forest"); // Bukit Kiara
  rect(0, 17, 0, 22, "forest");
  rect(13, 1, 18, 4, "park"); // Titiwangsa
  rect(22, 12, 24, 13, "park"); // KLCC Park
  rect(9, 14, 10, 15, "park"); // Dataran Merdeka
  rect(6, 18, 8, 19, "park"); // around Masjid Negara

  // Lakes and rivers.
  rect(14, 2, 16, 3, "water");
  rect(3, 15, 4, 16, "water");
  for (const r of RIVERS) polyline(r, (x, y) => set(x, y, "water"));

  // Roads (they bridge rivers).
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
