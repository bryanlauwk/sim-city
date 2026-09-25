import type { Actor, ActorKind } from "@/lib/city/types";

/**
 * Real, textured models for built-in actors, hand-picked from Objaverse (the
 * Hugging Face mirror of Sketchfab's downloadable CC BY models) and checked
 * for orientation, textures and size. They load from Hugging Face's CDN when
 * an event needs them; until then, and if one fails, the procedural actor
 * stands in.
 */
export interface RealModel {
  uid: string;
  /** Objaverse folder glbs/000-<chunk>. */
  chunk: number;
  name: string;
  author: string;
  bytes: number;
  /** Turn (radians) so the model faces +z, the way walkers travel. */
  turn?: number;
  /**
   * Which dimension sets the size: the largest (default), the horizontal
   * extent (a UFO, whose beam is tall), or the height (a T-Rex should tower).
   */
  fit?: "max" | "width" | "height";
  /** That dimension, in actor units before the actor's own size (default 1.2). */
  span?: number;
  /** Animation clip to loop, if not the first. */
  clip?: string;
}

export const REAL_MODELS: Partial<Record<ActorKind, RealModel>> = {
  whale: {
    uid: "da07e3ff73914ff28d2b8cf9da794036",
    chunk: 26,
    name: "Game-ready Humpback Whale",
    author: "Allie2k",
    bytes: 2_539_720,
    span: 1.7,
  },
  kaiju: {
    uid: "38007d947ae74dea83988cb0b08ee053",
    chunk: 104,
    name: "Animated Tyrannosaurus Rex Dinosaur Running Loop",
    author: "LasquetiSpice",
    bytes: 8_156_640,
    clip: "run",
    fit: "height",
    span: 1.9,
  },
  ufo: {
    uid: "3e10fb1b912f4b0faee6e1ea21409a4f",
    chunk: 17,
    name: "UfoV2",
    author: "Batuhan13",
    bytes: 2_863_700,
    fit: "width",
  },
  hot_air_balloon: {
    uid: "fb4d408d1d7f49019ffa0d9681493603",
    chunk: 29,
    name: "The Getaway BALLOON2",
    author: "KevinAz61",
    bytes: 5_958_268,
    fit: "height",
    span: 1.8,
  },
  meteor: {
    uid: "1cf93f26dbc34a08a31367ea8929117f",
    chunk: 38,
    name: "Asteroid with minerals",
    author: "PeterMikielewicz",
    bytes: 2_507_984,
  },
};

export const realModelUrl = (m: RealModel) =>
  `https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-${String(m.chunk).padStart(3, "0")}/${m.uid}.glb`;

/** Phones get only the lighter models; the rest stay procedural there. */
const PHONE_BYTES = 4e6;

/** Built-in actors with their real model (and its credit) attached. */
export function withRealModels(actors: Actor[], phone: boolean): Actor[] {
  return actors.map((a) => {
    const m = REAL_MODELS[a.kind];
    if (!m || a.model_url || a.model_key || (phone && m.bytes > PHONE_BYTES)) return a;
    return {
      ...a,
      model_url: realModelUrl(m),
      attribution: `“${m.name}” by ${m.author}, CC BY 4.0, via Sketchfab`,
      attribution_url: `https://sketchfab.com/3d-models/${m.uid}`,
    };
  });
}
