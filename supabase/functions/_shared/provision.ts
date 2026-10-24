// Keep cloud modules in step with access decided in OmniForce.
// Only runs for modules whose provisioning an admin has enabled (after the
// module's API contract was verified). Linking rules live in SQL
// (record_identity_link): an email match never links by itself.
//   Directory: OmniForce creates/updates the member through the BD API.
//   WSSO:      WSSO creates the account on first sign-in through OmniForce; we only
//              send the current access state (idempotent, safe to repeat).
import { admin, rpc } from "./db.ts";
import { directoryup, DuplicateError, SecurityError } from "./directoryup.ts";
import { wssoEvent, type WssoOrgTarget } from "./wsso.ts";

type Mod = "directory" | "wsso";
type Access = { module_key: string; via: string; organization_id: string | null; status: string; plan_ref: string | null; seats: number | null; valid_until: string | null };

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
    const subscription_id = own?.plan_ref || Deno.env.get("DIRECTORYUP_FREE_SUBSCRIPTION_ID") || "1";
    let memberId = current?.status === "linked" ? (current.external_id as string) : undefined;

    if (!memberId) {
      // 1. Check if this OmniForce user was already mapped to a Directory user (e.g. from an old run)
      const mine = await directoryup.findByOmniforceId(p.omniforce_id);
      if (mine) {
        memberId = String(mine.user_id);
        await recordLink(userId, "directory", memberId, "provisioned");
      } else {
        if (!active) return null;
        
        // 2. Create a BRAND NEW Directory member. 
        // We completely removed the findByEmail check because BD's API cannot filter by email, 
        // and doing so was causing users to hijack old accounts.
        try {
          const m = await directoryup.create({
            email: p.email,
            first_name: p.first_name,
            last_name: p.last_name,
            subscription_id,
          });
          memberId = String(m.user_id);
          await recordLink(userId, "directory", memberId, "provisioned");
          await directoryup.writeOmniforceId(memberId, p.omniforce_id);
        } catch (e) {
          if (e instanceof DuplicateError) {
             // SECURITY: The email exists in BD, but is NOT mapped to this OmniForce ID.
             // We must NOT link to it automatically. Flag it for Admin review.
             await recordLink(userId, "directory", "PENDING", "verified_email");
             return { skipped: "link_pending_review", candidate: "email_exists_in_bd" };
          }
          throw e;
        }
      }
    }

    if (!active) await directoryup.deactivate(memberId);
    else {
      await directoryup.update(memberId, {
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        subscription_id,
        active: 2,
      });
      await directoryup.writeOmniforceId(memberId, p.omniforce_id);
    }
    
    await admin.from("identity_links").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", userId).eq("module_key", "directory");
    return { external_id: memberId };
  }

  throw new Error("WSSO is synced with syncWsso()");
}

// ─────────────────────────────────────────────── WSSO

type QueuedEvent = { id: number; event_type: string; user_id: string | null; organization_id: string | null };

async function orgTarget(orgId: string): Promise<WssoOrgTarget> {
  const { data } = await admin.from("organization_links").select("external_org_id")
    .eq("organization_id", orgId).eq("module_key", "wsso").eq("status", "linked").maybeSingle();
  return { omniforce_org_id: orgId, ...(data?.external_org_id ? { external_org_id: data.external_org_id as string } : {}) };
}

const memberEvent = (on: boolean) => (on ? "member.enabled" : "member.disabled") as "member.enabled" | "member.disabled";

export async function syncWsso(e: QueuedEvent) {
  const idem = `evt-${e.id}`;

  if (!e.user_id) {
    if (!e.organization_id) return { skipped: "no_target" };
    const [a] = await rpc<{ live: boolean; plan_ref: string | null; seats: number | null }[]>("org_module_access", { p_org: e.organization_id, p_module: "wsso" });
    const target = await orgTarget(e.organization_id);
    return a?.live
      ? await wssoEvent(idem, { event: "access.updated", ...target, access: { plan_ref: a.plan_ref, seats: a.seats } })
      : await wssoEvent(idem, { event: "access.revoked", ...target });
  }

  const { data: p } = await admin.from("profiles").select("omniforce_id, status").eq("id", e.user_id).maybeSingle();
  if (!p) return { skipped: "profile_not_found" };
  const sub = p.omniforce_id as string;

  if (p.status !== "active") {
    // module_access_for() already returns nothing for a disabled account; block sign-in in WSSO too
    return await wssoEvent(idem, { event: "member.disabled", sub, scope: "account" });
  }

  const wsso = (await rpc<Access[]>("module_access_for", { p_user: e.user_id })).filter((a) => a.module_key === "wsso");
  const viaOrg = (orgId: string) => wsso.some((a) => a.via === "organization" && a.organization_id === orgId);

  if (e.organization_id) {
    return await wssoEvent(idem, { event: memberEvent(viaOrg(e.organization_id)), sub, scope: "organization", ...(await orgTarget(e.organization_id)) });
  }

  // Restate the person everywhere (the worker collapses a burst of events into the newest one):
  // their personal workspace, and their membership in each organization's workspace.
  const own = wsso.find((a) => a.via === "individual");
  const sent = [
    own
      ? await wssoEvent(`${idem}:personal`, { event: "access.updated", sub, access: { plan_ref: own.plan_ref, seats: own.seats } })
      : await wssoEvent(`${idem}:personal`, { event: "access.revoked", sub }),
    await wssoEvent(`${idem}:member`, { event: memberEvent(!!own), sub, scope: "personal" }),
  ];
  const { data: orgs } = await admin.from("organization_members").select("organization_id").eq("user_id", e.user_id);
  for (const { organization_id } of orgs ?? []) {
    sent.push(await wssoEvent(`${idem}:org:${organization_id}`, { event: memberEvent(viaOrg(organization_id)), sub, scope: "organization", ...(await orgTarget(organization_id)) }));
  }
  await admin.from("identity_links").update({ last_synced_at: new Date().toISOString(), last_error: null })
    .eq("user_id", e.user_id).eq("module_key", "wsso").eq("status", "linked");
  return { sent };
}
