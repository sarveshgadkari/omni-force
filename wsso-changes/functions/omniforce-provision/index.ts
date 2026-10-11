// OmniForce → WSSO server-to-server provisioning. Deploy with --no-verify-jwt.
// Headers: X-OmniForce-Timestamp, X-OmniForce-Signature = hex(HMAC-SHA256(OMNIFORCE_SHARED_SECRET, `${ts}.${body}`))
// Actions: upsert_member | disable_member | enable_member
import { admin, hmacHex, json, safeEqual, upsertMember } from "../_shared.ts";

const SECRET = Deno.env.get("OMNIFORCE_SHARED_SECRET") ?? "";

Deno.serve(async (req) => {
  const raw = await req.text();
  const ts = req.headers.get("x-omniforce-timestamp") ?? "0";
  const sig = req.headers.get("x-omniforce-signature") ?? "";
  if (!SECRET || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return json({ error: "stale or unsigned request" }, 401);
  if (!safeEqual(sig, await hmacHex(SECRET, `${ts}.${raw}`))) return json({ error: "bad signature" }, 401);

  const b = JSON.parse(raw);
  if (b.idempotency_key) {
    const { data: done } = await admin.from("omniforce_inbox").select("response").eq("idempotency_key", b.idempotency_key).maybeSingle();
    if (done) return json(done.response);
  }

  let response: Record<string, unknown>;
  try {
    if (b.action === "upsert_member") {
      response = await upsertMember(b);
    } else if (b.action === "disable_member" || b.action === "enable_member") {
      const on = b.action === "enable_member";
      const { data: u } = await admin.from("users").select("id, company_id").eq("omniforce_user_id", b.omniforce_user_id).maybeSingle();
      if (!u) return json({ error: "member not found" }, 404);
      await admin.from("users").update({ is_active: on }).eq("id", u.id);
      await admin.auth.admin.updateUserById(u.id, { ban_duration: on ? "none" : "876000h" });
      // owner lost access → mark the workspace's OmniForce billing canceled
      if (!on) await admin.from("companies").update({ omniforce_status: "canceled" }).eq("id", u.company_id).eq("omniforce_owner_id", b.omniforce_user_id);
      response = { wsso_user_id: u.id, company_id: u.company_id };
    } else {
      return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message).slice(0, 300) }, 500);
  }

  if (b.idempotency_key) await admin.from("omniforce_inbox").insert({ idempotency_key: b.idempotency_key, action: b.action, response });
  return json(response);
});
