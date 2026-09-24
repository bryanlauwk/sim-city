/**
 * The shared library of generated actors.
 *
 * When Claude casts something the built-in library doesn't have (say, a
 * giant glass of teh tarik), it names a model_key and a model_prompt. We
 * look the key up in Supabase; if nobody has generated it yet — and today's
 * caps allow — we ask Meshy for a low-poly model, and the event plays with a
 * built-in stand-in. Clients poll until the model is ready; the finished GLB
 * is re-hosted in Supabase Storage so everyone after gets it instantly.
 *
 * Needs MESHY_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Without
 * them, custom actors quietly fall back to their stand-ins.
 */
import type { Actor } from "./types";

// MESHY_API_BASE exists for local testing against a stand-in server.
const meshyEndpoint = () =>
  `${(process.env.MESHY_API_BASE || "https://api.meshy.ai").replace(/\/+$/, "")}/openapi/v2/text-to-3d`;
const TABLE = "actor_library";
const BUCKET = "actors";

type Status = "pending" | "ready" | "failed";

interface Row {
  key: string;
  name: string;
  prompt: string;
  color: string;
  status: Status;
  meshy_task_id: string | null;
  model_url: string | null;
  requested_by: string | null;
  uses: number;
  created_at: string;
}

export interface CustomActorState {
  key: string;
  status: Status | "unavailable";
  url?: string;
}

function config() {
  const meshy = process.env.MESHY_API_KEY;
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!meshy || !url || !service) return null;
  return {
    meshy,
    url,
    service,
    dailyCap: Number(process.env.MESHY_DAILY_CAP) || 20,
    visitorCap: Number(process.env.MESHY_PER_VISITOR_CAP) || 2,
  };
}
type Config = NonNullable<ReturnType<typeof config>>;

export const customActorsEnabled = () => config() !== null;

// ---------------------------------------------------------------------------
// Supabase (PostgREST + Storage over plain fetch)
// ---------------------------------------------------------------------------

function sbHeaders(c: Config, extra: Record<string, string> = {}) {
  return { apikey: c.service, Authorization: `Bearer ${c.service}`, ...extra };
}

async function getRow(c: Config, key: string): Promise<Row | null> {
  const res = await fetch(`${c.url}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}&select=*`, {
    headers: sbHeaders(c),
  });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
  const rows = (await res.json()) as Row[];
  return rows[0] ?? null;
}

async function patchRow(c: Config, key: string, patch: Partial<Row>) {
  const res = await fetch(`${c.url}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: sbHeaders(c, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase update failed: ${res.status}`);
}

async function insertRow(c: Config, row: Partial<Row>) {
  const res = await fetch(`${c.url}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: sbHeaders(c, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(row),
  });
  // 409: someone else just claimed this key — fine, they're generating it.
  if (!res.ok && res.status !== 409) throw new Error(`Supabase insert failed: ${res.status}`);
}

async function countSince(c: Config, since: string, requestedBy?: string): Promise<number> {
  const filter = requestedBy ? `&requested_by=eq.${encodeURIComponent(requestedBy)}` : "";
  const res = await fetch(
    `${c.url}/rest/v1/${TABLE}?select=key&created_at=gte.${encodeURIComponent(since)}${filter}`,
    { method: "HEAD", headers: sbHeaders(c, { Prefer: "count=exact", Range: "0-0" }) },
  );
  const range = res.headers.get("content-range") ?? "";
  return Number(range.split("/")[1]) || 0;
}

async function uploadModel(c: Config, key: string, glb: ArrayBuffer): Promise<string> {
  const path = `${key}.glb`;
  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: sbHeaders(c, { "Content-Type": "model/gltf-binary", "x-upsert": "true" }),
    body: glb,
  });
  if (!res.ok) throw new Error(`Supabase upload failed: ${res.status}`);
  return `${c.url}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ---------------------------------------------------------------------------
// Meshy
// ---------------------------------------------------------------------------

async function startMeshy(c: Config, prompt: string): Promise<string> {
  const res = await fetch(meshyEndpoint(), {
    method: "POST",
    headers: { Authorization: `Bearer ${c.meshy}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "preview",
      // Untextured preview meshes suit the city's flat-shaded look; we colour them ourselves.
      prompt:
        `${prompt}. Single object, stylised, simple low-poly shapes, no base, no background.`.slice(
          0,
          800,
        ),
      topology: "triangle",
      should_remesh: true,
      target_polycount: 6000,
    }),
  });
  if (!res.ok) throw new Error(`Meshy create failed: ${res.status} ${await res.text()}`);
  const { result } = (await res.json()) as { result: string };
  return result;
}

interface MeshyTask {
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress?: number;
  model_urls?: { glb?: string };
}

async function checkMeshy(c: Config, id: string): Promise<MeshyTask> {
  const res = await fetch(`${meshyEndpoint()}/${id}`, {
    headers: { Authorization: `Bearer ${c.meshy}` },
  });
  if (!res.ok) throw new Error(`Meshy status failed: ${res.status}`);
  return (await res.json()) as MeshyTask;
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

const startOfDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Resolves the custom models in a freshly generated event: attaches URLs of
 * ready models, starts generation for new ones within the caps, and strips
 * the key when a model can't be had (so the stand-in simply plays).
 */
export async function resolveCustomActors(actors: Actor[], ip: string): Promise<Actor[]> {
  const c = config();
  const out: Actor[] = [];
  for (const actor of actors) {
    if (!actor.model_key) {
      out.push(actor);
      continue;
    }
    const plain: Actor = { ...actor, model_key: undefined, model_prompt: undefined };
    if (!c) {
      out.push(plain);
      continue;
    }
    try {
      const key = actor.model_key;
      const row = await getRow(c, key);
      if (row?.status === "ready" && row.model_url) {
        await patchRow(c, key, { uses: row.uses + 1 });
        out.push({ ...actor, model_url: row.model_url });
      } else if (row?.status === "pending") {
        out.push(actor);
      } else if (row?.status === "failed" || !actor.model_prompt) {
        out.push(plain);
      } else {
        const visitor = await hashVisitor(ip);
        const since = startOfDay();
        const [today, mine] = await Promise.all([
          countSince(c, since),
          countSince(c, since, visitor),
        ]);
        if (today >= c.dailyCap || mine >= c.visitorCap) {
          out.push(plain);
          continue;
        }
        const taskId = await startMeshy(c, actor.model_prompt);
        await insertRow(c, {
          key,
          name: actor.label || key,
          prompt: actor.model_prompt,
          color: actor.color,
          status: "pending",
          meshy_task_id: taskId,
          requested_by: visitor,
        });
        out.push(actor);
      }
    } catch (error) {
      console.error("Custom actor lookup failed", error);
      out.push(plain);
    }
  }
  return out;
}

/** Checks on a model being generated; finishes and re-hosts it when Meshy is done. */
export async function pollCustomActor(key: string): Promise<CustomActorState> {
  const c = config();
  if (!c) return { key, status: "unavailable" };
  const row = await getRow(c, key);
  if (!row) return { key, status: "unavailable" };
  if (row.status === "ready" && row.model_url) return { key, status: "ready", url: row.model_url };
  if (row.status === "failed" || !row.meshy_task_id) return { key, status: "failed" };

  const task = await checkMeshy(c, row.meshy_task_id);
  if (task.status === "FAILED" || task.status === "CANCELED") {
    await patchRow(c, key, { status: "failed" });
    return { key, status: "failed" };
  }
  if (task.status !== "SUCCEEDED" || !task.model_urls?.glb) return { key, status: "pending" };

  // Meshy's download links expire, so keep our own copy.
  const glb = await fetch(task.model_urls.glb);
  if (!glb.ok) throw new Error(`Model download failed: ${glb.status}`);
  const url = await uploadModel(c, key, await glb.arrayBuffer());
  await patchRow(c, key, { status: "ready", model_url: url });
  return { key, status: "ready", url };
}
