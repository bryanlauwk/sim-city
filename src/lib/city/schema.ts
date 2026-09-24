import { z } from "zod";
import { BUILD_KINDS, TILE_OPS, TILE_TARGETS, type EventResult } from "./types";

const LANDMARK_SHAPES = [
  "tower",
  "dome",
  "pyramid",
  "statue",
  "crater",
  "blob",
  "spire",
  "arch",
] as const;

const clampNum = (lo: number, hi: number) =>
  z.number().transform((v) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0));
const text = (max: number) => z.string().transform((v) => v.trim().slice(0, max));

const statDeltas = z.object({
  population: clampNum(-50000, 50000),
  happiness: clampNum(-60, 60),
  money: clampNum(-100000, 100000),
  pollution: clampNum(-60, 60),
  chaos: clampNum(-60, 60),
});

const landmark = z.object({
  name: text(40),
  shape: z.enum(LANDMARK_SHAPES).catch("statue"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .catch("#c9a227"),
  height: clampNum(0.3, 4),
});

/**
 * Validates (and clamps) an event result, whether it came from Claude or
 * from a share link someone pasted.
 */
export const eventResultSchema = z.object({
  scale: z.enum(["minor", "citywide", "apocalyptic"]).catch("minor"),
  headline: text(140),
  subhead: text(240),
  quotes: z
    .array(z.object({ name: text(40), role: text(60), text: text(240) }))
    .transform((q) => q.slice(0, 3)),
  stat_changes: statDeltas,
  tile_ops: z
    .array(
      z.object({
        op: z.enum(TILE_OPS),
        target: z.enum(TILE_TARGETS).catch("random"),
        count: clampNum(1, 24),
        build_kind: z.enum(BUILD_KINDS).nullable().catch(null),
        landmark: landmark.nullable().catch(null),
      }),
    )
    .transform((ops) => ops.slice(0, 6)),
  ongoing: z
    .object({ label: text(60), duration_days: clampNum(1, 30), per_day: statDeltas })
    .nullable()
    .catch(null),
}) satisfies z.ZodType<EventResult, z.ZodTypeDef, unknown>;

const statsJson = {
  type: "object",
  properties: {
    population: { type: "integer" },
    happiness: { type: "integer" },
    money: { type: "integer" },
    pollution: { type: "integer" },
    chaos: { type: "integer" },
  },
  required: ["population", "happiness", "money", "pollution", "chaos"],
  additionalProperties: false,
} as const;

/** JSON Schema handed to Claude's structured outputs. */
export const eventResultJsonSchema = {
  type: "object",
  properties: {
    scale: { type: "string", enum: ["minor", "citywide", "apocalyptic"] },
    headline: { type: "string" },
    subhead: { type: "string" },
    quotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          text: { type: "string" },
        },
        required: ["name", "role", "text"],
        additionalProperties: false,
      },
    },
    stat_changes: statsJson,
    tile_ops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: [...TILE_OPS] },
          target: { type: "string", enum: [...TILE_TARGETS] },
          count: { type: "integer" },
          build_kind: { anyOf: [{ type: "string", enum: [...BUILD_KINDS] }, { type: "null" }] },
          landmark: {
            anyOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  shape: { type: "string", enum: [...LANDMARK_SHAPES] },
                  color: { type: "string" },
                  height: { type: "number" },
                },
                required: ["name", "shape", "color", "height"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
        },
        required: ["op", "target", "count", "build_kind", "landmark"],
        additionalProperties: false,
      },
    },
    ongoing: {
      anyOf: [
        {
          type: "object",
          properties: {
            label: { type: "string" },
            duration_days: { type: "integer" },
            per_day: statsJson,
          },
          required: ["label", "duration_days", "per_day"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
  },
  required: ["scale", "headline", "subhead", "quotes", "stat_changes", "tile_ops", "ongoing"],
  additionalProperties: false,
} as const;

/** Compact city snapshot sent to the server with each event. */
export const citySummarySchema = z.object({
  name: z.string().max(60),
  day: z.number().int().min(0).max(100000),
  stats: z.object({
    population: z.number(),
    happiness: z.number(),
    money: z.number(),
    pollution: z.number(),
    chaos: z.number(),
  }),
  tiles: z.record(z.string(), z.number()),
  recentHeadlines: z.array(z.string().max(160)).max(5),
});
export type CitySummary = z.infer<typeof citySummarySchema>;

export const simulateInputSchema = z.object({
  event: z.string().trim().min(3).max(200),
  city: citySummarySchema,
});
export type SimulateInput = z.infer<typeof simulateInputSchema>;
