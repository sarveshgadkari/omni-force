// DirectoryUp (Brilliant Directories) REST API v2 client — UNVERIFIED.
// Endpoint names (user/get, user/search, user/create, user/update), the custom
// field "omniforce_user_id" and the `active` codes are assumptions that must be
// confirmed with the BD team. Only used when modules.provisioning_status for
// 'directory' is 'enabled'. Auth: dedicated X-Api-Key with only member permissions.
const TIMEOUT_MS = 15_000;

export type BdMember = { user_id: string; email: string; first_name?: string; last_name?: string; subscription_id?: string; active?: string; omniforce_user_id?: string };

/** A lookup that found nothing (as opposed to a failure). */
export class NotFound extends Error {}

function config() {
  const base = (Deno.env.get("DIRECTORYUP_API_BASE") ?? "").replace(/\/$/, "");
  const key = Deno.env.get("DIRECTORYUP_API_KEY") ?? "";
  if (!/^https:\/\//.test(base) || key.length < 10) throw new Error("DirectoryUp API is not configured (DIRECTORYUP_API_BASE / DIRECTORYUP_API_KEY).");
  return { base, key };
}

async function call(method: "GET" | "POST" | "PUT" | "DELETE", path: string, fields?: Record<string, string | number | null | undefined>) {
  const { base, key } = config();
  const body = fields
    ? new URLSearchParams(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))
    : undefined;
  const url = method === "GET" && body ? `${base}/${path}?${body}` : `${base}/${path}`;
  const res = await fetch(url, {
    method,
    headers: { "X-Api-Key": key, Accept: "application/json", ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => {
    throw new Error((e as Error).name === "TimeoutError" ? `timeout after ${TIMEOUT_MS / 1000}s (BD API)` : `BD API unreachable: ${(e as Error).message}`);
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  const msg = typeof data?.message === "string" ? data.message : text.slice(0, 200);
  if (res.status === 404 || (data?.status === "error" && /not found|no (records|results|users?)/i.test(msg))) throw new NotFound(msg);
  if (!res.ok || data?.status === "error") throw new Error(`BD API ${res.status}: ${msg}`);
  return data?.message ?? data;
}

const first = (r: unknown): BdMember | null => (Array.isArray(r) ? (r[0] ?? null) : r && typeof r === "object" && "user_id" in r ? (r as BdMember) : null);

/** null only when BD says "not found"; any other failure throws so we never create a duplicate. */
async function find(p: Promise<unknown>) {
  try { return first(await p); } catch (e) { if (e instanceof NotFound) return null; throw e; }
}

export const directoryup = {
  findByOmniforceId: (ofId: string) => find(call("POST", "user/search", { omniforce_user_id: ofId, output_type: "array" })),
  findByEmail: (email: string) => find(call("GET", "user/get", { property: "email", property_value: email })),
  async create(m: { email: string; first_name: string; last_name: string; company?: string | null; subscription_id: string; omniforce_user_id: string }) {
    const r = await call("POST", "user/create", {
      email: m.email, first_name: m.first_name, last_name: m.last_name, company: m.company ?? undefined,
      subscription_id: m.subscription_id, omniforce_user_id: m.omniforce_user_id,
      // Members never sign in with a Directory password set by us; random and never stored.
      password: crypto.randomUUID() + crypto.randomUUID(),
      active: 2, // assumed "active"; confirm with BD
    });
    const created = first(r);
    if (!created?.user_id) throw new Error("BD API: create returned no user_id");
    return created;
  },
  update: (userId: string, fields: Record<string, string | number | null | undefined>) => call("PUT", "user/update", { user_id: userId, ...fields }),
  deactivate: (userId: string) => call("PUT", "user/update", { user_id: userId, active: 3 }), // assumed "inactive"; confirm with BD
};
