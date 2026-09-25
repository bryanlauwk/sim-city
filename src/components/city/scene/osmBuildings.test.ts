/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createCity, applyEvent } from "@/lib/city/simulation";
import { eventResultSchema } from "@/lib/city/schema";
import { buildRealGeometry, pieceHeight, realTiles, type OsmPiece } from "./osmBuildings";

const data = JSON.parse(readFileSync("public/osm/kl-buildings.json", "utf8")) as {
  license: string;
  buildings: [number, number, number[], number][];
};
const pieces: OsmPiece[] = data.buildings.map(([tile, heightM, pts, id]) => ({
  tile,
  heightM,
  pts,
  id,
}));

describe("real OpenStreetMap buildings", () => {
  test("the data is credited and fits the map", () => {
    expect(data.license).toContain("OpenStreetMap");
    expect(pieces.length).toBeGreaterThan(2000);
    for (const p of pieces) {
      expect(p.tile).toBeGreaterThanOrEqual(0);
      expect(p.tile).toBeLessThan(32 * 32);
      expect(p.pts.length % 2).toBe(0);
      for (const v of p.pts) expect(Math.abs(v)).toBeLessThanOrEqual(0.5);
    }
  });

  test("most of the starting city is real", () => {
    const s = createCity(42);
    const real = realTiles(s.grid, pieces);
    const built = s.grid.filter((t) => ["house", "shop", "tower"].includes(t.kind)).length;
    expect(real.size / built).toBeGreaterThan(0.75);
    for (const i of real) expect(["house", "shop", "tower"]).toContain(s.grid[i].kind);
  });

  test("a destroyed tile hands over to the procedural kit", () => {
    const s = createCity(42);
    const before = realTiles(s.grid, pieces);
    const next = applyEvent(
      s,
      "Sinkhole",
      eventResultSchema.parse({
        scale: "minor",
        headline: "x",
        subhead: "",
        quotes: [],
        stat_changes: { population: 0, happiness: 0, money: 0, pollution: 0, chaos: 0 },
        tile_ops: [{ op: "destroy", target: "towers", count: 5, build_kind: null, landmark: null }],
        ongoing: null,
        followups: [],
        spectacle: { actors: [], crowd: "ignore", responders: [] },
      }),
    );
    const after = realTiles(next.grid, pieces);
    const gone = [...before].filter((i) => !after.has(i));
    expect(gone.length).toBeGreaterThan(0);
    for (const i of gone) expect(next.grid[i].kind).toBe("rubble");
  });

  test("real heights are kept, unknown ones fit the tile", () => {
    const tall = { tile: 0, heightM: 425, pts: [], id: 1 };
    expect(pieceHeight(tall, "tower")).toBeCloseTo(5, 1);
    expect(pieceHeight({ ...tall, heightM: 6 }, "house")).toBeCloseTo(0.22, 2);
    const guess = pieceHeight({ ...tall, heightM: -1 }, "tower");
    expect(guess).toBeGreaterThanOrEqual(0.9);
    expect(guess).toBeLessThanOrEqual(2.5);
  });

  test("geometry is built only for live tiles", () => {
    const s = createCity(42);
    const real = realTiles(s.grid, pieces);
    const all = buildRealGeometry(pieces, real, s.grid);
    const none = buildRealGeometry(pieces, new Set(), s.grid);
    const verts = (g: typeof all) =>
      g.glass.getAttribute("position").count +
      g.masonry.getAttribute("position").count +
      g.roofs.getAttribute("position").count;
    expect(verts(all)).toBeGreaterThan(10000);
    expect(verts(none)).toBe(0);
  });
});
