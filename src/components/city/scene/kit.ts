/**
 * The KL building kit: ordinary buildings are assembled from a handful of
 * parts (podium, glass shaft, concrete slab, crown, sign band, awning,
 * spire), so every block reads as Kuala Lumpur rather than stock clip-art.
 *
 * Coordinates are in tile units, local to the lot: x across the frontage,
 * y up, z towards the street (the renderer turns lots to face the road).
 */
import type { DistrictId } from "@/lib/city/types";
import { hash } from "./common";

export type KitGeo = "box" | "cyl";
export type KitMat = "glass" | "solid" | "accent";

export interface KitPart {
  geo: KitGeo;
  mat: KitMat;
  /** Centre of the part. */
  pos: [number, number, number];
  /** Width, height, depth (for cylinders: diameter, height, diameter). */
  size: [number, number, number];
  color: string;
}

const GLASS = ["#7fa6c2", "#8fbfc9", "#6f8fa8", "#a7c4cf", "#5d7d96", "#9cb5a8", "#88a0b8"];
const CONCRETE = ["#e3dccd", "#d6cfc2", "#c8c2b6", "#efe9dc", "#b9b3a8", "#ddd5c6"];
const PASTEL = ["#e9d7b5", "#d9e3d0", "#e6d0cf", "#d2dbe6", "#efe2c0"];
const SIGNS = ["#d7263d", "#f18f01", "#2e86ab", "#1b998b", "#c5283d", "#6a4c93", "#ffbe0b"];

const pick = <T>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length];

/** Taller towers where the real skyline is taller. */
const TOWER_LIFT: Partial<Record<DistrictId, number>> = {
  klcc: 0.8,
  trx: 1,
  raja_chulan: 0.5,
  bukit_bintang: 0.3,
  ampang: 0.3,
};

export function towerParts(tile: number, variant: number, district: DistrictId): KitPart[] {
  const r = (k: number) => hash(tile, 100 + k);
  const H = 1 + r(1) * 1.2 + (TOWER_LIFT[district] ?? 0);
  const glass = pick(GLASS, r(2));
  const conc = pick(CONCRETE, r(3));
  const podium: KitPart = {
    geo: "box",
    mat: "solid",
    pos: [0, 0.18, 0],
    size: [0.92, 0.36, 0.9],
    color: conc,
  };
  const base = 0.36;
  switch (variant % 7) {
    case 0: // podium, stepped curtain wall, and crown
      return [
        podium,
        {
          geo: "box",
          mat: "glass",
          pos: [0, base + H / 2, -0.05],
          size: [0.56, H, 0.56],
          color: glass,
        },
        ...[0.25, 0.5, 0.75].map((k) => ({
          geo: "box" as const,
          mat: "solid" as const,
          pos: [0, base + H * k, -0.05] as [number, number, number],
          size: [0.61, 0.035, 0.61] as [number, number, number],
          color: conc,
        })),
        {
          geo: "box",
          mat: "solid",
          pos: [0, base + H + 0.06, -0.05],
          size: [0.44, 0.12, 0.44],
          color: conc,
        },
      ];
    case 1: // slab tower with sun-shading fins and a coloured crown band
      return [
        podium,
        {
          geo: "box",
          mat: "glass",
          pos: [0, base + H / 2, -0.1],
          size: [0.76, H, 0.4],
          color: glass,
        },
        {
          geo: "box",
          mat: "accent",
          pos: [0, base + H + 0.03, -0.1],
          size: [0.78, 0.06, 0.42],
          color: pick(SIGNS, r(4)),
        },
        ...[-0.29, -0.15, 0, 0.15, 0.29].map((x) => ({
          geo: "box" as const,
          mat: "solid" as const,
          pos: [x, base + H / 2, 0.11] as [number, number, number],
          size: [0.025, H, 0.035] as [number, number, number],
          color: conc,
        })),
      ];
    case 2: // stepped tower with a spire and ledges at the setbacks
      return [
        {
          geo: "box",
          mat: "glass",
          pos: [0, (H * 0.62) / 2, 0],
          size: [0.68, H * 0.62, 0.68],
          color: glass,
        },
        {
          geo: "box",
          mat: "solid",
          pos: [0, H * 0.62, 0],
          size: [0.74, 0.045, 0.74],
          color: conc,
        },
        {
          geo: "box",
          mat: "glass",
          pos: [0, H * 0.62 + (H * 0.3) / 2, 0],
          size: [0.5, H * 0.3, 0.5],
          color: glass,
        },
        {
          geo: "cyl",
          mat: "solid",
          pos: [0, H * 0.92 + 0.25, 0],
          size: [0.05, 0.5, 0.05],
          color: "#e8e8e8",
        },
      ];
    case 3: // round glass tower with regular pale floor rings
      return [
        podium,
        {
          geo: "cyl",
          mat: "glass",
          pos: [0, base + H / 2, -0.05],
          size: [0.6, H, 0.6],
          color: glass,
        },
        {
          geo: "cyl",
          mat: "solid",
          pos: [0, base + H + 0.05, -0.05],
          size: [0.5, 0.1, 0.5],
          color: conc,
        },
        ...[0.25, 0.5, 0.75].map((k) => ({
          geo: "cyl" as const,
          mat: "solid" as const,
          pos: [0, base + H * k, -0.05] as [number, number, number],
          size: [0.64, 0.035, 0.64] as [number, number, number],
          color: conc,
        })),
      ];
    case 4: // twin slabs joined by a bridge
      return [
        podium,
        {
          geo: "box",
          mat: "glass",
          pos: [-0.22, base + H / 2, -0.05],
          size: [0.32, H, 0.6],
          color: glass,
        },
        {
          geo: "box",
          mat: "glass",
          pos: [0.22, base + (H * 0.85) / 2, -0.05],
          size: [0.32, H * 0.85, 0.6],
          color: glass,
        },
        {
          geo: "box",
          mat: "solid",
          pos: [0, base + H * 0.6, -0.05],
          size: [0.2, 0.08, 0.3],
          color: conc,
        },
      ];
    case 5: {
      // condominium: pastel balconies, glass rails, and a shaded roof deck
      const c = pick(PASTEL, r(5));
      const parts: KitPart[] = [
        { geo: "box", mat: "solid", pos: [0, H / 2, 0], size: [0.62, H, 0.52], color: c },
      ];
      for (let k = 1; k <= 3; k++)
        parts.push({
          geo: "box",
          mat: "glass",
          pos: [0, (H * k) / 4, 0],
          size: [0.64, 0.05, 0.54],
          color: glass,
        });
      for (let k = 1; k <= 4; k++)
        parts.push({
          geo: "box",
          mat: "accent",
          pos: [0, (H * k) / 5, 0.29],
          size: [0.72, 0.035, 0.12],
          color: pick(SIGNS, r(10 + k)),
        });
      parts.push({
        geo: "box",
        mat: "solid",
        pos: [0, H + 0.04, 0],
        size: [0.68, 0.08, 0.58],
        color: conc,
      });
      return parts;
    }
    default: {
      // stepped office tower with a contrasting mechanical crown
      return [
        podium,
        {
          geo: "box",
          mat: "glass",
          pos: [0, base + H * 0.38, 0],
          size: [0.72, H * 0.76, 0.7],
          color: glass,
        },
        {
          geo: "box",
          mat: "glass",
          pos: [0.04, base + H * 0.82, 0],
          size: [0.56, H * 0.18, 0.56],
          color: glass,
        },
        {
          geo: "box",
          mat: "accent",
          pos: [0, base + H * 0.66, 0.36],
          size: [0.76, 0.045, 0.04],
          color: pick(SIGNS, r(8)),
        },
        {
          geo: "box",
          mat: "solid",
          pos: [0, base + H + 0.04, 0],
          size: [0.58, 0.08, 0.58],
          color: conc,
        },
      ];
    }
  }
}

export function shopParts(tile: number, variant: number, district: DistrictId): KitPart[] {
  const r = (k: number) => hash(tile, 200 + k);
  const conc = pick(CONCRETE, r(1));
  const sign = pick(SIGNS, r(2));
  const glass = pick(GLASS, r(3));
  switch (variant % 6) {
    case 0: // shopping block: shopfront glass, sign band, awning
      return [
        { geo: "box", mat: "solid", pos: [0, 0.3, -0.02], size: [0.9, 0.6, 0.84], color: conc },
        { geo: "box", mat: "glass", pos: [0, 0.14, 0.41], size: [0.84, 0.2, 0.02], color: glass },
        { geo: "box", mat: "accent", pos: [0, 0.42, 0.41], size: [0.62, 0.1, 0.02], color: sign },
        { geo: "box", mat: "accent", pos: [0, 0.26, 0.46], size: [0.88, 0.02, 0.12], color: sign },
      ];
    case 1: // mid-rise office with a glass front
      return [
        { geo: "box", mat: "solid", pos: [0, 0.5, 0], size: [0.8, 1, 0.78], color: conc },
        { geo: "box", mat: "glass", pos: [0, 0.52, 0.4], size: [0.66, 0.84, 0.02], color: glass },
        { geo: "box", mat: "accent", pos: [0.3, 0.7, 0.41], size: [0.08, 0.5, 0.03], color: sign },
      ];
    case 2: // low mall with a rooftop billboard
      return [
        { geo: "box", mat: "solid", pos: [0, 0.22, 0], size: [0.94, 0.44, 0.9], color: conc },
        { geo: "box", mat: "glass", pos: [0, 0.22, 0.46], size: [0.9, 0.3, 0.02], color: glass },
        { geo: "box", mat: "accent", pos: [0, 0.6, -0.1], size: [0.6, 0.28, 0.04], color: sign },
        {
          geo: "box",
          mat: "solid",
          pos: [0, 0.5, -0.1],
          size: [0.04, 0.12, 0.04],
          color: "#555555",
        },
      ];
    default: // budget hotel: tall narrow block with a vertical sign
      return [
        {
          geo: "box",
          mat: "solid",
          pos: [0, 0.6, -0.05],
          size: [0.7, 1.2, 0.56],
          color: pick(PASTEL, r(4)),
        },
        { geo: "box", mat: "glass", pos: [0, 0.65, 0.24], size: [0.6, 1, 0.02], color: glass },
        { geo: "box", mat: "accent", pos: [-0.3, 0.8, 0.27], size: [0.06, 0.6, 0.06], color: sign },
      ];
    case 4: {
      // covered five-foot way and a deep, shaded shopfront
      const heritage = district === "changkat" || district === "jalan_alor" || district === "pudu";
      const facade = heritage ? pick(PASTEL, r(5)) : conc;
      return [
        { geo: "box", mat: "solid", pos: [0, 0.36, 0], size: [0.88, 0.72, 0.78], color: facade },
        { geo: "box", mat: "glass", pos: [0, 0.2, 0.4], size: [0.72, 0.28, 0.025], color: glass },
        { geo: "box", mat: "accent", pos: [0, 0.48, 0.4], size: [0.76, 0.09, 0.035], color: sign },
        { geo: "box", mat: "solid", pos: [0, 0.56, 0.08], size: [0.94, 0.045, 0.86], color: conc },
        ...[-0.37, 0.37].map((x) => ({
          geo: "box" as const,
          mat: "solid" as const,
          pos: [x, 0.28, 0.4] as [number, number, number],
          size: [0.045, 0.5, 0.08] as [number, number, number],
          color: conc,
        })),
        ...[-0.24, 0, 0.24].map((x) => ({
          geo: "box" as const,
          mat: "accent" as const,
          pos: [x, 0.7, 0.4] as [number, number, number],
          size: [0.045, 0.12, 0.035] as [number, number, number],
          color: sign,
        })),
      ];
    }
    case 5: // low commercial podium with rooftop plant and a glazed arcade
      return [
        { geo: "box", mat: "solid", pos: [0, 0.22, 0], size: [0.94, 0.44, 0.9], color: conc },
        { geo: "box", mat: "glass", pos: [0, 0.2, 0.46], size: [0.86, 0.28, 0.025], color: glass },
        { geo: "box", mat: "accent", pos: [0, 0.39, 0.48], size: [0.88, 0.07, 0.035], color: sign },
        { geo: "box", mat: "solid", pos: [0, 0.48, 0], size: [0.98, 0.045, 0.94], color: conc },
        {
          geo: "box",
          mat: "solid",
          pos: [-0.24, 0.59, -0.12],
          size: [0.18, 0.18, 0.2],
          color: conc,
        },
        {
          geo: "box",
          mat: "solid",
          pos: [0.16, 0.58, -0.14],
          size: [0.22, 0.16, 0.18],
          color: conc,
        },
      ];
  }
}
