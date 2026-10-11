// Pure helpers for the OIDC-shaped interface (no database access).
import { HttpError } from "./errors.ts";

export const SCOPES = ["openid", "profile", "email", "organizations", "entitlements"] as const;
export const ID_TOKEN_TTL = 300;
export const ACCESS_TOKEN_TTL = 300;

export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const randomToken = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function pkceS256(verifier: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export function parseScope(s: unknown): string[] {
  if (typeof s !== "string") return [];
  return [...new Set(s.split(/\s+/).filter(Boolean))].slice(0, 20);
}

/** Append params to a registered redirect URI (keeps its own query). */
export function withParams(uri: string, params: Record<string, string | null | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.searchParams.set(k, v);
  return u.toString();
}

/** OAuth error body (RFC 6749 §5.2). */
export function oauthError(error: string, description: string, status = 400, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...headers },
  });
}

/** Read token-endpoint parameters from a form (spec) or JSON body. */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  const raw = await req.text();
  if (raw.length > 16_384) throw new HttpError(413, "Request too large.");
  if (ct.includes("application/json")) {
    const j = JSON.parse(raw || "{}");
    return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

/**
 * Client credentials from HTTP Basic (client_secret_basic, form-urlencoded
 * per RFC 6749 §2.3.1) or the body (client_secret_post). Never both.
 */
export function clientCredentials(req: Request, params: Record<string, string>) {
  const h = req.headers.get("authorization") ?? "";
  if (/^basic\s+/i.test(h)) {
    if (params.client_secret) return null;
    let decoded: string;
    try { decoded = atob(h.replace(/^basic\s+/i, "").trim()); } catch { return null; }
    const i = decoded.indexOf(":");
    if (i < 0) return null;
    try {
      return { id: decodeURIComponent(decoded.slice(0, i).replace(/\+/g, " ")), secret: decodeURIComponent(decoded.slice(i + 1).replace(/\+/g, " ")), basic: true };
    } catch { return null; }
  }
  if (params.client_id && params.client_secret) return { id: params.client_id, secret: params.client_secret, basic: false };
  return null;
}

/** Path below the function name, e.g. /functions/v1/oidc/token → /token */
export function subpath(url: string, fn: string) {
  const p = new URL(url).pathname;
  const i = p.indexOf(`/${fn}`);
  const rest = i >= 0 ? p.slice(i + fn.length + 1) : p;
  return rest === "" ? "/" : rest.replace(/\/+$/, "") || "/";
}
