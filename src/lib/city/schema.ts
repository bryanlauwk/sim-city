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

// ---------------------------------------------------------------------------
// What Claude fills in. Kept deliberately flat and enum-light: structured
// outputs compile the schema into a grammar with a size limit, so most choices
// are plain strings (the prompt lists the allowed values) and fromClaude()
// maps anything unexpected to a safe default.
// ---------------------------------------------------------------------------

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

const opJson = {
  type: "object",
  properties: {
    op: { type: "string", enum: [...TILE_OPS] },
    target: { type: "string" },
    count: { type: "integer" },
    build: { type: "string" },
    landmark_name: { type: "string" },
    landmark_shape: { type: "string" },
    landmark_color: { type: "string" },
    landmark_height: { type: "number" },
  },
  required: [
    "op",
    "target",
    "count",
    "build",
    "landmark_name",
    "landmark_shape",
    "landmark_color",
    "landmark_height",
  ],
  additionalProperties: false,
} as const;

const followupOpJson = {
  type: "object",
  properties: {
    op: { type: "string", enum: [...TILE_OPS] },
    target: { type: "string" },
    count: { type: "integer" },
    build: { type: "string" },
  },
  required: ["op", "target", "count", "build"],
  additionalProperties: false,
} as const;

/** JSON Schema handed to Claude's structured outputs. */
export const claudeOutputJsonSchema = {
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
    stats: statsJson,
    tile_ops: { type: "array", items: opJson },
    ongoing_label: { type: "string" },
    ongoing_days: { type: "integer" },
    ongoing_per_day: statsJson,
    actors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string" },
          label: { type: "string" },
          color: { type: "string" },
          size: { type: "integer" },
          count: { type: "integer" },
          shape: { type: "string" },
        },
        required: ["kind", "label", "color", "size", "count", "shape"],
        additionalProperties: false,
      },
    },
    crowd: { type: "string" },
    responders: { type: "array", items: { type: "string" } },
    followups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          delay_days: { type: "integer" },
          note: { type: "string" },
          stats: statsJson,
          tile_ops: { type: "array", items: followupOpJson },
        },
        required: ["delay_days", "note", "stats", "tile_ops"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "scale",
    "headline",
    "subhead",
    "quotes",
    "stats",
    "tile_ops",
    "ongoing_label",
    "ongoing_days",
    "ongoing_per_day",
    "actors",
    "crowd",
    "responders",
    "followups",
  ],
  additionalProperties: false,
} as const;

/** A plain-text description of the same shape, for requests without structured outputs. */
export const CLAUDE_OUTPUT_EXAMPLE = `{"scale":"minor|citywide|apocalyptic","headline":"","subhead":"","quotes":[{"name":"","role":"","text":""}],"stats":{"population":0,"happiness":0,"money":0,"pollution":0,"chaos":0},"tile_ops":[{"op":"destroy|burn|flood|build|landmark|clear","target":"","count":1,"build":"","landmark_name":"","landmark_shape":"","landmark_color":"#rrggbb","landmark_height":1}],"ongoing_label":"","ongoing_days":0,"ongoing_per_day":{"population":0,"happiness":0,"money":0,"pollution":0,"chaos":0},"actors":[{"kind":"","label":"","color":"#rrggbb","size":1,"count":1,"shape":""}],"crowd":"flee|gather|celebrate|ignore","responders":[""],"followups":[{"delay_days":1,"note":"","stats":{"population":0,"happiness":0,"money":0,"pollution":0,"chaos":0},"tile_ops":[{"op":"build","target":"","count":1,"build":""}]}]}`;

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => {
  const n = norm(v);
  return (list as readonly string[]).includes(n) ? (n as T) : null;
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const statsFrom = (v: unknown) => {
  const o = obj(v);
  const n = (k: string) => (Number.isFinite(Number(o[k])) ? Number(o[k]) : 0);
  return {
    population: n("population"),
    happiness: n("happiness"),
    money: n("money"),
    pollution: n("pollution"),
    chaos: n("chaos"),
  };
};

function opFromClaude(raw: unknown) {
  const o = obj(raw);
  const op = oneOf(TILE_OPS, o.op);
  if (!op) return null;
  const hasLandmark = op === "landmark";
  return {
    op,
    target: oneOf(TILE_TARGETS, o.target) ?? "random",
    count: Number(o.count) || 1,
    build_kind: oneOf(BUILD_KINDS, o.build),
    landmark: hasLandmark
      ? {
          name: o.landmark_name || "Monument",
          shape: oneOf(LANDMARK_SHAPES, o.landmark_shape) ?? "statue",
          color: o.landmark_color,
          height: typeof o.landmark_height === "number" ? o.landmark_height : 1.5,
        }
      : null,
  };
}

/** Converts Claude's flat output into a validated, clamped EventResult. */
export function fromClaude(raw: unknown) {
  const o = obj(raw);
  const ongoingDays = Number(o.ongoing_days) || 0;
  return eventResultSchema.safeParse({
    scale: o.scale,
    headline: o.headline ?? "",
    subhead: o.subhead ?? "",
    quotes: arr(o.quotes),
    stat_changes: statsFrom(o.stats),
    tile_ops: arr(o.tile_ops).map(opFromClaude).filter(Boolean),
    ongoing:
      ongoingDays > 0 && o.ongoing_label
        ? {
            label: o.ongoing_label,
            duration_days: ongoingDays,
            per_day: statsFrom(o.ongoing_per_day),
          }
        : null,
    spectacle: {
      actors: arr(o.actors)
        .map((a) => {
          const x = obj(a);
          const kind = oneOf(ACTOR_KINDS, x.kind);
          return kind
            ? {
                kind,
                label: x.label ?? "",
                color: x.color,
                size: Number(x.size) || 3,
                count: Number(x.count) || 1,
                shape: oneOf(ACTOR_SHAPES, x.shape) ?? "blob",
              }
            : null;
        })
        .filter(Boolean),
      crowd: oneOf(CROWD_REACTIONS, o.crowd) ?? "ignore",
      responders: arr(o.responders)
        .map((r) => oneOf(RESPONDERS, r))
        .filter(Boolean),
    },
    followups: arr(o.followups).map((f) => {
      const x = obj(f);
      return {
        delay_days: Number(x.delay_days) || 1,
        note: x.note ?? "",
        stat_changes: statsFrom(x.stats),
        tile_ops: arr(x.tile_ops).map(opFromClaude).filter(Boolean),
      };
    }),
  });
}

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
