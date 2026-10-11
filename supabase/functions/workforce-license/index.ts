// POST { action: "create", name } → { installation, license_key }   (customer with a Workforce entitlement)
// POST { action: "revoke", id }                                       (owner or platform admin)
import { serve } from "../_shared/handler.ts";
import { json } from "../_shared/cors.ts";
import { admin, audit, HttpError, requireUser, sha256 } from "../_shared/db.ts";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHA[b % ALPHA.length]).join("");

serve(async (req) => {
  const user = await requireUser(req);
  const body = await req.json();

  if (body.action === "create") {
    const { data: ok } = await admin.rpc("user_can_access_module", { p_user: user.id, p_module: "workforce", p_org: null });
    if (!ok) throw new HttpError(402, "Workforce 2.0 isn't in your plan.");
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) throw new HttpError(400, "Give the installation a name.");
    const key = `WF2-${rand(4)}-${rand(20)}`;
    const { data, error } = await admin.from("workforce_installations").insert({
      user_id: user.id, name, license_key_prefix: key.slice(0, 8), license_key_hash: await sha256(key),
    }).select("id, user_id, name, hostname, license_key_prefix, status, version, last_seen_at, created_at").single();
    if (error) throw error;
    await audit(user.id, "workforce.license.create", "installation", data.id);
    return json({ installation: data, license_key: key });
  }

  if (body.action === "revoke") {
    const { data: inst } = await admin.from("workforce_installations").select("id, user_id").eq("id", body.id).single();
    const { data: isAdmin } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!inst || (inst.user_id !== user.id && !isAdmin)) throw new HttpError(404, "Installation not found.");
    await admin.from("workforce_installations").update({ status: "revoked", mcp_token_hash: null }).eq("id", inst.id);
    await audit(user.id, "workforce.license.revoke", "installation", inst.id);
    return json({ ok: true });
  }
  throw new HttpError(400, "Unknown action.");
});
