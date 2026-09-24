/**
 * The shared library of custom actors — no paid 3D service needed.
 *
 * When Claude casts something the built-in library can't show, it names a
 * model_key and provides two ways to show it:
 *   1. search_terms, for real-world things that likely exist as free low-poly
 *      models on Poly Pizza (a durian, a double-decker bus, a cat);
 *   2. a recipe — its own design from simple primitives — for everything
 *      else (a giant teh tarik, a Proton Saga, a roti canai).
 * The server resolves in that order, stores the winner in a shared Supabase
 * library, and everyone after gets it instantly.
 *
 * Optional secrets: POLYPIZZA_API_KEY (free), SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. With none of them, recipes still work per event.
 */
import { recipe as recipeSchema } from "./schema";
import type { Actor, Recipe } from "./types";

const TABLE = "actor_library";
const BUCKET = "actors";
// POLYPIZZA_API_BASE exists for local testing against a stand-in server.
const polyBase = () =>
  (process.env.POLYPIZZA_API_BASE || "https://api.poly.pizza/v1.1").replace(/\/+$/, "");

type Source = "recipe" | "polypizza";

interface Row {
  key: string;
  name: string;
  source: Source;
  recipe: Recipe | null;
  model_url: string | null;
  attribution: string | null;
  license: string | null;
  requested_by: string | null;
  uses: number;
  created_at: string;
}

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && service ? { url, service } : null;
}
type Sb = NonNullable<ReturnType<typeof supabase>>;

const perVisitorCap = () => Number(process.env.LIBRARY_PER_VISITOR_CAP) || 10;

// ---------------------------------------------------------------------------
// Supabase (PostgREST + Storage over plain fetch)
// ---------------------------------------------------------------------------

function sbHeaders(c: Sb, extra: Record<string, string> = {}) {
  return { apikey: c.service, Authorization: `Bearer ${c.service}`, ...extra };
}

async function getRow(c: Sb, key: string): Promise<Row | null> {
  const res = await fetch(`${c.url}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}&select=*`, {
    headers: sbHeaders(c),
  });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
  const rows = (await res.json()) as Row[];
  return rows[0] ?? null;
}

async function bumpUses(c: Sb, row: Row) {
  await fetch(`${c.url}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(row.key)}`, {
    method: "PATCH",
    headers: sbHeaders(c, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ uses: row.uses + 1 }),
  });
}

let indexCache: { at: number; entries: { key: string; name: string }[] } | null = null;

async function insertRow(c: Sb, row: Partial<Row>) {
  const res = await fetch(`${c.url}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: sbHeaders(c, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(row),
  });
  // 409: someone saved this key a moment ago — theirs wins, which is fine.
  if (!res.ok && res.status !== 409) throw new Error(`Supabase insert failed: ${res.status}`);
  indexCache = null;
}

async function countToday(c: Sb, requestedBy: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const res = await fetch(
    `${c.url}/rest/v1/${TABLE}?select=key&created_at=gte.${encodeURIComponent(since.toISOString())}&requested_by=eq.${encodeURIComponent(requestedBy)}`,
    { method: "HEAD", headers: sbHeaders(c, { Prefer: "count=exact", Range: "0-0" }) },
  );
  return Number((res.headers.get("content-range") ?? "").split("/")[1]) || 0;
}

async function uploadModel(c: Sb, key: string, glb: ArrayBuffer): Promise<string> {
  const path = `${key}.glb`;
  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: sbHeaders(c, { "Content-Type": "model/gltf-binary", "x-upsert": "true" }),
    body: glb,
  });
  if (!res.ok) throw new Error(`Supabase upload failed: ${res.status}`);
  return `${c.url}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Existing keys, so Claude can reuse them instead of inventing duplicates. */
export async function libraryIndex(): Promise<{ key: string; name: string }[]> {
  const c = supabase();
  if (!c) return [];
  if (indexCache && Date.now() - indexCache.at < 60_000) return indexCache.entries;
  try {
    const res = await fetch(`${c.url}/rest/v1/${TABLE}?select=key,name&order=uses.desc&limit=80`, {
      headers: sbHeaders(c),
    });
    const entries = res.ok ? ((await res.json()) as { key: string; name: string }[]) : [];
    indexCache = { at: Date.now(), entries };
    return entries;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Poly Pizza: free CC0 / CC-BY low-poly models
// ---------------------------------------------------------------------------

interface PolyModel {
  title: string;
  download: string;
  license: string;
  attribution: string;
  triCount: number;
  creator: string;
}

/** Poly Pizza fields have appeared in both camelCase and PascalCase; accept either. */
function readPoly(raw: Record<string, unknown>): PolyModel | null {
  const get = (...names: string[]) => {
    for (const n of names) if (raw[n] !== undefined && raw[n] !== null) return raw[n];
    return undefined;
  };
  const download = String(get("download", "Download") ?? "");
  // Plain http is only allowed against a local stand-in server.
  const scheme = process.env.POLYPIZZA_API_BASE ? /^https?:\/\// : /^https:\/\//;
  if (!scheme.test(download)) return null;
  const creator = get("creator", "Creator") as Record<string, unknown> | string | undefined;
  return {
    title: String(get("title", "Title") ?? ""),
    download,
    license: String(get("license", "Licence", "License") ?? ""),
    attribution: String(get("attribution", "Attribution") ?? ""),
    triCount: Number(get("triCount", "Tri Count", "TriCount")) || 0,
    creator:
      typeof creator === "string"
        ? creator
        : String(creator?.name ?? creator?.Username ?? creator?.username ?? ""),
  };
}

/** Only licences that allow use in a public game: CC0, or CC-BY with credit. */
const USABLE_LICENCE = /^(cc0|cc-?by|cc-by 3\.0|cc-by 4\.0|public domain|creative commons zero)$/i;

async function searchPolyPizza(terms: string): Promise<PolyModel | null> {
  const key = process.env.POLYPIZZA_API_KEY;
  if (!key || !terms.trim()) return null;
  const res = await fetch(`${polyBase()}/search/${encodeURIComponent(terms.trim())}?limit=12`, {
    headers: { "x-auth-token": key },
  });
  if (!res.ok) {
    console.warn("Poly Pizza search failed", res.status);
    return null;
  }
  const body = (await res.json()) as { results?: unknown[] };
  const models = (body.results ?? [])
    .map((r) => readPoly(r as Record<string, unknown>))
    .filter((m): m is PolyModel => !!m)
    .filter((m) => USABLE_LICENCE.test(m.license.trim()))
    .filter((m) => !m.triCount || m.triCount <= 30_000);
  return models[0] ?? null;
}

function creditLine(m: PolyModel): string | undefined {
  if (/cc0|zero|public domain/i.test(m.license)) return undefined;
  return (
    m.attribution || `${m.title || "3D model"} by ${m.creator || "unknown"} (CC-BY) via Poly Pizza`
  ).slice(0, 200);
}

// ---------------------------------------------------------------------------

async function hashVisitor(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`type-a-disaster:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromRow(actor: Actor, row: Row): Actor | null {
  if (row.source === "polypizza" && row.model_url)
    return {
      ...actor,
      model_url: row.model_url,
      attribution: row.attribution ?? undefined,
      recipe: undefined,
    };
  const parsed = recipeSchema.safeParse(row.recipe);
  return parsed.success && parsed.data.parts.length
    ? { ...actor, recipe: parsed.data, model_url: undefined }
    : null;
}

/**
 * Gives every custom actor something to show: a saved library entry, a
 * Poly Pizza model, or Claude's recipe — and saves new ones for everyone.
 */
export async function resolveCustomActors(actors: Actor[], ip: string): Promise<Actor[]> {
  const sb = supabase();
  const out: Actor[] = [];
  for (const actor of actors) {
    const key = actor.model_key;
    if (!key) {
      out.push(actor);
      continue;
    }
    const plain: Actor = { ...actor, search_terms: undefined };
    try {
      // 1. Already in the shared library?
      const row = sb ? await getRow(sb, key) : null;
      const saved = row && fromRow(plain, row);
      if (row && saved) {
        if (sb) await bumpUses(sb, row);
        out.push(saved);
        continue;
      }

      // 2. A free ready-made model, re-hosted so it can't vanish or hit CORS.
      const visitor = await hashVisitor(ip);
      const canSave = sb ? (await countToday(sb, visitor)) < perVisitorCap() : false;
      const poly = actor.search_terms ? await searchPolyPizza(actor.search_terms) : null;
      if (poly) {
        let url = poly.download;
        if (sb && canSave) {
          const glb = await fetch(poly.download);
          if (glb.ok) url = await uploadModel(sb, key, await glb.arrayBuffer());
        }
        const attribution = creditLine(poly);
        if (sb && canSave)
          await insertRow(sb, {
            key,
            name: actor.label || key,
            source: "polypizza",
            model_url: url,
            attribution: attribution ?? null,
            license: poly.license,
            requested_by: visitor,
          });
        out.push({ ...plain, model_url: url, attribution, recipe: undefined, fresh: true });
        continue;
      }

      // 3. Claude's own design.
      if (actor.recipe?.parts.length) {
        if (sb && canSave)
          await insertRow(sb, {
            key,
            name: actor.label || key,
            source: "recipe",
            recipe: actor.recipe,
            requested_by: visitor,
          });
        out.push({ ...plain, fresh: true });
        continue;
      }

      out.push({ ...plain, model_key: undefined });
    } catch (error) {
      console.error("Custom actor lookup failed", error);
      out.push(actor.recipe?.parts.length ? plain : { ...plain, model_key: undefined });
    }
  }
  return out;
}
