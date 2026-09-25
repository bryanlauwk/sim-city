/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { Actor } from "@/lib/city/types";
import { REAL_MODELS, withRealModels } from "./realModels";

const actor = (kind: Actor["kind"], extra: Partial<Actor> = {}) =>
  ({ kind, label: kind, color: "#888888", size: 4, count: 1, shape: "blob", ...extra }) as Actor;

describe("real models for built-in actors", () => {
  test("built-ins get a credited Objaverse model", () => {
    const [whale] = withRealModels([actor("whale")], false);
    expect(whale.model_url).toMatch(
      /^https:\/\/huggingface\.co\/datasets\/allenai\/objaverse\/resolve\/main\/glbs\/000-026\//,
    );
    expect(whale.attribution).toContain("Allie2k");
    expect(whale.attribution_url).toBe(`https://sketchfab.com/3d-models/${REAL_MODELS.whale!.uid}`);
  });

  test("kinds without a real model, and custom actors, are left alone", () => {
    const storm = actor("storm");
    const custom = actor("giant_object", { model_key: "walkie-talkie" });
    expect(withRealModels([storm, custom], false)).toEqual([storm, custom]);
  });

  test("phones skip the heavy models but keep the light ones", () => {
    const [kaiju, whale] = withRealModels([actor("kaiju"), actor("whale")], true);
    expect(REAL_MODELS.kaiju!.bytes).toBeGreaterThan(4e6);
    expect(kaiju.model_url).toBeUndefined();
    expect(whale.model_url).toBeDefined();
  });

  test("every curated model is a real Objaverse id", () => {
    for (const m of Object.values(REAL_MODELS)) {
      expect(m!.uid).toMatch(/^[0-9a-f]{32}$/);
      expect(m!.chunk).toBeGreaterThanOrEqual(0);
      expect(m!.chunk).toBeLessThan(160);
    }
  });
});
