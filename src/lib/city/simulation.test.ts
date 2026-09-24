/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { eventResultSchema } from "./schema";
import { applyEvent, countKinds, createCity, replay, tick } from "./simulation";
import type { EventResult } from "./types";

const meteor: EventResult = eventResultSchema.parse({
  scale: "citywide",
  headline: "Meteor lands downtown, parking still available",
  subhead: "Officials describe the crater as 'roomy'.",
  quotes: [{ name: "Gus", role: "Parking warden", text: "Still a two-hour zone." }],
  stat_changes: { population: -40, happiness: -10, money: -500, pollution: 10, chaos: 20 },
  tile_ops: [
    { op: "destroy", target: "center", count: 4, build_kind: null, landmark: null },
    {
      op: "landmark",
      target: "center",
      count: 1,
      build_kind: null,
      landmark: { name: "The Crater", shape: "crater", color: "#553322", height: 0.4 },
    },
    { op: "burn", target: "commercial", count: 3, build_kind: null, landmark: null },
  ],
  ongoing: {
    label: "Crater tourism",
    duration_days: 5,
    per_day: { population: 0, happiness: 1, money: 20, pollution: 0, chaos: 0 },
  },
});

describe("city simulation", () => {
  test("seeded city has roads, buildings and residents", () => {
    const s = createCity(42);
    const c = countKinds(s.grid);
    expect(c.road).toBeGreaterThan(30);
    expect(c.house + c.shop + c.tower).toBeGreaterThan(10);
    expect(s.stats.population).toBeGreaterThan(0);
    expect(s.name.length).toBeGreaterThan(3);
  });

  test("city grows over time without events", () => {
    let s = createCity(7);
    const before = countKinds(s.grid);
    for (let i = 0; i < 60; i++) s = tick(s);
    const after = countKinds(s.grid);
    expect(after.house + after.shop + after.tower).toBeGreaterThan(
      before.house + before.shop + before.tower,
    );
    expect(s.collapsed).toBe(false);
  });

  test("events change the map and are logged", () => {
    let s = createCity(3);
    for (let i = 0; i < 5; i++) s = tick(s);
    const next = applyEvent(s, "a meteor hits downtown", meteor);
    expect(countKinds(next.grid).landmark).toBe(1);
    expect(next.grid.some((t) => t.fire > 0)).toBe(true);
    expect(next.log).toHaveLength(1);
    expect(next.ongoing).toHaveLength(1);
  });

  test("replay reproduces the exact city", () => {
    let s = createCity(99);
    for (let i = 0; i < 8; i++) s = tick(s);
    s = applyEvent(s, "meteor", meteor);
    for (let i = 0; i < 12; i++) s = tick(s);
    s = applyEvent(s, "meteor again", meteor);
    for (let i = 0; i < 4; i++) s = tick(s);
    const r = replay(99, s.log, s.day);
    expect(r).toEqual(s);
  });

  test("schema clamps absurd values", () => {
    const r = eventResultSchema.parse({
      ...meteor,
      stat_changes: { ...meteor.stat_changes, happiness: 9999 },
      tile_ops: Array(20).fill(meteor.tile_ops[0]),
    });
    expect(r.stat_changes.happiness).toBe(60);
    expect(r.tile_ops).toHaveLength(6);
  });
});

describe("share links", () => {
  test("round-trip a city through a share code", async () => {
    const { encodeShare, decodeShare } = await import("./persistence");
    let s = createCity(2024);
    for (let i = 0; i < 6; i++) s = tick(s);
    s = applyEvent(s, "meteor", meteor);
    for (let i = 0; i < 3; i++) s = tick(s);
    const code = await encodeShare(s);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeShare(code)).toEqual(s);
  });

  test("rejects garbage codes", async () => {
    const { decodeShare } = await import("./persistence");
    expect(decodeShare("not-a-real-code")).rejects.toThrow();
  });
});
