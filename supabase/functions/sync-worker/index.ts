// Processes queued outbound events (provision / update / disable) with retries.
// Called every minute by pg_cron (see supabase/setup/schedule-sync-worker.sql). Requires header x-cron-secret.
import { json } from "../_shared/cors.ts";
import { HttpError, requireSecret, safeEqual } from "../_shared/errors.ts";
import { admin } from "../_shared/db.ts";
import { provision, syncWsso } from "../_shared/provision.ts";

const MAX_ATTEMPTS = 8;
const BATCH = 25;
const backoff = (n: number) => Math.min(60 * 60, 30 * 2 ** n); // 30s, 60s, 2m … capped at 1h

Deno.serve(async (req) => {
  let secret: string;
  try { secret = requireSecret("CRON_SECRET"); } catch (e) { return new Response((e as HttpError).message, { status: 503 }); }
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return new Response("forbidden", { status: 403 });

  const { data: events } = await admin.from("integration_events")
    .select("*").eq("direction", "outbound").in("status", ["queued", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("id").limit(BATCH);
  const { data: mods } = await admin.from("modules").select("key, provisioning_status, is_active");
  const enabled = new Set((mods ?? []).filter((m) => m.provisioning_status === "enabled" && m.is_active).map((m) => m.key));

  const results: { id: number; ok: boolean }[] = [];
  // collapse duplicates: only the newest event per target+module actually calls out
  // (handlers read the current state, so the newest event carries every earlier change)
  const owner = (e: { user_id: string | null; organization_id: string | null; module_key: string }) => `${e.user_id ?? "-"}:${e.organization_id ?? "-"}:${e.module_key}`;
  const latest = new Map<string, number>();
  for (const e of events ?? []) latest.set(owner(e), e.id);

  for (const e of events ?? []) {
    const done = (patch: Record<string, unknown>) => admin.from("integration_events").update({ processed_at: new Date().toISOString(), ...patch }).eq("id", e.id);
    if (latest.get(owner(e)) !== e.id) {
      await done({ status: "sent", response: { superseded_by: latest.get(owner(e)) } });
      continue;
    }
    if (!enabled.has(e.module_key)) {
      await done({ status: "dead", last_error: `provisioning for ${e.module_key} is disabled` });
      continue;
    }
    if (e.module_key !== "wsso" && (!e.user_id || e.organization_id)) {
      await done({ status: "dead", last_error: `no handler for ${e.event_type} yet (organization provisioning for ${e.module_key} is not defined)` });
      continue;
    }
    // claim it
    const { data: claimed } = await admin.from("integration_events")
      .update({ attempts: e.attempts + 1, next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() })
      .eq("id", e.id).eq("attempts", e.attempts).select("id").maybeSingle();
    if (!claimed) continue;

    try {
      const r = e.module_key === "wsso" ? await syncWsso(e) : await provision(e.user_id, e.module_key, e.event_type, `evt-${e.id}`);
      await done({ status: "sent", last_error: null, response: r ?? {} });
      results.push({ id: e.id, ok: true });
    } catch (err) {
      const attempts = e.attempts + 1;
      await admin.from("integration_events").update({
        status: attempts >= MAX_ATTEMPTS ? "dead" : "failed",
        last_error: String((err as Error).message).slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoff(attempts) * 1000).toISOString(),
      }).eq("id", e.id);
      results.push({ id: e.id, ok: false });
    }
  }
  return json({ processed: results.length, results });
});
