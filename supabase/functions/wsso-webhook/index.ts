// WSSO → OmniForce events (HMAC-signed, same scheme as provisioning). PROPOSED
// contract: nothing on the WSSO side sends these yet. Deploy with --no-verify-jwt.
// Events: member.created, member.updated, member.role_changed, member.deleted, seats.changed, company.deleted
// Webhooks only update links that already exist; they never create or re-point one.
import { json } from "../_shared/cors.ts";
import { HttpError, requireSecret } from "../_shared/errors.ts";
import { admin, rpc } from "../_shared/db.ts";
import { verifySignedRequest } from "../_shared/wsso.ts";

Deno.serve(async (req) => {
  let secret: string;
  try { secret = requireSecret("WSSO_SHARED_SECRET"); } catch (e) { return new Response((e as HttpError).message, { status: 503 }); }
  const raw = await req.text();
  if (raw.length > 65_536) return new Response("too large", { status: 413 });
  const ts = req.headers.get("x-omniforce-timestamp") ?? "";
  const sig = req.headers.get("x-omniforce-signature") ?? "";
  if (!(await verifySignedRequest(raw, ts, sig, secret))) return new Response("bad signature", { status: 401 });
  if (await rpc<boolean>("webhook_seen", { p_source: "wsso", p_signature: sig })) return json({ ok: true, duplicate: true });

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const ofId = typeof body.omniforce_user_id === "string" ? body.omniforce_user_id : null;
  const { data: p } = ofId ? await admin.from("profiles").select("id").eq("omniforce_id", ofId).maybeSingle() : { data: null };

  const { error } = await admin.from("integration_events").insert({
    direction: "inbound", module_key: "wsso", event_type: `webhook:${String(body.event ?? "unknown").slice(0, 60)}`, user_id: p?.id ?? null,
    payload: body, status: "processed", attempts: 1, processed_at: new Date().toISOString(),
    idempotency_key: typeof body.event_id === "string" ? `wsso:${body.event_id}` : null,
  });
  if (error?.code === "23505") return json({ ok: true, duplicate: true });

  if (p?.id) {
    const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
    if (body.event === "member.deleted") patch.status = "disabled";
    await admin.from("identity_links").update(patch).eq("user_id", p.id).eq("module_key", "wsso").eq("status", "linked");
  }
  return json({ ok: true });
});
