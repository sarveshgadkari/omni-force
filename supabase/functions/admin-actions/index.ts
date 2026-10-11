// Platform admin actions (Henry, Trence). Every action is written to audit_log.
// POST { action: "set_status", user_id, status: "active" | "disabled" }
// POST { action: "grant", user_id | organization_id, module, plan_id, valid_until? }
// POST { action: "revoke", user_id | organization_id, module }
// POST { action: "set_org_status", organization_id, status: "active" | "disabled" }
// (Identity-link review, client registration and module integration switches are
// SQL functions the admin console calls directly; they check is_platform_admin().)
import { serve } from "../_shared/handler.ts";
import { json } from "../_shared/cors.ts";
import { admin, audit, HttpError, requireAdmin } from "../_shared/db.ts";

const MODULES = ["directory", "wsso", "workforce"];

async function target(b: { user_id?: string; organization_id?: string }) {
  if (!!b.user_id === !!b.organization_id) throw new HttpError(400, "Give exactly one of user_id or organization_id.");
  if (b.user_id) {
    const { data } = await admin.from("profiles").select("id, omniforce_id").eq("id", b.user_id).maybeSingle();
    if (!data) throw new HttpError(404, "User not found.");
    return { col: "user_id" as const, id: data.id as string, label: data.omniforce_id as string, type: "user" };
  }
  const { data } = await admin.from("organizations").select("id, slug").eq("id", b.organization_id).maybeSingle();
  if (!data) throw new HttpError(404, "Organization not found.");
  return { col: "organization_id" as const, id: data.id as string, label: data.slug as string, type: "organization" };
}

serve(async (req) => {
  const actor = await requireAdmin(req);
  const b = await req.json();

  if (b.action === "set_status") {
    const t = await target({ user_id: b.user_id });
    if (!["active", "disabled"].includes(b.status)) throw new HttpError(400, "Invalid status.");
    if (t.id === actor.id) throw new HttpError(400, "You can't disable your own account.");
    // profile trigger queues member.disable / member.update for every linked module (if provisioning is on)
    await admin.from("profiles").update({ status: b.status }).eq("id", t.id);
    // block or restore sign-in in Supabase Auth
    await admin.auth.admin.updateUserById(t.id, { ban_duration: b.status === "disabled" ? "876000h" : "none" });
    await audit(actor.id, `user.${b.status === "disabled" ? "disable" : "enable"}`, "user", t.label);
    return json({ ok: true });
  }

  if (b.action === "set_org_status") {
    const t = await target({ organization_id: b.organization_id });
    if (!["active", "disabled"].includes(b.status)) throw new HttpError(400, "Invalid status.");
    await admin.from("organizations").update({ status: b.status }).eq("id", t.id);
    await audit(actor.id, `org.${b.status === "disabled" ? "disable" : "enable"}`, "organization", t.id, { slug: t.label });
    return json({ ok: true });
  }

  if (b.action === "grant") {
    const t = await target(b);
    if (!MODULES.includes(b.module)) throw new HttpError(400, "Unknown module.");
    const { data: plan } = await admin.from("plans").select("id, module_key, bundle_modules, audience").eq("id", b.plan_id).single();
    if (!plan || (plan.module_key !== b.module && !plan.bundle_modules?.includes(b.module))) throw new HttpError(400, "That plan doesn't belong to this module.");
    if (plan.audience !== "any" && plan.audience !== (t.type === "user" ? "individual" : "organization")) throw new HttpError(400, `That plan is for ${plan.audience} accounts only.`);
    const validUntil = b.valid_until ? new Date(b.valid_until) : null;
    if (validUntil && (isNaN(validUntil.getTime()) || validUntil.getTime() < Date.now())) throw new HttpError(400, "valid_until must be a future date.");
    const { error } = await admin.from("entitlements").upsert(
      {
        [t.col]: t.id, module_key: b.module, plan_id: plan.id, status: "active", granted_by: actor.id,
        source: b.module === "workforce" ? "license" : "admin", valid_until: validUntil?.toISOString() ?? null, updated_at: new Date().toISOString(),
      },
      { onConflict: `${t.col},module_key` },
    );
    if (error) throw error;
    await audit(actor.id, "entitlement.grant", t.type, t.type === "user" ? t.label : t.id, { module: b.module, plan_id: plan.id, valid_until: validUntil });
    return json({ ok: true });
  }

  if (b.action === "revoke") {
    const t = await target(b);
    await admin.from("entitlements").update({ status: "canceled", updated_at: new Date().toISOString(), granted_by: actor.id })
      .eq(t.col, t.id).eq("module_key", b.module);
    await audit(actor.id, "entitlement.revoke", t.type, t.type === "user" ? t.label : t.id, { module: b.module });
    return json({ ok: true });
  }
  throw new HttpError(400, "Unknown action.");
});
