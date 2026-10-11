// Provision / update a user in a cloud module and record the identity link.
// Only runs for modules whose provisioning an admin has enabled (after the
// module's API contract was verified). Linking rules live in SQL
// (record_identity_link): an email match never links by itself.
import { admin, rpc } from "./db.ts";
import { directoryup } from "./directoryup.ts";
import { wssoProvision } from "./wsso.ts";

type Mod = "directory" | "wsso";
type Access = { module_key: string; via: string; status: string; plan_ref: string | null; seats: number | null; valid_until: string | null };

async function context(userId: string, module: Mod) {
  const [{ data: p }, { data: link }, { data: mod }, { data: au }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).single(),
    admin.from("identity_links").select("*").eq("user_id", userId).eq("module_key", module).maybeSingle(),
    admin.from("modules").select("provisioning_status, is_active").eq("key", module).single(),
    admin.auth.admin.getUserById(userId),
  ]);
  if (!p) throw new Error("profile not found");
  const access = await rpc<Access[]>("module_access_for", { p_user: userId });
  const own = access.find((a) => a.module_key === module && a.via === "individual") ?? null;
  return { p, link, own, enabled: mod?.provisioning_status === "enabled" && mod?.is_active, verified: !!au?.user?.email_confirmed_at };
}

const recordLink = (userId: string, module: Mod, externalId: string, method: "provisioned" | "verified_email", account: string | null = null) =>
  rpc("record_identity_link", { p_user: userId, p_module: module, p_external_id: externalId, p_method: method, p_external_account_id: account });

export async function linkError(userId: string, module: Mod, msg: string) {
  const { data } = await admin.from("identity_links").select("status").eq("user_id", userId).eq("module_key", module).maybeSingle();
  if (data?.status === "linked" || data?.status === "pending_review") {
    await admin.from("identity_links").update({ last_error: msg.slice(0, 500) }).eq("user_id", userId).eq("module_key", module);
  } else {
    await admin.from("identity_links").upsert({ user_id: userId, module_key: module, status: "error", last_error: msg.slice(0, 500) }, { onConflict: "user_id,module_key" });
  }
}

/** Idempotent: safe to call for every queued event. */
export async function provision(userId: string, module: Mod, eventType = "member.provision", idem: string = crypto.randomUUID()) {
  const { p, link: current, own, enabled, verified } = await context(userId, module);
  if (!enabled) throw new Error(`provisioning for ${module} is disabled`);
  if (!verified) return { skipped: "email_unverified" };
  if (current?.status === "pending_review") return { skipped: "link_pending_review" };
  const active = !!own && p.status === "active" && eventType !== "member.disable";

  if (module === "directory") {
    const subscription_id = own?.plan_ref ?? Deno.env.get("DIRECTORYUP_FREE_SUBSCRIPTION_ID") ?? "";
    let memberId = current?.status === "linked" ? (current.external_id as string) : undefined;

    if (!memberId) {
      const mine = await directoryup.findByOmniforceId(p.omniforce_id);
      if (mine) {
        // carries our OmniForce ID, which only OmniForce writes → ours
        memberId = String(mine.user_id);
        await recordLink(userId, "directory", memberId, "provisioned");
      } else {
        const sameEmail = await directoryup.findByEmail(p.email);
        if (sameEmail) {
          if (sameEmail.omniforce_user_id && sameEmail.omniforce_user_id !== p.omniforce_id) {
            throw new Error(`Directory member ${sameEmail.user_id} already belongs to ${sameEmail.omniforce_user_id}`);
          }
          // existing member with the same email: a candidate for an admin to confirm; nothing changes in BD yet
          await recordLink(userId, "directory", String(sameEmail.user_id), "verified_email");
          return { skipped: "link_pending_review", candidate: String(sameEmail.user_id) };
        }
        if (!active) return null;
        const m = await directoryup.create({ email: p.email, first_name: p.first_name, last_name: p.last_name, company: p.company_name, subscription_id, omniforce_user_id: p.omniforce_id });
        memberId = String(m.user_id);
        await recordLink(userId, "directory", memberId, "provisioned");
      }
    }

    if (!active) await directoryup.deactivate(memberId);
    else await directoryup.update(memberId, { email: p.email, first_name: p.first_name, last_name: p.last_name, company: p.company_name ?? undefined, subscription_id, active: 2, omniforce_user_id: p.omniforce_id });
    await admin.from("identity_links").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", userId).eq("module_key", "directory");
    return { external_id: memberId };
  }

  // WSSO (individual accounts only; organization provisioning is not defined yet)
  if (!active) {
    if (current?.status === "linked") await wssoProvision({ action: "disable_member", omniforce_user_id: p.omniforce_id, idempotency_key: idem });
    await admin.from("identity_links").update({ status: "disabled", last_synced_at: new Date().toISOString() })
      .eq("user_id", userId).eq("module_key", "wsso").eq("status", "linked");
    return null;
  }
  const r = await wssoProvision({
    action: "upsert_member", idempotency_key: idem,
    omniforce_user_id: p.omniforce_id, email: p.email, first_name: p.first_name, last_name: p.last_name, company_name: p.company_name,
    plan_code: own!.plan_ref, seats: own!.seats, status: own!.status as "active", valid_until: own!.valid_until,
  });
  await recordLink(userId, "wsso", r.wsso_user_id, "provisioned", r.company_id);
  return { external_id: r.wsso_user_id };
}
