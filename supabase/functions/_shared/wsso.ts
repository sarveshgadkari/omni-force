// Server-to-server client for WSSO's access-events endpoint (POST /api/omniforce/events).
// WSSO creates accounts and workspaces itself on first sign-in through OmniForce; after
// that OmniForce only tells it when access changes. Only used when
// modules.provisioning_status for 'wsso' is 'enabled'.
// Every request is signed: X-OmniForce-Signature = hex(HMAC-SHA256(secret, `${timestamp}.${body}`)).
import { requireSecret } from "./errors.ts";

export async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Which WSSO account(s) a member event applies to. WSSO ignores it for anyone whose workspace is elsewhere. */
export type WssoScope =
  | { scope: "account" }                                                            // the whole OmniForce account
  | { scope: "personal" }                                                           // their personal workspace
  | { scope: "organization"; omniforce_org_id: string; external_org_id?: string };  // that organization's workspace

export type WssoOrgTarget = { omniforce_org_id: string; external_org_id?: string };
export type WssoAccess = { plan_ref: string | null; seats: number | null };

export type WssoEvent =
  | ({ event: "access.updated"; access: WssoAccess } & ({ sub: string } | WssoOrgTarget))
  | ({ event: "access.revoked" } & ({ sub: string } | WssoOrgTarget))
  | ({ event: "member.enabled" | "member.disabled"; sub: string } & WssoScope);

/** Send one event. event_id makes it idempotent on the WSSO side (retries are safe). */
export async function wssoEvent(event_id: string, body: WssoEvent) {
  const url = Deno.env.get("WSSO_EVENTS_URL") ?? "";
  if (!/^https:\/\//.test(url)) throw new Error("WSSO_EVENTS_URL is not configured.");
  const secret = requireSecret("WSSO_EVENTS_SECRET");
  const raw = JSON.stringify({ event_id, ...body });
  const ts = Math.floor(Date.now() / 1000).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OmniForce-Timestamp": ts, "X-OmniForce-Signature": await hmacHex(secret, `${ts}.${raw}`) },
    body: raw,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WSSO ${res.status}: ${data?.error ?? "no body"}`);
  return { event: body.event, ...(data?.skipped ? { skipped: String(data.skipped) } : {}) };
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
