/**
 * Free 3D models for custom actors, found in the browser with no key or
 * account.
 *
 * public/objaverse/index-v1.json.gz lists about 47,000 CC BY and CC0 models
 * from Objaverse (a public mirror of downloadable Sketchfab models on Hugging
 * Face), filtered for single objects of good quality and ordered with
 * realistic and scanned models first (see scripts/build_objaverse_index.py).
 * A search ranks them by how well their names match, then one batched Hub
 * request checks file sizes, and the GLB loads straight from Hugging Face's
 * CDN, which allows cross-origin requests.
 */

import type { Actor } from "./types";

const INDEX_URL = "/objaverse/index-v1.json.gz";
const HUB = "https://huggingface.co";
const REPO = "datasets/allenai/objaverse";

export interface IndexModel {
  uid: string;
  chunk: number;
  name: string;
  author: string;
  cc0: boolean;
  nameWords: Set<string>;
  tagWords: Set<string>;
  /** Position in the index: 0 is the best-rated model. */
  rank: number;
}

export interface FoundModel {
  url: string;
  attribution: string;
  attributionUrl: string;
  bytes: number;
}

// Must match words() in scripts/build_objaverse_index.py, plus a few size
// words that searches use ("giant durian") but names rarely do.
const STOP = new Set(
  `the and with for from this that low poly lowpoly high highpoly free game ready
  gameready asset assets blender maya max 3ds 3dsmax obj fbx cinema4d c4d substance
  painter unity unreal ue4 ue5 zbrush pbr texture textures textured photogrammetry
  scan scanned 3dscan realistic sketchfab download downloadable new old art design
  model object prop props version test final wip untitled part giant huge big small
  tiny`.split(/\s+/),
);

/** Models that depict a thing rather than being it: skulls, toys, statues… */
const DEPICTIONS = new Set(
  `skull skeleton bone brain fossil toy statue statuette figurine figure sculpture bust
  logo icon sign keychain pendant carving sticker costume mask helmet plush lamp poster
  card miniature mini chess ornament necklace earring ring tattoo drawing painting
  relief stamp coin badge emblem sword dagger weapon gun`.split(/\s+/),
);

export function words(text: string): string[] {
  const out: string[] = [];
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (w.length < 3 || w.length > 18 || STOP.has(w)) continue;
    out.push(w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  }
  return out;
}

interface RawIndex {
  v: number;
  authors: string[];
  models: string;
}

export function parseIndex(raw: RawIndex): IndexModel[] {
  return raw.models.split("\n").map((line, rank) => {
    const [uid, chunk, name, author, tags] = line.split("\t");
    const a = Number(author);
    return {
      uid,
      chunk: Number(chunk),
      name,
      author: raw.authors[a >= 0 ? a : -1 - a] || "unknown",
      cc0: a < 0,
      nameWords: new Set(words(name)),
      tagWords: new Set(words(tags ?? "")),
      rank,
    };
  });
}

/** The noun a phrase is about: "glass of tea" → glass, "monitor lizard" → lizard. */
function headWord(terms: string, qw: string[]): string | undefined {
  const parts = terms.toLowerCase().split(" of ");
  const hw = parts.length > 1 ? words(parts[0]) : qw;
  return hw[hw.length - 1];
}

function hit(w: string, m: IndexModel): number {
  if (m.nameWords.has(w)) return 1;
  if (w.length >= 4)
    for (const x of m.nameWords) if (x.startsWith(w) && x.length - w.length <= 3) return 0.8;
  return m.tagWords.has(w) ? 0.6 : 0;
}

/**
 * Best matches for the search terms. The head noun must match (so "monitor
 * lizard" never returns a computer monitor); full matches, short names and
 * better-rated models come first; skulls, toys and statues come last.
 */
export function rankModels(models: IndexModel[], terms: string, limit = 8): IndexModel[] {
  const qw = [...new Set(words(terms))];
  const head = headWord(terms, qw);
  if (!qw.length || !head) return [];
  const hi = qw.indexOf(head);
  const n = models.length || 1;
  const scored: { m: IndexModel; s: number }[] = [];
  for (const m of models) {
    const hits = qw.map((w) => hit(w, m));
    if (!hits[hi]) continue;
    const coverage = hits.reduce((a, b) => a + b, 0) / qw.length;
    const extra = Math.max(0, m.nameWords.size - qw.length);
    let depictions = 0;
    for (const x of m.nameWords) if (DEPICTIONS.has(x) && !qw.includes(x)) depictions++;
    const s = coverage * 10 - Math.min(extra, 5) * 0.4 - depictions * 2.5 + 2 * (1 - m.rank / n);
    scored.push({ m, s });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ m }) => m);
}

export const modelPath = (m: Pick<IndexModel, "uid" | "chunk">) =>
  `glbs/000-${String(m.chunk).padStart(3, "0")}/${m.uid}.glb`;

async function gunzipJson<T>(res: Response): Promise<T> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Some hosts decompress .gz files on the way; only gunzip real gzip data.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

let index: Promise<IndexModel[]> | null = null;
function loadIndex(): Promise<IndexModel[]> {
  index ??= fetch(INDEX_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`index ${res.status}`);
      return gunzipJson<RawIndex>(res);
    })
    .then(parseIndex)
    .catch((error) => {
      index = null; // try again next time
      throw error;
    });
  return index;
}

/** File sizes from one batched Hugging Face Hub request. */
async function sizes(models: IndexModel[]): Promise<Map<string, number>> {
  const res = await fetch(`${HUB}/api/${REPO}/paths-info/main`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: models.map(modelPath) }),
  });
  const out = new Map<string, number>();
  if (!res.ok) return out;
  for (const f of (await res.json()) as { path: string; size?: number }[])
    out.set(
      f.path
        .split("/")
        .pop()!
        .replace(/\.glb$/, ""),
      f.size ?? 0,
    );
  return out;
}

/** Big files take too long mid-event, and phones have less memory. */
function maxBytes(): number {
  if (typeof window === "undefined") return 8e6;
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData || window.innerWidth < 640 ? 4e6 : 8e6;
}

const found = new Map<string, Promise<FoundModel | null>>();

/** A free model for these search terms, or null if nothing suitable exists. */
export function findModel(terms: string): Promise<FoundModel | null> {
  const key = terms.trim().toLowerCase();
  const cached = found.get(key);
  if (cached) return cached;
  const result = (async () => {
    const models = rankModels(await loadIndex(), key);
    if (!models.length) return null;
    const bytes = await sizes(models);
    const limit = maxBytes();
    const pick = models.find((m) => (bytes.get(m.uid) ?? 0) > 0 && bytes.get(m.uid)! <= limit);
    if (!pick) return null;
    return {
      url: `${HUB}/${REPO}/resolve/main/${modelPath(pick)}`,
      attribution: `“${pick.name}” by ${pick.author}, ${pick.cc0 ? "CC0" : "CC BY 4.0"}, via Sketchfab`,
      attributionUrl: `https://sketchfab.com/3d-models/${pick.uid}`,
      bytes: bytes.get(pick.uid)!,
    };
  })().catch(() => {
    found.delete(key);
    return null;
  });
  found.set(key, result);
  return result;
}

/** Start downloading the index early, e.g. while the newsroom is writing. */
export function warmModelIndex() {
  void loadIndex().catch(() => undefined);
}

/** Actors with any models found for them attached, credits included. */
export function applyModels(actors: Actor[], models: (FoundModel | null)[]): Actor[] {
  return actors.map((a, i) => {
    const m = models[i];
    return m
      ? { ...a, model_url: m.url, attribution: m.attribution, attribution_url: m.attributionUrl }
      : a;
  });
}
