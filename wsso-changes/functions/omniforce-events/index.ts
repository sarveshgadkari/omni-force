// Sends queued WSSO → OmniForce events (omniforce_outbox) to the hub's wsso-webhook.
// Called every minute by pg_cron with x-cron-secret. Deploy with --no-verify-jwt.
import { admin, hmacHex, json, safeEqual } from "../_shared.ts";

const HUB = Deno.env.get("OMNIFORCE_WEBHOOK_URL") ?? "https://<hub-ref>.supabase.co/functions/v1/wsso-webhook";
const SECRET = Deno.env.get("OMNIFORCE_SHARED_SECRET") ?? "";

Deno.serve(async (req) => {
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", Deno.env.get("CRON_SECRET") ?? "!")) return new Response("forbidden", { status: 403 });
  const { data: rows } = await admin.from("omniforce_outbox").select("*").in("status", ["queued", "failed"])
    .lte("next_attempt_at", new Date().toISOString()).order("id").limit(50);

  let sent = 0;
  for (const r of rows ?? []) {
    const body = JSON.stringify({ event: r.event, event_id: r.id, omniforce_user_id: r.omniforce_user_id, ...r.payload });
    const ts = Math.floor(Date.now() / 1000).toString();
    try {
      const res = await fetch(HUB, { method: "POST", body, signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", "X-OmniForce-Timestamp": ts, "X-OmniForce-Signature": await hmacHex(SECRET, `${ts}.${body}`) } });
      if (!res.ok) throw new Error(`hub ${res.status}`);
      await admin.from("omniforce_outbox").update({ status: "sent", attempts: r.attempts + 1, last_error: null }).eq("id", r.id);
      sent++;
    } catch (e) {
      const n = r.attempts + 1;
      await admin.from("omniforce_outbox").update({
        status: n >= 8 ? "dead" : "failed", attempts: n, last_error: String((e as Error).message).slice(0, 300),
        next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** n) * 1000).toISOString(),
      }).eq("id", r.id);
    }
  }
  return json({ sent, total: rows?.length ?? 0 });
});
