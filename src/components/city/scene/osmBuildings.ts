import { useEffect, useState } from "react";
import * as THREE from "three";
import type { Tile, TileKind } from "@/lib/city/types";
import { hash, tileX, tileZ } from "./common";

/**
 * Real Kuala Lumpur buildings from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL): footprints clipped to the map's tiles, with their real
 * heights where OSM records one. See scripts/build_osm_buildings.py.
 *
 * A building tile the city started with shows its real buildings until
 * something happens to it (destroyed, redeveloped, rebuilt); from then on the
 * procedural building kit takes over. Landmarks keep their own models.
 */

export interface OsmPiece {
  tile: number;
  /** Metres, or -1 when OSM doesn't say. */
  heightM: number;
  /** Footprint, tile-local: x0, z0, x1, z1, … */
  pts: number[];
  /** Shared by the pieces of one building that spans tiles. */
  id: number;
}

const DATA_URL = "/osm/kl-buildings.json";
let loading: Promise<OsmPiece[]> | null = null;

export function loadOsmBuildings(): Promise<OsmPiece[]> {
  loading ??= fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`buildings ${res.status}`);
      return res.json() as Promise<{ buildings: [number, number, number[], number][] }>;
    })
    .then((d) => d.buildings.map(([tile, heightM, pts, id]) => ({ tile, heightM, pts, id })))
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** The real buildings, once loaded (null until then, or if they can't be). */
export function useOsmBuildings(): OsmPiece[] | null {
  const [pieces, setPieces] = useState<OsmPiece[] | null>(null);
  useEffect(() => {
    let live = true;
    loadOsmBuildings()
      .then((p) => live && setPieces(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return pieces;
}

const BUILT: TileKind[] = ["house", "shop", "tower"];

/** Tiles still showing the buildings the city started with. */
export function realTiles(grid: Tile[], pieces: OsmPiece[] | null): Set<number> {
  const out = new Set<number>();
  if (!pieces) return out;
  for (const p of pieces) {
    const t = grid[p.tile];
    if (t && t.builtDay === 0 && BUILT.includes(t.kind)) out.add(p.tile);
  }
  return out;
}

/** Map units per metre: the Petronas Towers' 452 m is about 5.4 units. */
const PER_METRE = 1 / 85;
const MIN_HEIGHT: Record<string, number> = { house: 0.22, shop: 0.35, tower: 0.6 };

/** Height in map units: the real one if known, else a plausible one for the tile. */
export function pieceHeight(p: OsmPiece, kind: TileKind): number {
  const floor = MIN_HEIGHT[kind] ?? 0.3;
  if (p.heightM > 0) return Math.min(6, Math.max(floor, p.heightM * PER_METRE));
  const r = hash(p.id, 17);
  if (kind === "tower") return 0.9 + r * 1.6;
  if (kind === "shop") return 0.35 + r * 0.4;
  return 0.22 + r * 0.16;
}

/** Heights at or above this read as glass towers; lower ones as masonry. */
export const GLASS_FROM = 1.1;

// A touch lighter than the kit's: large real facades read darker from above.
const GLASS = ["#93b8d2", "#a2cdd6", "#86a6bd", "#b7d2dc", "#7896ad", "#afc7bb", "#9db3c9"];
const MASONRY = ["#e3dccd", "#d6cfc2", "#c8c2b6", "#efe9dc", "#b9b3a8", "#ddd5c6", "#e9d7b5"];
const ROOF = ["#8c8a85", "#9a978f", "#7d7b76", "#a39f95"];

export interface RealGeometry {
  glass: THREE.BufferGeometry;
  masonry: THREE.BufferGeometry;
  roofs: THREE.BufferGeometry;
}

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  push(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: THREE.Color) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const pick = (list: string[], r: number) => list[Math.floor(r * list.length) % list.length];

/**
 * Walls (split into glass and masonry, for their facade shaders) and roofs
 * for the real buildings on the given tiles, as three merged geometries.
 */
export function buildRealGeometry(
  pieces: OsmPiece[],
  tiles: Set<number>,
  grid: Tile[],
): RealGeometry {
  const glass = new Builder();
  const masonry = new Builder();
  const roofs = new Builder();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const colour = new THREE.Color();
  const roofColour = new THREE.Color();

  for (const p of pieces) {
    if (!tiles.has(p.tile)) continue;
    const h = pieceHeight(p, grid[p.tile].kind);
    const isGlass = h >= GLASS_FROM;
    const walls = isGlass ? glass : masonry;
    colour.set(pick(isGlass ? GLASS : MASONRY, hash(p.id, 3)));
    roofColour.set(pick(ROOF, hash(p.id, 5)));
    const ox = tileX(p.tile);
    const oz = tileZ(p.tile);
    const count = p.pts.length / 2;
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < count; k++) {
      cx += p.pts[k * 2] / count;
      cz += p.pts[k * 2 + 1] / count;
    }
    // Walls: a quad per footprint edge, facing away from the centre.
    let along = 0;
    for (let k = 0; k < count; k++) {
      const x0 = p.pts[k * 2];
      const z0 = p.pts[k * 2 + 1];
      const x1 = p.pts[((k + 1) % count) * 2];
      const z1 = p.pts[((k + 1) % count) * 2 + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-4) continue;
      n.set(z1 - z0, 0, -(x1 - x0)).normalize();
      if (n.x * ((x0 + x1) / 2 - cx) + n.z * ((z0 + z1) / 2 - cz) < 0) n.negate();
      a.set(ox + x0, 0, oz + z0);
      b.set(ox + x1, 0, oz + z1);
      c.set(ox + x1, h, oz + z1);
      d.set(ox + x0, h, oz + z0);
      walls.push(a, n, along, 0, colour);
      walls.push(b, n, along + len, 0, colour);
      walls.push(c, n, along + len, h, colour);
      walls.push(a, n, along, 0, colour);
      walls.push(c, n, along + len, h, colour);
      walls.push(d, n, along, h, colour);
      along += len;
    }
    // Roof: the footprint, triangulated, at the top.
    const contour = Array.from(
      { length: count },
      (_, k) => new THREE.Vector2(p.pts[k * 2], p.pts[k * 2 + 1]),
    );
    for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      for (const i of [i0, i1, i2]) {
        a.set(ox + contour[i].x, h, oz + contour[i].y);
        roofs.push(a, up, contour[i].x, contour[i].y, roofColour);
      }
    }
  }
  return { glass: glass.build(), masonry: masonry.build(), roofs: roofs.build() };
}
