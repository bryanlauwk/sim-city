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
  spectacle: {
    actors: [
      { kind: "meteor", label: "Meteor", color: "#553322", size: 4, count: 1, shape: "blob" },
    ],
    crowd: "flee",
    responders: ["fire", "ambulance"],
  },
  followups: [
    {
      delay_days: 2,
      note: "Crater declared a heritage site; hawker stalls move in.",
      stat_changes: { population: 0, happiness: 3, money: 500, pollution: 0, chaos: 0 },
      tile_ops: [{ op: "build", target: "center", count: 2, build_kind: "shop", landmark: null }],
    },
  ],
});

describe("city simulation", () => {
  test("seeded city has KL's roads, rivers, landmarks and residents", () => {
    const s = createCity(42);
    const c = countKinds(s.grid);
    expect(s.name).toBe("Kuala Lumpur");
    expect(c.road).toBeGreaterThan(150);
    expect(c.water).toBeGreaterThan(30);
    expect(c.forest).toBeGreaterThan(50);
    expect(s.grid.some((t) => t.landmark?.name === "Petronas Twin Towers")).toBe(true);
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
    expect(countKinds(next.grid).landmark).toBe(countKinds(s.grid).landmark + 1);
    expect(next.grid.some((t) => t.fire > 0)).toBe(true);
    expect(next.log).toHaveLength(1);
    expect(next.ongoing).toHaveLength(1);
    expect(next.scheduled).toHaveLength(1);
  });

  test("chain reactions fire as bulletins on schedule", () => {
    let s = applyEvent(createCity(5), "meteor", meteor);
    const shops = countKinds(s.grid).shop;
    s = tick(s);
    expect(s.bulletins).toHaveLength(0);
    s = tick(s);
    expect(s.bulletins).toHaveLength(1);
    expect(s.bulletins[0].text).toContain("heritage");
    expect(s.scheduled).toHaveLength(0);
    expect(countKinds(s.grid).shop).toBeGreaterThanOrEqual(shops);
  });

  test("district targets land in that district", () => {
    const s = createCity(8);
    const next = applyEvent(s, "fire in Chinatown", {
      ...meteor,
      tile_ops: [{ op: "burn", target: "chinatown", count: 4, build_kind: null, landmark: null }],
      followups: [],
    });
    const burning = next.grid.map((t, i) => (t.fire > 0 ? i : -1)).filter((i) => i >= 0);
    expect(burning.length).toBeGreaterThan(0);
    for (const i of burning) {
      const x = i % 32;
      const y = Math.floor(i / 32);
      expect(x >= 12 && x <= 16 && y >= 15 && y <= 19).toBe(true);
    }
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

describe("Claude output", () => {
  test("flat output converts, and unknown values fall back safely", async () => {
    const { fromClaude } = await import("./schema");
    const r = fromClaude({
      scale: "citywide",
      headline: "Whale lands",
      subhead: "Yes.",
      quotes: [{ name: "A", role: "B", text: "C" }],
      stats: { population: -10, happiness: 5, money: 0, pollution: 1, chaos: 20 },
      tile_ops: [
        {
          op: "landmark",
          target: "Merdeka",
          count: 1,
          build: "",
          landmark_name: "Whale",
          landmark_shape: "blob",
          landmark_color: "#445566",
          landmark_height: 1,
        },
        {
          op: "build",
          target: "bukit bintang",
          count: 2,
          build: "Shop",
          landmark_name: "",
          landmark_shape: "",
          landmark_color: "",
          landmark_height: 0,
        },
        {
          op: "teleport",
          target: "x",
          count: 1,
          build: "",
          landmark_name: "",
          landmark_shape: "",
          landmark_color: "",
          landmark_height: 0,
        },
      ],
      ongoing_label: "",
      ongoing_days: 0,
      ongoing_per_day: { population: 0, happiness: 0, money: 0, pollution: 0, chaos: 0 },
      actors: [
        { kind: "Whale", label: "Blue whale", color: "#4f6f8f", size: 4, count: 1, shape: "blob" },
        { kind: "dragon", label: "?", color: "red", size: 3, count: 1, shape: "wing" },
      ],
      crowd: "Flee",
      responders: ["fire", "coastguard"],
      followups: [{ delay_days: 2, note: "Satay stalls.", stats: {}, tile_ops: [] }],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.tile_ops).toHaveLength(2);
    expect(r.data.tile_ops[0].target).toBe("merdeka");
    expect(r.data.tile_ops[0].landmark?.name).toBe("Whale");
    expect(r.data.tile_ops[1]).toMatchObject({
      target: "bukit_bintang",
      build_kind: "shop",
      landmark: null,
    });
    expect(r.data.ongoing).toBeNull();
    expect(r.data.spectacle.actors.map((a) => a.kind)).toEqual(["whale"]);
    expect(r.data.spectacle.crowd).toBe("flee");
    expect(r.data.spectacle.responders).toEqual(["fire"]);
    expect(r.data.followups[0].stat_changes.happiness).toBe(0);
  });

  test("schema sent to Claude stays small", async () => {
    const { claudeOutputJsonSchema } = await import("./schema");
    const json = JSON.stringify(claudeOutputJsonSchema);
    expect(json.length).toBeLessThan(4000);
    expect((json.match(/"enum"/g) ?? []).length).toBeLessThanOrEqual(3);
  });
});
