/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { applyModels, modelPath, parseIndex, rankModels, words } from "./modelSearch";
import { eventResultSchema } from "./schema";
import type { Actor } from "./types";

// A tiny index in the real format: best-rated first; a negative author index means CC0.
const index = parseIndex({
  v: 1,
  authors: ["alice", "bob", "carol"],
  models: [
    ["aaaa", 12, "Sci fi Monitor", 0, "screen computer"],
    ["bbbb", 3, "Durian", 1, "fruit"],
    ["cccc", 140, "Box of Durian", 2, ""],
    ["dddd", 7, "Red Lizard", 0, "reptile"],
    ["eeee", 9, "Whale skeleton", 1, "museum"],
    ["ffff", 44, "Blue Whale Calf", -3, "ocean"],
    ["gggg", 5, "Rubber Duckie", 0, "bath"],
    ["hhhh", 6, "Tari", 1, ""],
  ]
    .map((r) => r.join("\t"))
    .join("\n"),
});

const names = (terms: string) => rankModels(index, terms).map((m) => m.name);

describe("free model search", () => {
  test("parses the index format, including CC0 authors", () => {
    expect(index).toHaveLength(8);
    const calf = index.find((m) => m.uid === "ffff")!;
    expect(calf).toMatchObject({ chunk: 44, author: "carol", cc0: true, rank: 5 });
    expect(modelPath(calf)).toBe("glbs/000-044/ffff.glb");
  });

  test("normalises words like the index builder", () => {
    expect(words("Giant Durians, the TEH tarik!")).toEqual(["durian", "teh", "tarik"]);
  });

  test("the head noun must match", () => {
    expect(names("monitor lizard")).toEqual(["Red Lizard"]);
    expect(names("durian")).toEqual(["Durian", "Box of Durian"]);
    expect(names("teh tarik")).toEqual([]);
  });

  test("prefers the thing itself over depictions of it", () => {
    expect(names("blue whale")[0]).toBe("Blue Whale Calf");
    expect(names("whale")).toEqual(["Blue Whale Calf", "Whale skeleton"]);
  });

  test("close spellings match", () => {
    expect(names("rubber duck")).toEqual(["Rubber Duckie"]);
  });

  test("found models attach with their credits", () => {
    const actors = [
      { kind: "giant_object", label: "Durian", search_terms: "durian" },
      { kind: "whale", label: "Whale" },
    ] as Actor[];
    const out = applyModels(actors, [
      {
        url: "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-003/bbbb.glb",
        attribution: "“Durian” by bob, CC BY 4.0, via Sketchfab",
        attributionUrl: "https://sketchfab.com/3d-models/bbbb",
        bytes: 1000,
      },
      null,
    ]);
    expect(out[0].model_url).toContain("/objaverse/resolve/main/glbs/000-003/bbbb.glb");
    expect(out[0].attribution_url).toBe("https://sketchfab.com/3d-models/bbbb");
    expect(out[1]).toBe(actors[1]);
  });

  test("share links can't point models or credits anywhere else", () => {
    const parsed = eventResultSchema.parse({
      scale: "minor",
      headline: "x",
      subhead: "",
      quotes: [],
      stat_changes: { population: 0, happiness: 0, money: 0, pollution: 0, rift: 0 },
      tile_ops: [],
      ongoing: null,
      followups: [],
      spectacle: {
        crowd: "gather",
        responders: [],
        actors: [
          {
            kind: "giant_object",
            label: "Durian",
            color: "#556b2f",
            size: 3,
            count: 1,
            shape: "spiky",
            model_url: "https://evil.example/durian.glb",
            attribution: "x",
            attribution_url: "https://evil.example/",
          },
        ],
      },
    });
    expect(parsed.spectacle.actors[0].model_url).toBeUndefined();
    expect(parsed.spectacle.actors[0].attribution_url).toBeUndefined();
  });
});
