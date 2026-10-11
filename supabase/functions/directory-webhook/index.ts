// DirectoryUp → OmniForce webhooks (member created/updated/deleted, plan changed,
// listing/profile updated, verification status changed, additional details submitted).
// UNVERIFIED: BD's webhook payloads have not been confirmed.
// BD should call: POST https://<hub>.supabase.co/functions/v1/directory-webhook with header
// X-Webhook-Token: <DIRECTORYUP_WEBHOOK_TOKEN> (a ?token= query is accepted if BD can't set headers).
// Deploy with --no-verify-jwt. Webhooks only update links that already exist; they never create one.
import { json } from "../_shared/cors.ts";
import { HttpError, requireSecret, safeEqual } from "../_shared/errors.ts";
import { admin } from "../_shared/db.ts";

Deno.serve(async (req) => {
  let secret: string;
  try { secret = requireSecret("DIRECTORYUP_WEBHOOK_TOKEN"); } catch (e) { return new Response((e as HttpError).message, { status: 503 }); }
  const url = new URL(req.url);
  const token = req.headers.get("x-webhook-token") ?? url.searchParams.get("token") ?? "";
  if (!safeEqual(token, secret)) return new Response("forbidden", { status: 403 });

  // BD may send JSON or form data
  const ct = req.headers.get("content-type") ?? "";
  const raw = await req.text();
  if (raw.length > 65_536) return new Response("too large", { status: 413 });
  let body: Record<string, unknown>;
  try { body = ct.includes("json") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)); } catch { return new Response("bad body", { status: 400 }); }
  const event = String(body.event ?? body.action ?? body.type ?? "unknown").slice(0, 60);
  const memberId = String(body.user_id ?? body.member_id ?? "");

  // match only through an existing link (the member id is BD's; the OmniForce ID field is informational)
  let userId: string | null = null;
  if (memberId) {
    const { data } = await admin.from("identity_links").select("user_id").eq("module_key", "directory").eq("external_id", memberId).maybeSingle();
    userId = data?.user_id ?? null;
  }

  const idem = body.event_id ? `bd:${String(body.event_id).slice(0, 100)}` : null;
  const { error } = await admin.from("integration_events").insert({
    direction: "inbound", module_key: "directory", event_type: `webhook:${event}`, user_id: userId,
    payload: body, status: "processed", attempts: 1, processed_at: new Date().toISOString(), idempotency_key: idem,
  });
  if (error?.code === "23505") return json({ ok: true, duplicate: true });

  if (userId) {
    const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
    if (/delete|deactivat|cancel/i.test(event)) patch.status = "disabled";
    await admin.from("identity_links").update(patch).eq("user_id", userId).eq("module_key", "directory").eq("external_id", memberId);
  }
  return json({ ok: true, matched: !!userId });
});
