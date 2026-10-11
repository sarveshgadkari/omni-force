// Server-to-server client for a WSSO provisioning endpoint — NOT BUILT on the WSSO side.
// The request shape below is a proposal (docs/WSSO_INTEGRATION.md). Only used when
// modules.provisioning_status for 'wsso' is 'enabled'.
// Every request is signed: X-OmniForce-Signature = hex(HMAC-SHA256(secret, `${timestamp}.${body}`)).
import { requireSecret } from "./errors.ts";

export async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type WssoAction =
  | { action: "upsert_member"; omniforce_user_id: string; email: string; first_name: string; last_name: string; company_name: string | null; plan_code: string | null; seats: number | null; status: "active" | "trialing" | "past_due" | "canceled"; valid_until: string | null }
  | { action: "disable_member"; omniforce_user_id: string }
  | { action: "enable_member"; omniforce_user_id: string };

export async function wssoProvision(body: WssoAction & { idempotency_key: string }) {
  const url = Deno.env.get("WSSO_PROVISION_URL") ?? "";
  if (!/^https:\/\//.test(url)) throw new Error("WSSO_PROVISION_URL is not configured.");
  const secret = requireSecret("WSSO_SHARED_SECRET");
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OmniForce-Timestamp": ts, "X-OmniForce-Signature": await hmacHex(secret, `${ts}.${raw}`) },
    body: raw,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WSSO ${res.status}: ${data?.error ?? "no body"}`);
  if (typeof data?.wsso_user_id !== "string") throw new Error("WSSO: response has no wsso_user_id");
  return data as { wsso_user_id: string; company_id: string | null };
}

/** Verify an inbound HMAC-signed request (5-minute window). */
export async function verifySignedRequest(raw: string, ts: string, sig: string, secret: string, now = Date.now()) {
  if (!/^\d{9,11}$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const expected = await hmacHex(secret, `${ts}.${raw}`);
  const a = new TextEncoder().encode(sig), b = new TextEncoder().encode(expected);
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return r === 0;
}
