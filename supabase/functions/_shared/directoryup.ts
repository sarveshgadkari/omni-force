// DirectoryUp (Brilliant Directories) REST API v2.
// Contract confirmed on the DirectoryUp side (2026-10-24):
//   POST /api/v2/user/create          form-urlencoded
//   POST /api/v2/users_meta/create    form-urlencoded (omniforce_user_id)
//   GET  /api/v2/user/get/{id}?include_user_token=1
//   GET  /api/v2/token/verify
// SSO is a one-time Directory login token, not OIDC. Only used when Directory
// provisioning / sign-in is switched on in Admin → Applications.
const TIMEOUT_MS = 15_000;
const META_KEY = "omniforce_user_id";

export type BdMember = {
  user_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  subscription_id?: string;
  token?: string;
};

/** A lookup that found nothing (as opposed to a failure). */
export class NotFound extends Error {}

function config() {
  const base = (Deno.env.get("DIRECTORYUP_API_BASE") ?? "").replace(/\/$/, "");
  const key = Deno.env.get("DIRECTORYUP_API_KEY") ?? "";
  if (!/^https:\/\//.test(base) || key.length < 10) {
    throw new Error("DirectoryUp API is not configured (DIRECTORYUP_API_BASE / DIRECTORYUP_API_KEY).");
  }
  return { base, key };
}

export function siteOrigin() {
  const explicit = (Deno.env.get("DIRECTORYUP_SITE_ORIGIN") ?? "").replace(/\/$/, "");
  if (/^https:\/\//.test(explicit)) return explicit;
  return config().base.replace(/\/api\/v2$/i, "");
}

/** Walk a BD JSON payload for the first matching field. */
export function pickDeep(data: unknown, keys: string[]): string | null {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const visit = (v: unknown, depth: number): string | null => {
    if (v == null || depth > 6) return null;
    if (Array.isArray(v)) {
      for (const item of v) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const [k, val] of Object.entries(o)) {
        if (wanted.has(k.toLowerCase()) && val != null && String(val).length > 0) return String(val);
      }
      for (const val of Object.values(o)) {
        const found = visit(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(data, 0);
}

function strongPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}Aa1!`;
}

async function call(method: "GET" | "POST" | "PUT", path: string, fields?: Record<string, string | number | null | undefined>) {
  const { base, key } = config();
  const body = fields
    ? new URLSearchParams(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && String(v).length > 0).map(([k, v]) => [k, String(v)]))
    : undefined;
  const url = method === "GET" && body ? `${base}/${path}?${body}` : `${base}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-Api-Key": key,
      Accept: "application/json",
      ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => {
    throw new Error((e as Error).name === "TimeoutError" ? `timeout after ${TIMEOUT_MS / 1000}s (DirectoryUp API)` : `DirectoryUp API unreachable: ${(e as Error).message}`);
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  const msg = typeof data?.message === "string" ? data.message : text.slice(0, 200);
  if (res.status === 404 || (data?.status === "error" && /not found|no (records|results|users?)/i.test(msg))) throw new NotFound(msg);
  if (!res.ok || data?.status === "error") throw new Error(`DirectoryUp API ${res.status}: ${msg}`);
  return data?.message ?? data;
}

async function find(p: Promise<unknown>) {
  try { return await p; } catch (e) { if (e instanceof NotFound) return null; throw e; }
}

export const directoryup = {
  verify: () => call("GET", "token/verify"),

  async create(m: { email: string; first_name: string; last_name: string; subscription_id: string }) {
    const r = await call("POST", "user/create", {
      email: m.email,
      first_name: m.first_name,
      last_name: m.last_name,
      subscription_id: m.subscription_id,
      password: strongPassword(),
    });
    const user_id = pickDeep(r, ["user_id", "id", "data_id"]);
    if (!user_id) throw new Error("DirectoryUp API: create returned no user_id");
    return { user_id, raw: r } as BdMember & { raw: unknown };
  },

  async writeOmniforceId(directoryUserId: string, omniforceId: string) {
    try {
      await call("POST", "users_meta/create", {
        database: "users_data",
        database_id: directoryUserId,
        key: META_KEY,
        value: omniforceId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already|exists|duplicate/i.test(msg)) return;
      throw e;
    }
  },

  async get(directoryUserId: string, includeToken = false) {
    const r = await call("GET", `user/get/${encodeURIComponent(directoryUserId)}`, includeToken ? { include_user_token: 1 } : undefined);
    const user_id = pickDeep(r, ["user_id", "id", "data_id"]) ?? directoryUserId;
    const token = includeToken ? pickDeep(r, ["token", "user_token", "login_token"]) : null;
    return { user_id, token, raw: r };
  },

  async loginToken(directoryUserId: string) {
    const { token } = await directoryup.get(directoryUserId, true);
    if (!token) throw new Error("DirectoryUp API: member profile had no login token. Enable Include User Token on the API key.");
    return token;
  },

  loginUrl(token: string) {
    if (!token) throw new Error("DirectoryUp API: empty login token");
    return `${siteOrigin()}/login/token/${encodeURIComponent(token)}`;
  },

  async findByOmniforceId(ofId: string) {
    const r = await find(call("GET", "users_meta/get", { database: "users_data", key: META_KEY, value: ofId, output_type: "array" }));
    if (!r) return null;
    const user_id = pickDeep(r, ["database_id", "user_id", "id"]);
    return user_id ? { user_id } : null;
  },

  async findByEmail(email: string) {
    const r = await find(call("GET", "user/get", { property: "email", property_value: email }));
    if (!r) return null;
    const user_id = pickDeep(r, ["user_id", "id", "data_id"]);
    const omniforce_user_id = pickDeep(r, [META_KEY]);
    return user_id ? { user_id, omniforce_user_id } : null;
  },

  update: (userId: string, fields: Record<string, string | number | null | undefined>) =>
    call("PUT", "user/update", { user_id: userId, ...fields }),

  deactivate: (userId: string) => call("PUT", "user/update", { user_id: userId, active: 3 }),
};
