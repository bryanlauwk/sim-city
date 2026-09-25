/**
 * Maple Hollow's building kit, 1985: family houses (colonials, ranches, cape
 * cods, split-levels, and trailers in Pine Acres), Main Street storefronts,
 * and brick blocks (apartments, the savings & loan, a motel, a factory, the
 * lab's annexes). Each is assembled from a few parts drawn with shared
 * instanced meshes.
 *
 * Coordinates are in tile units, local to the lot: x across the frontage,
 * y up, z towards the street (the renderer turns lots to face the road).
 */
import type { DistrictId } from "@/lib/city/types";
import { hash } from "./common";

/** gable: a triangular prism roof, ridge along x. */
export type KitGeo = "box" | "cyl" | "gable" | "cone";
export type KitMat = "glass" | "brick" | "siding" | "roof" | "trim" | "accent";

export interface KitPart {
  geo: KitGeo;
  mat: KitMat;
  /** Centre of the part. */
  pos: [number, number, number];
  /** Width, height, depth (for cylinders and cones: diameter, height, diameter). */
  size: [number, number, number];
  color: string;
  /** Turn about y, radians. */
  yaw?: number;
}

type V3 = [number, number, number];
const part =
  (geo: KitGeo, mat: KitMat) =>
  (pos: V3, size: V3, color: string, yaw?: number): KitPart => ({
    geo,
    mat,
    pos,
    size,
    color,
    ...(yaw ? { yaw } : {}),
  });
const box = (mat: KitMat) => part("box", mat);
const Glass = box("glass");
const Brick = box("brick");
const Siding = box("siding");
const Trim = box("trim");
const Sign = box("accent");
const Gable = part("gable", "roof");
const Tank = part("cyl", "trim");
const Stack = part("cyl", "brick");

const SIDING = [
  "#efe9da", // cream
  "#c9d6c3", // sage
  "#b9c8d8", // powder blue
  "#e8d5a2", // butter
  "#b09274", // brown
  "#dcc6b2", // tan
  "#f3f1ec", // white
  "#a9b7a4", // avocado
  "#d8b7a8", // dusty rose
];
const ROOFS = ["#8d8883", "#716c68", "#80604d", "#5d6672", "#6b5a4e"];
const DOORS = ["#8e2b2b", "#2f5a3d", "#2b3b5a", "#6a4a2f", "#f3f1ec"];
const BRICK = ["#f2e4dc", "#e6cfc4", "#d9c0b4", "#f5ece6", "#cfae9f"];
const STUCCO = ["#e8e0d0", "#d9d2c3", "#efe7d6", "#cfd4d2"];
const SIGNS = ["#d7263d", "#f18f01", "#2e86ab", "#1b998b", "#ffbe0b", "#e84393", "#6a4c93"];
const WINDOW = "#3a4a5c";
const WHITE = "#f4f1ea";

const pick = <T>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length];
const shift = (p: KitPart, dx: number, dy = 0): KitPart => ({
  ...p,
  pos: [p.pos[0] + dx, p.pos[1] + dy, p.pos[2]],
});

/** A row of windows across a wall at height y, facing +z at depth z. */
function windows(n: number, width: number, y: number, z: number, w = 0.07, h = 0.08): KitPart[] {
  return Array.from({ length: n }, (_, k) =>
    Glass([-width / 2 + (width / n) * (k + 0.5), y, z], [w, h, 0.012], WINDOW),
  );
}

/** A picket fence along the front of the lot. */
function picketFence(): KitPart[] {
  return [
    Trim([-0.3, 0.035, 0.44], [0.34, 0.012, 0.012], WHITE),
    Trim([0.3, 0.035, 0.44], [0.34, 0.012, 0.012], WHITE),
    ...[-0.46, -0.3, -0.14, 0.14, 0.3, 0.46].map((x) =>
      Trim([x, 0.03, 0.44], [0.012, 0.06, 0.012], WHITE),
    ),
  ];
}

export function houseParts(tile: number, variant: number, district: DistrictId): KitPart[] {
  const r = (k: number) => hash(tile, 300 + k);
  const wall = pick(SIDING, r(1));
  const roof = pick(ROOFS, r(2));
  const door = pick(DOORS, r(3));
  const fence = r(4) < 0.35 ? picketFence() : [];
  const mailbox = [
    Trim([0.36, 0.04, 0.4], [0.01, 0.08, 0.01], "#6a5a48"),
    Trim([0.36, 0.085, 0.4], [0.03, 0.025, 0.05], r(5) < 0.5 ? "#2b3b5a" : "#8a8f96"),
  ];

  if (district === "pine_acres") {
    // A single-wide trailer with a stripe and a little porch.
    const body = pick(["#f3f1ec", "#e9e1cc", "#dfe6e9", "#e8dcc8"], r(6));
    return [
      Siding([0, 0.1, -0.05], [0.66, 0.14, 0.24], body),
      Sign([0, 0.12, 0.072], [0.66, 0.018, 0.004], pick(["#b5552d", "#3d6c8e", "#6b8f3a"], r(7))),
      Trim([0, 0.18, -0.05], [0.68, 0.02, 0.26], "#b8b8b0"),
      Trim([0, 0.03, -0.05], [0.62, 0.05, 0.2], "#5a5550"),
      ...windows(3, 0.5, 0.11, 0.072, 0.08, 0.05),
      Trim([0.18, 0.05, 0.12], [0.14, 0.02, 0.1], "#8a7a66"),
      ...mailbox,
    ];
  }

  switch (variant % 5) {
    case 0: // two-storey colonial
      return [
        Siding([0, 0.18, -0.06], [0.54, 0.36, 0.38], wall),
        Gable([0, 0.44, -0.06], [0.58, 0.16, 0.44], roof),
        ...windows(4, 0.46, 0.28, 0.132),
        Glass([-0.16, 0.1, 0.132], [0.07, 0.08, 0.012], WINDOW),
        Glass([0.16, 0.1, 0.132], [0.07, 0.08, 0.012], WINDOW),
        Trim([0, 0.07, 0.136], [0.07, 0.13, 0.012], door),
        Trim([0, 0.16, 0.17], [0.16, 0.012, 0.08], WHITE),
        Stack([0.22, 0.46, -0.12], [0.06, 0.2, 0.06], "#e6cfc4"),
        ...fence,
        ...mailbox,
      ];
    case 1: // ranch with an attached garage
      return [
        Siding([-0.08, 0.1, -0.06], [0.5, 0.2, 0.36], wall),
        Gable([-0.08, 0.25, -0.06], [0.54, 0.1, 0.42], roof),
        Siding([0.3, 0.09, -0.02], [0.26, 0.18, 0.34], wall),
        Gable([0.3, 0.22, -0.02], [0.3, 0.08, 0.38], roof),
        Trim([0.3, 0.07, 0.152], [0.2, 0.13, 0.008], WHITE),
        ...windows(3, 0.4, 0.11, 0.122, 0.08, 0.07).map((p) => shift(p, -0.08)),
        Trim([-0.08, 0.07, 0.126], [0.06, 0.12, 0.012], door),
        ...fence,
        ...mailbox,
      ];
    case 2: // cape cod: steep roof and dormers
      return [
        Siding([0, 0.12, -0.05], [0.48, 0.24, 0.36], wall),
        Gable([0, 0.36, -0.05], [0.52, 0.24, 0.42], roof),
        ...[-0.13, 0.13].flatMap((x) => [
          Siding([x, 0.34, 0.08], [0.1, 0.09, 0.1], wall),
          Gable([x, 0.41, 0.08], [0.12, 0.06, 0.12], roof, Math.PI / 2),
          Glass([x, 0.34, 0.132], [0.05, 0.05, 0.01], WINDOW),
        ]),
        Glass([-0.14, 0.12, 0.132], [0.08, 0.08, 0.012], WINDOW),
        Glass([0.14, 0.12, 0.132], [0.08, 0.08, 0.012], WINDOW),
        Trim([0, 0.08, 0.136], [0.07, 0.14, 0.012], door),
        Stack([-0.2, 0.4, -0.14], [0.06, 0.2, 0.06], "#e6cfc4"),
        ...fence,
        ...mailbox,
      ];
    case 3: // split-level
      return [
        Siding([-0.12, 0.1, -0.06], [0.32, 0.2, 0.36], wall),
        Gable([-0.12, 0.25, -0.06], [0.36, 0.1, 0.42], roof),
        Siding([0.16, 0.16, -0.08], [0.28, 0.32, 0.34], pick(SIDING, r(8))),
        Gable([0.16, 0.37, -0.08], [0.32, 0.1, 0.4], roof),
        ...windows(2, 0.28, 0.11, 0.122, 0.07, 0.07).map((p) => shift(p, -0.12)),
        ...windows(2, 0.24, 0.24, 0.092).map((p) => shift(p, 0.16)),
        Trim([0.16, 0.07, 0.096], [0.06, 0.12, 0.012], door),
        ...mailbox,
      ];
    default: // farmhouse with a porch
      return [
        Siding([0, 0.17, -0.08], [0.46, 0.34, 0.34], wall),
        Gable([0, 0.42, -0.08], [0.5, 0.16, 0.4], roof, Math.PI / 2),
        Trim([0, 0.12, 0.13], [0.54, 0.012, 0.1], WHITE),
        Gable([0, 0.14, 0.13], [0.54, 0.04, 0.1], roof),
        ...[-0.25, 0, 0.25].map((x) => Trim([x, 0.06, 0.175], [0.015, 0.12, 0.015], WHITE)),
        ...windows(3, 0.4, 0.27, 0.092),
        Glass([-0.13, 0.1, 0.092], [0.07, 0.08, 0.012], WINDOW),
        Glass([0.13, 0.1, 0.092], [0.07, 0.08, 0.012], WINDOW),
        Trim([0, 0.07, 0.094], [0.06, 0.12, 0.012], door),
        ...fence,
        ...mailbox,
      ];
  }
}

export function shopParts(tile: number, variant: number, district: DistrictId): KitPart[] {
  const r = (k: number) => hash(tile, 200 + k);
  const brick = pick(BRICK, r(1));
  const sign = pick(SIGNS, r(2));
  const trim = pick([WHITE, "#d8cbb0", "#9aa39a"], r(3));

  if (district === "lab") {
    // A corrugated shed with a fuel tank.
    return [
      Siding([0, 0.14, -0.05], [0.7, 0.28, 0.5], "#b9bdbd"),
      Gable([0, 0.33, -0.05], [0.72, 0.1, 0.54], "#9a9e9e"),
      Tank([0.3, 0.1, 0.3], [0.14, 0.2, 0.14], "#dfe3e3"),
      Sign([-0.2, 0.2, 0.202], [0.18, 0.05, 0.01], "#e1b12c"),
    ];
  }
  if (district === "farms") {
    // A farm stand and a silo.
    return [
      Siding([-0.1, 0.1, 0], [0.4, 0.2, 0.3], "#b8483a"),
      Gable([-0.1, 0.24, 0], [0.44, 0.08, 0.34], "#6b5a4e"),
      part("cyl", "siding")([0.28, 0.3, -0.18], [0.18, 0.6, 0.18], "#c9ccc9"),
      part("cone", "roof")([0.28, 0.66, -0.18], [0.2, 0.12, 0.2], "#8d8883"),
      Sign([-0.1, 0.16, 0.152], [0.26, 0.05, 0.01], "#f18f01"),
    ];
  }
  if (district === "mall") {
    // A strip-mall unit: stucco, a glass front and a lit sign band.
    return [
      Siding([0, 0.14, -0.02], [0.92, 0.28, 0.8], pick(STUCCO, r(4))),
      Glass([0, 0.1, 0.382], [0.8, 0.16, 0.012], WINDOW),
      Sign([0, 0.24, 0.39], [0.7, 0.06, 0.02], sign),
      Trim([0, 0.3, -0.02], [0.96, 0.03, 0.84], trim),
    ];
  }

  switch (variant % 5) {
    case 0: // two-storey brick with a striped awning
      return [
        Brick([0, 0.24, -0.02], [0.86, 0.48, 0.8], brick),
        Glass([0, 0.1, 0.382], [0.7, 0.15, 0.012], WINDOW),
        Sign([0, 0.21, 0.4], [0.76, 0.05, 0.02], sign),
        Sign([0, 0.17, 0.44], [0.78, 0.012, 0.1], pick(SIGNS, r(5))),
        Trim([0, 0.49, -0.02], [0.9, 0.03, 0.84], trim),
      ];
    case 1: // one-storey shop with a parapet sign
      return [
        Brick([0, 0.16, -0.02], [0.88, 0.32, 0.8], brick),
        Glass([0, 0.11, 0.382], [0.74, 0.16, 0.012], WINDOW),
        Sign([0, 0.36, 0.3], [0.56, 0.14, 0.03], sign),
        Trim([0, 0.33, -0.02], [0.9, 0.025, 0.82], trim),
      ];
    case 2: // corner store with a painted wall sign
      return [
        Brick([0, 0.2, -0.02], [0.86, 0.4, 0.8], brick),
        Glass([-0.12, 0.1, 0.382], [0.44, 0.14, 0.012], WINDOW),
        Trim([0.22, 0.08, 0.384], [0.08, 0.14, 0.012], "#6a4a2f"),
        Sign([0.434, 0.28, 0], [0.004, 0.12, 0.5], sign),
        Trim([0, 0.41, -0.02], [0.88, 0.02, 0.82], trim),
      ];
    case 3: // stucco pharmacy with a vertical neon sign
      return [
        Siding([0, 0.18, -0.02], [0.86, 0.36, 0.8], pick(STUCCO, r(6))),
        Glass([0, 0.11, 0.382], [0.72, 0.16, 0.012], WINDOW),
        Sign([0.34, 0.3, 0.42], [0.06, 0.26, 0.04], sign),
        Trim([0, 0.37, -0.02], [0.88, 0.02, 0.82], trim),
      ];
    default: // hardware store: wide, low, wooden false front
      return [
        Siding([0, 0.14, -0.04], [0.92, 0.28, 0.76], pick(["#8a6a4a", "#a58360", "#6f5a44"], r(7))),
        Siding([0, 0.3, 0.33], [0.92, 0.16, 0.03], pick(["#8a6a4a", "#a58360"], r(8))),
        Glass([0, 0.1, 0.345], [0.7, 0.13, 0.012], WINDOW),
        Sign([0, 0.3, 0.35], [0.6, 0.07, 0.012], sign),
      ];
  }
}

export function towerParts(tile: number, variant: number, district: DistrictId): KitPart[] {
  const r = (k: number) => hash(tile, 100 + k);
  const brick = pick(BRICK, r(1));
  const trim = pick([WHITE, "#d8cbb0", "#b9b3a8"], r(2));

  if (district === "lab") {
    // A windowless concrete annex with a dish and a mast.
    const h = 0.4 + r(3) * 0.3;
    return [
      Siding([0, h / 2, 0], [0.8, h, 0.7], "#dcdcd4"),
      Trim([0, h + 0.02, 0], [0.84, 0.04, 0.74], "#b9b9b2"),
      Tank([0.2, h + 0.1, -0.1], [0.24, 0.03, 0.24], "#eeeeea"),
      Trim([-0.25, h + 0.25, 0.1], [0.02, 0.5, 0.02], "#9a9e9e"),
      Sign([-0.25, h + 0.5, 0.1], [0.04, 0.04, 0.04], "#ff3b30"),
      ...windows(4, 0.6, h * 0.6, 0.352, 0.06, 0.03),
    ];
  }

  switch (variant % 4) {
    case 0: {
      // brick apartments with a water tank on the roof
      const h = 0.5 + r(4) * 0.25;
      return [
        Brick([0, h / 2, -0.04], [0.72, h, 0.62], brick),
        Trim([0, h + 0.015, -0.04], [0.76, 0.03, 0.66], trim),
        Trim([0, 0.07, 0.272], [0.12, 0.14, 0.01], "#4a3a2a"),
        Tank([0.18, h + 0.12, -0.12], [0.14, 0.14, 0.14], "#8a6a4a"),
        Trim([0.15, h + 0.04, -0.12], [0.012, 0.08, 0.012], "#555555"),
        Trim([0.21, h + 0.04, -0.12], [0.012, 0.08, 0.012], "#555555"),
      ];
    }
    case 1: {
      // savings & loan: trim bands and a sign up top
      const h = 0.7 + r(5) * 0.25;
      return [
        Brick([0, h / 2, -0.04], [0.66, h, 0.6], brick),
        Trim([0, h * 0.3, -0.04], [0.68, 0.02, 0.62], trim),
        Trim([0, h * 0.6, -0.04], [0.68, 0.02, 0.62], trim),
        Trim([0, h + 0.03, -0.04], [0.7, 0.06, 0.64], trim),
        Glass([0, 0.1, 0.262], [0.5, 0.16, 0.012], WINDOW),
        Sign([0, h * 0.85, 0.27], [0.3, 0.06, 0.01], pick(SIGNS, r(6))),
      ];
    }
    case 2: // two-storey motel with a neon sign on a pole
      return [
        Siding([0, 0.14, -0.1], [0.86, 0.28, 0.4], pick(STUCCO, r(7))),
        Trim([0, 0.145, 0.12], [0.86, 0.01, 0.06], trim),
        Trim([0, 0.3, -0.06], [0.9, 0.03, 0.5], "#a86a3a"),
        ...windows(5, 0.78, 0.07, 0.102, 0.06, 0.06),
        ...windows(5, 0.78, 0.21, 0.102, 0.06, 0.06),
        Trim([0.38, 0.25, 0.34], [0.02, 0.5, 0.02], "#666666"),
        Sign([0.38, 0.52, 0.34], [0.22, 0.12, 0.03], pick(SIGNS, r(8))),
      ];
    default: {
      // factory with a saw-tooth roof and a smokestack
      const h = 0.34;
      return [
        Brick([0, h / 2, 0], [0.86, h, 0.76], brick),
        ...[-0.26, 0, 0.26].map((z) => Gable([0, h + 0.05, z], [0.88, 0.1, 0.24], "#7d7a74")),
        Stack([0.3, 0.55, -0.25], [0.1, 1.1, 0.1], brick),
        ...windows(4, 0.7, 0.2, 0.382, 0.1, 0.1),
      ];
    }
  }
}
