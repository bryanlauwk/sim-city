import { z } from "zod";
import {
  ACTOR_KINDS,
  ACTOR_SHAPES,
  BUILD_KINDS,
  CROWD_REACTIONS,
  LANDMARK_SHAPES,
  RESPONDERS,
  TILE_OPS,
  TILE_TARGETS,
  type EventResult,
  type Spectacle,
} from "./types";

const clampNum = (lo: number, hi: number) =>
  z.number().transform((v) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0));
const text = (max: number) => z.string().transform((v) => v.trim().slice(0, max));

const statDeltas = z.object({
  population: clampNum(-2_000_000, 2_000_000),
  happiness: clampNum(-60, 60),
  money: clampNum(-50_000_000, 50_000_000),
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

const hexColor = (fallback: string) =>
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .catch(fallback);

const tileOp = z.object({
  op: z.enum(TILE_OPS),
  target: z.enum(TILE_TARGETS).catch("random"),
  count: clampNum(1, 30),
  build_kind: z.enum(BUILD_KINDS).nullable().catch(null),
  landmark: landmark.nullable().catch(null),
});

const NO_SPECTACLE: Spectacle = { actors: [], crowd: "ignore", responders: [] };

const spectacle = z
  .object({
    actors: z
      .array(
        z.object({
          kind: z.enum(ACTOR_KINDS),
          label: text(40),
          color: hexColor("#888888"),
          size: clampNum(1, 8),
          count: clampNum(1, 60),
          shape: z.enum(ACTOR_SHAPES).catch("blob"),
        }),
      )
      .transform((a) => a.slice(0, 3)),
    crowd: z.enum(CROWD_REACTIONS).catch("ignore"),
    responders: z
      .array(z.enum(RESPONDERS))
      .transform((r) => [...new Set(r)].slice(0, 3))
      .catch([]),
  })
  .catch(NO_SPECTACLE);

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
  tile_ops: z.array(tileOp).transform((ops) => ops.slice(0, 6)),
  ongoing: z
    .object({ label: text(60), duration_days: clampNum(1, 30), per_day: statDeltas })
    .nullable()
    .catch(null),
  spectacle: spectacle.default(NO_SPECTACLE),
  followups: z
    .array(
      z.object({
        delay_days: clampNum(1, 10),
        note: text(160),
        stat_changes: statDeltas,
        tile_ops: z.array(tileOp).transform((ops) => ops.slice(0, 4)),
      }),
    )
    .transform((f) => f.slice(0, 3))
    .catch([])
    .default([]),
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

const tileOpJson = {
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
    tile_ops: { type: "array", items: tileOpJson },
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
    spectacle: {
      type: "object",
      properties: {
        actors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: [...ACTOR_KINDS] },
              label: { type: "string" },
              color: { type: "string" },
              size: { type: "integer" },
              count: { type: "integer" },
              shape: { type: "string", enum: [...ACTOR_SHAPES] },
            },
            required: ["kind", "label", "color", "size", "count", "shape"],
            additionalProperties: false,
          },
        },
        crowd: { type: "string", enum: [...CROWD_REACTIONS] },
        responders: { type: "array", items: { type: "string", enum: [...RESPONDERS] } },
      },
      required: ["actors", "crowd", "responders"],
      additionalProperties: false,
    },
    followups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          delay_days: { type: "integer" },
          note: { type: "string" },
          stat_changes: statsJson,
          tile_ops: { type: "array", items: tileOpJson },
        },
        required: ["delay_days", "note", "stat_changes", "tile_ops"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "scale",
    "headline",
    "subhead",
    "quotes",
    "stat_changes",
    "tile_ops",
    "ongoing",
    "spectacle",
    "followups",
  ],
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
  nature: z.number().min(0).max(100),
  districts: z.record(z.string(), z.number()),
  recentHeadlines: z.array(z.string().max(160)).max(5),
});
export type CitySummary = z.infer<typeof citySummarySchema>;

export const simulateInputSchema = z.object({
  event: z.string().trim().min(3).max(200),
  city: citySummarySchema,
});
export type SimulateInput = z.infer<typeof simulateInputSchema>;
