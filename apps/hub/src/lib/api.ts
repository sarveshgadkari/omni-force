// One data layer for the hub. In demo mode every call resolves against
// in-memory sample data so the UI can be reviewed without a backend.
import { DEMO, supabase } from "./supabase";
import * as demo from "./demo";
import type {
  AdminOrgRow, AdminStats, AdminUserRow, AuditEntry, Entitlement, IdentityLink, Installation, IntegrationEvent, Invoice, LaunchResult,
  Module, ModuleAccess, ModuleKey, OAuthClient, OrgInvitation, OrgMember, OrgModule, OrgRole, Organization, Plan, Profile, ReviewLink,
  Subscription,
} from "./types";

const sb = () => {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
};
const wait = <T,>(v: T, ms = 220) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

/** Friendly text for error codes raised by the SQL functions. */
const friendly: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  last_owner: "An organization needs at least one owner. Make someone else owner first.",
  seat_limit_reached: "All seats on this plan are in use. Free a seat or upgrade the plan.",
  module_not_in_org_plan: "This organization doesn't have that module.",
  member_not_found: "That person isn't a member of this organization.",
  already_member: "That person is already a member.",
  invalid_email: "Enter a valid email address.",
  invalid_invitation: "This invitation link isn't valid.",
  invitation_used: "This invitation was already used or revoked.",
  invitation_expired: "This invitation has expired. Ask for a new one.",
  invitation_email_mismatch: "This invitation was sent to a different email address. Sign in with that address to accept it.",
  email_unverified: "Verify your email address first.",
  slug_taken: "That short name is taken.",
  invalid_slug: "Use lowercase letters, numbers and dashes.",
  reason_required: "Add a short reason. It goes in the audit trail.",
  enable_a_client_first: "Enable an application client before switching SSO on for everyone.",
  external_account_linked_to_other_user: "That account is already linked to another OmniForce user.",
  user_already_linked_to_other_account: "This user is already linked to a different account in that module.",
  external_org_linked_to_other_organization: "That organization is already linked to another OmniForce organization.",
  organization_already_linked_to_other_account: "This organization is already linked to a different one in that module.",
};
const explain = (m: string) => {
  const code = Object.keys(friendly).find((k) => m.includes(k));
  return code ? friendly[code] : m;
};
const must = <T,>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(explain(res.error.message));
  return res.data as T;
};

export class ApiError extends Error {
  constructor(message: string, public code?: string, public extra: Record<string, unknown> = {}) { super(message); }
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke(fn, { body });
  if (error) {
    // surface the function's JSON error (message + code) when there is one
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const j = await ctx.json().catch(() => null);
      if (j?.error) {
        // { error: message, code? } from our handlers, or OAuth-style { error: code, error_description }
        const { error: e1, error_description: desc, code, ...extra } = j;
        throw new ApiError(desc ?? e1, code ?? (desc ? e1 : undefined), extra);
      }
    }
    throw new ApiError(error.message);
  }
  return data as T;
}

/* ───────────────────────── auth ───────────────────────── */

let demoSignedIn = true;
let demoAdmin = true;

export const auth = {
  async signUp(input: { firstName: string; lastName: string; email: string; password: string; company?: string }) {
    if (DEMO) return wait({ needsVerification: true });
    const { error } = await sb().auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { first_name: input.firstName, last_name: input.lastName, company_name: input.company ?? null } },
    });
    if (error) throw error;
    return { needsVerification: true };
  },
  async verifyOtp(email: string, token: string) {
    if (DEMO) { if (token !== "123456" && token.length !== 6) throw new Error("Enter the 6-digit code"); demoSignedIn = true; return wait(true); }
    const { error } = await sb().auth.verifyOtp({ email, token, type: "signup" });
    if (error) throw error;
    return true;
  },
  async resendOtp(email: string) {
    if (DEMO) return wait(true);
    const { error } = await sb().auth.resend({ type: "signup", email });
    if (error) throw error;
    return true;
  },
  async signIn(email: string, password: string) {
    if (DEMO) { demoSignedIn = true; return wait(true); }
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return true;
  },
  async sendReset(email: string) {
    if (DEMO) return wait(true);
    const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
    if (error) throw error;
    return true;
  },
  /** Set a new password. Used on /reset-password after the emailed recovery link signs the user in. */
  async updatePassword(password: string) {
    if (DEMO) return wait(true, 400);
    const { error } = await sb().auth.updateUser({ password });
    if (error) throw error;
    return true;
  },
  async signOut() {
    if (DEMO) { demoSignedIn = false; return; }
    await sb().auth.signOut();
  },
  async hasSession() {
    if (DEMO) return demoSignedIn;
    const { data } = await sb().auth.getSession();
    return !!data.session;
  },
  onChange(cb: () => void) {
    if (DEMO) return () => {};
    const { data } = sb().auth.onAuthStateChange(() => cb());
    return () => data.subscription.unsubscribe();
  },
};

/* ───────────────────────── account ───────────────────────── */

export const account = {
  async me(): Promise<{ profile: Profile; isAdmin: boolean } | null> {
    if (DEMO) return demoSignedIn ? wait({ profile: demo.demoMe, isAdmin: demoAdmin }, 120) : null;
    const { data: u } = await sb().auth.getUser();
    if (!u.user) return null;
    const profile = must(await sb().from("profiles").select("*").eq("id", u.user.id).single()) as Profile;
    const { data: adm } = await sb().from("platform_admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
    return { profile, isAdmin: !!adm };
  },
  async updateProfile(p: Partial<Pick<Profile, "first_name" | "last_name" | "company_name" | "phone" | "default_module">>) {
    if (DEMO) { Object.assign(demo.demoMe, p); return wait(demo.demoMe); }
    return must(await sb().rpc("update_my_profile", {
      p_first_name: p.first_name ?? null, p_last_name: p.last_name ?? null, p_company_name: p.company_name ?? null,
      p_phone: p.phone ?? null, p_default_module: p.default_module ?? null,
    })) as Profile;
  },
  async modules(): Promise<Module[]> {
    if (DEMO) return wait(demo.demoModules, 60);
    return must(await sb().from("modules").select("key,name,deployment,app_url,sso_status,provisioning_status,integration_notes,is_active,sort").order("sort")) as Module[];
  },
  /** The user's own (individual) entitlements. */
  async entitlements(): Promise<Entitlement[]> {
    if (DEMO) return wait(demo.demoEntitlements, 100);
    const { data: u } = await sb().auth.getUser();
    return must(await sb().from("entitlements").select("*, plan:plans(name,code,seats)").eq("user_id", u.user?.id ?? "")) as Entitlement[];
  },
  /** Effective access: own entitlements plus organization seats. */
  async access(): Promise<ModuleAccess[]> {
    if (DEMO) return wait(demo.demoAccess, 100);
    return must(await sb().rpc("my_module_access")) as ModuleAccess[];
  },
  async links(): Promise<IdentityLink[]> {
    if (DEMO) return wait(demo.demoLinks, 100);
    return must(await sb().from("identity_links").select("*")) as IdentityLink[];
  },
  async subscriptions(): Promise<Subscription[]> {
    if (DEMO) return wait(demo.demoSubscriptions);
    return must(await sb().from("subscriptions")
      .select("id,user_id,status,current_period_end,cancel_at_period_end, items:subscription_items(quantity, plan:plans(*))")
      .is("organization_id", null)
      .order("created_at", { ascending: false })) as unknown as Subscription[];
  },
  async invoices(): Promise<Invoice[]> {
    if (DEMO) return wait(demo.demoInvoices);
    return must(await sb().from("invoices").select("*").is("organization_id", null).order("created_at", { ascending: false }).limit(24)) as Invoice[];
  },
  async installations(): Promise<Installation[]> {
    if (DEMO) return wait(demo.demoInstallations.filter((i) => i.user_id === demo.demoMe.id));
    return must(await sb().from("workforce_installations").select("*").order("created_at", { ascending: false })) as Installation[];
  },
  /** Smart redirect target: last used module if still accessible, else default, else Directory. */
  async landingModule(): Promise<ModuleKey> {
    if (DEMO) {
      const ok = demo.demoAccess.map((a) => a.module_key);
      const me = demo.demoMe;
      return wait((me.last_module && ok.includes(me.last_module) ? me.last_module : ok.includes(me.default_module) ? me.default_module : ok[0]) ?? "directory", 300);
    }
    return must(await sb().rpc("resolve_landing_module")) as ModuleKey;
  },
  async setLastModule(m: ModuleKey) {
    if (DEMO) { demo.demoMe.last_module = m; return; }
    await sb().rpc("set_last_module", { p_module: m });
  },
};

/* ───────────────────────── organizations ───────────────────────── */

export const orgs = {
  async list(): Promise<Organization[]> {
    if (DEMO) return wait(demo.demoOrgs);
    return must(await sb().rpc("my_organizations")) as Organization[];
  },
  async create(name: string, slug?: string): Promise<{ id: string }> {
    if (DEMO) {
      const o: Organization = { id: `o-${Date.now()}`, slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, status: "active", role: "owner", member_count: 1, created_at: new Date().toISOString() };
      demo.demoOrgs.push(o);
      demo.demoOrgMembers[o.id] = [{ ...demo.memberOf(demo.demoMe), role: "owner", modules: [] }];
      demo.demoOrgModules[o.id] = [];
      return wait({ id: o.id });
    }
    return must(await sb().rpc("create_organization", { p_name: name, p_slug: slug || null })) as { id: string };
  },
  async rename(id: string, name: string) {
    if (DEMO) { const o = demo.demoOrgs.find((x) => x.id === id); if (o) o.name = name; return wait(true); }
    must(await sb().rpc("update_organization", { p_org: id, p_name: name }));
    return true;
  },
  async members(id: string): Promise<OrgMember[]> {
    if (DEMO) return wait(demo.demoOrgMembers[id] ?? []);
    return must(await sb().rpc("org_members", { p_org: id })) as OrgMember[];
  },
  async modules(id: string): Promise<OrgModule[]> {
    if (DEMO) return wait(demo.demoOrgModules[id] ?? []);
    return must(await sb().rpc("org_modules", { p_org: id })) as OrgModule[];
  },
  async invitations(id: string): Promise<OrgInvitation[]> {
    if (DEMO) return wait(demo.demoInvitations[id] ?? []);
    return must(await sb().rpc("org_invitations", { p_org: id })) as OrgInvitation[];
  },
  /** Returns the one-time invitation link. Share it with the invitee; it's only shown once. */
  async invite(id: string, email: string, role: OrgRole): Promise<{ link: string; email: string }> {
    if (DEMO) {
      (demo.demoInvitations[id] ??= []).unshift({ id: `inv-${Date.now()}`, email: email.toLowerCase(), role, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), invited_by_name: "Avery Cole" });
      return wait({ link: `${location.origin}/invite/demo-${Math.random().toString(16).slice(2)}`, email: email.toLowerCase() });
    }
    const r = must(await sb().rpc("create_org_invitation", { p_org: id, p_email: email, p_role: role })) as { token: string; email: string };
    return { link: `${location.origin}/invite/${r.token}`, email: r.email };
  },
  async revokeInvitation(orgId: string, invitationId: string) {
    if (DEMO) { demo.demoInvitations[orgId] = (demo.demoInvitations[orgId] ?? []).filter((i) => i.id !== invitationId); return wait(true); }
    must(await sb().rpc("revoke_org_invitation", { p_invitation: invitationId }));
    return true;
  },
  async previewInvitation(token: string): Promise<{ state: "open" | "used" | "expired" | "invalid"; organization_name?: string; role?: OrgRole; email?: string }> {
    if (DEMO) return wait({ state: "open", organization_name: "Skyline Aerial Survey", role: "member", email: demo.demoMe.email });
    return must(await sb().rpc("get_org_invitation", { p_token: token })) as { state: "open" };
  },
  async acceptInvitation(token: string): Promise<string> {
    if (DEMO) return wait(demo.demoOrgs[0].id);
    return must(await sb().rpc("accept_org_invitation", { p_token: token })) as string;
  },
  async setRole(id: string, userId: string, role: OrgRole) {
    if (DEMO) { const m = demo.demoOrgMembers[id]?.find((x) => x.user_id === userId); if (m) m.role = role; return wait(true); }
    must(await sb().rpc("set_org_member_role", { p_org: id, p_user: userId, p_role: role }));
    return true;
  },
  async remove(id: string, userId: string) {
    if (DEMO) { demo.demoOrgMembers[id] = (demo.demoOrgMembers[id] ?? []).filter((x) => x.user_id !== userId); return wait(true); }
    must(await sb().rpc("remove_org_member", { p_org: id, p_user: userId }));
    return true;
  },
  async assignSeat(id: string, userId: string, m: ModuleKey) {
    if (DEMO) {
      const mod = demo.demoOrgModules[id]?.find((x) => x.module_key === m);
      if (mod?.seats && mod.seats_used >= mod.seats) throw new Error(friendly.seat_limit_reached);
      const mem = demo.demoOrgMembers[id]?.find((x) => x.user_id === userId);
      if (mem && !mem.modules.includes(m)) { mem.modules.push(m); if (mod) mod.seats_used++; }
      return wait(true);
    }
    must(await sb().rpc("assign_org_module_seat", { p_org: id, p_user: userId, p_module: m }));
    return true;
  },
  async unassignSeat(id: string, userId: string, m: ModuleKey) {
    if (DEMO) {
      const mem = demo.demoOrgMembers[id]?.find((x) => x.user_id === userId);
      const mod = demo.demoOrgModules[id]?.find((x) => x.module_key === m);
      if (mem?.modules.includes(m)) { mem.modules = mem.modules.filter((x) => x !== m); if (mod) mod.seats_used--; }
      return wait(true);
    }
    must(await sb().rpc("unassign_org_module_seat", { p_org: id, p_user: userId, p_module: m }));
    return true;
  },
};

/* ───────────────────────── billing + modules ───────────────────────── */

export const billing = {
  async plans(): Promise<Plan[]> {
    if (DEMO) return wait(demo.demoPlans, 80);
    return must(await sb().from("plans").select("*").eq("is_public", true).eq("is_active", true).order("sort")) as Plan[];
  },
  /** Creates a Stripe Checkout session for the chosen plans and returns its URL. */
  async checkout(planIds: string[], organizationId?: string): Promise<string> {
    if (DEMO) return wait(`#/checkout/success?demo=1`, 600);
    const { url } = await invoke<{ url: string }>("stripe-checkout", {
      plan_ids: planIds,
      organization_id: organizationId ?? null,
      success_url: `${location.origin}/checkout/success`,
      cancel_url: `${location.origin}/plans`,
    });
    return url;
  },
  async portal(organizationId?: string): Promise<string> {
    if (DEMO) return wait("#/app/billing", 400);
    const { url } = await invoke<{ url: string }>("stripe-portal", {
      return_url: organizationId ? `${location.origin}/app/orgs/${organizationId}` : `${location.origin}/app/billing`,
      organization_id: organizationId ?? null,
    });
    return url;
  },
};

export const launch = {
  /**
   * Where "Open module" goes. SSO to WSSO and the Drone Directory is not live yet:
   * until a module's SSO is enabled this returns the module's own sign-in page.
   */
  async module(m: ModuleKey): Promise<LaunchResult> {
    if (DEMO) {
      demo.demoMe.last_module = m;
      const mod = demo.demoModules.find((x) => x.key === m);
      return wait({ unavailable: true as const, app_url: mod?.app_url ?? null, message: `Signing in to ${mod?.name} with OmniForce isn't available yet. Sign in there directly with your existing login.` }, 500);
    }
    try {
      return await invoke<{ url: string }>("sso-launch", { module: m });
    } catch (e) {
      if (e instanceof ApiError && e.code === "sso_unavailable") return { unavailable: true, app_url: (e.extra.app_url as string) ?? null, message: e.message };
      throw e;
    }
  },
  async createInstallation(name: string): Promise<{ installation: Installation; license_key: string }> {
    if (DEMO) {
      const key = "WF2-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 10).toUpperCase();
      const inst: Installation = { id: `i-${Date.now()}`, user_id: demo.demoMe.id, name, hostname: null, license_key_prefix: key.slice(0, 8), status: "pending", version: null, last_seen_at: null, created_at: new Date().toISOString(), owner_label: demo.demoMe.company_name ?? "" };
      demo.demoInstallations.unshift(inst);
      return wait({ installation: inst, license_key: key }, 500);
    }
    return invoke("workforce-license", { action: "create", name });
  },
};

/* ───────────────────────── OAuth (applications signing in with OmniForce) ───────────────────────── */

export const oauth = {
  async authorize(params: Record<string, string | null>): Promise<{ redirect_to: string }> {
    if (DEMO) throw new ApiError("Demo mode can't complete an application sign-in.", "invalid_request");
    return invoke("oidc/authorize", params);
  },
};

/* ───────────────────────── admin ───────────────────────── */

export const admin = {
  async stats(): Promise<AdminStats> {
    if (DEMO) {
      const by: AdminStats["by_module"] = {};
      demo.demoUsers.forEach((u) => u.entitlements.filter((e) => e.status !== "canceled").forEach((e) => { by[e.module_key] = (by[e.module_key] ?? 0) + 1; }));
      by.workforce = demo.demoInstallations.filter((i) => i.status === "active").length;
      return wait({
        users: demo.demoUsers.length, active_users: demo.demoUsers.filter((u) => u.status === "active").length, paying_users: 6, mrr_cents: 236300,
        by_module: by, queue_failed: demo.demoEvents.filter((e) => e.status === "failed" || e.status === "dead").length,
        queue_pending: demo.demoEvents.filter((e) => e.status === "queued").length, installations: 2,
        organizations: demo.demoAdminOrgs.length, links_to_review: demo.demoReviewLinks.length,
      });
    }
    return must(await sb().rpc("admin_stats")) as AdminStats;
  },
  async users(q = ""): Promise<AdminUserRow[]> {
    const ql = q.trim().toLowerCase();
    if (DEMO) return wait(demo.demoUsers.filter((u) => !ql || `${u.first_name} ${u.last_name} ${u.email} ${u.omniforce_id} ${u.company_name ?? ""}`.toLowerCase().includes(ql)));
    let query = sb().from("profiles").select("*, entitlements!entitlements_user_id_fkey(*, plan:plans(name,code,seats)), links:identity_links!identity_links_user_id_fkey(*)").order("created_at", { ascending: false }).limit(200);
    if (ql) {
      const safe = ql.replace(/[%,()*]/g, " ");
      query = query.or(`email.ilike.%${safe}%,omniforce_id.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,company_name.ilike.%${safe}%`);
    }
    return must(await query) as AdminUserRow[];
  },
  async setUserStatus(userId: string, status: "active" | "disabled") {
    if (DEMO) { const u = demo.demoUsers.find((x) => x.id === userId); if (u) u.status = status; return wait(true); }
    return invoke("admin-actions", { action: "set_status", user_id: userId, status });
  },
  async grant(owner: { user_id: string } | { organization_id: string }, module: ModuleKey, planId: string) {
    if (DEMO) {
      if ("user_id" in owner) {
        const u = demo.demoUsers.find((x) => x.id === owner.user_id); const p = demo.demoPlans.find((x) => x.id === planId);
        if (u && p) { u.entitlements = u.entitlements.filter((e) => e.module_key !== module); u.entitlements.push({ id: `e-${Date.now()}`, user_id: u.id, module_key: module, plan_id: p.id, status: "active", source: "admin", valid_until: null, plan: { name: p.name, code: p.code, seats: p.seats } }); }
      }
      return wait(true);
    }
    return invoke("admin-actions", { action: "grant", ...owner, module, plan_id: planId });
  },
  async revoke(owner: { user_id: string } | { organization_id: string }, module: ModuleKey) {
    if (DEMO) {
      if ("user_id" in owner) { const u = demo.demoUsers.find((x) => x.id === owner.user_id); if (u) u.entitlements = u.entitlements.map((e) => e.module_key === module ? { ...e, status: "canceled" } : e); }
      return wait(true);
    }
    return invoke("admin-actions", { action: "revoke", ...owner, module });
  },
  async plans(): Promise<Plan[]> {
    if (DEMO) return wait(demo.demoPlans);
    return must(await sb().from("plans").select("*").order("sort")) as Plan[];
  },
  async savePlan(p: Partial<Plan> & { id: string }) {
    if (DEMO) { const i = demo.demoPlans.findIndex((x) => x.id === p.id); if (i >= 0) demo.demoPlans[i] = { ...demo.demoPlans[i], ...p }; return wait(true); }
    const { id, ...rest } = p;
    must(await sb().from("plans").update(rest).eq("id", id).select().single());
    return true;
  },
  async events(filter: { module?: ModuleKey | ""; status?: string }): Promise<IntegrationEvent[]> {
    if (DEMO) return wait(demo.demoEvents.filter((e) => (!filter.module || e.module_key === filter.module) && (!filter.status || (filter.status === "problems" ? ["failed", "dead"].includes(e.status) : e.status === filter.status))));
    let q = sb().from("integration_events").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter.module) q = q.eq("module_key", filter.module);
    if (filter.status === "problems") q = q.in("status", ["failed", "dead"]);
    else if (filter.status) q = q.eq("status", filter.status);
    return must(await q) as IntegrationEvent[];
  },
  async retryEvent(id: number) {
    if (DEMO) { const e = demo.demoEvents.find((x) => x.id === id); if (e) { e.status = "queued"; e.last_error = null; } return wait(true); }
    must(await sb().from("integration_events").update({ status: "queued", next_attempt_at: new Date().toISOString() }).eq("id", id).select().single());
    return true;
  },
  async installations(): Promise<Installation[]> {
    if (DEMO) return wait(demo.demoInstallations);
    return must(await sb().from("workforce_installations").select("*").order("created_at", { ascending: false })) as Installation[];
  },
  async revokeInstallation(id: string) {
    if (DEMO) { const i = demo.demoInstallations.find((x) => x.id === id); if (i) i.status = "revoked"; return wait(true); }
    return invoke("workforce-license", { action: "revoke", id });
  },
  async audit(): Promise<AuditEntry[]> {
    if (DEMO) return wait(demo.demoAudit);
    const rows = must(await sb().from("audit_log").select("id, action, target_type, target_id, created_at, actor:profiles(first_name,last_name)").order("created_at", { ascending: false }).limit(200)) as unknown as (AuditEntry & { actor: { first_name: string; last_name: string } | null })[];
    return rows.map((r) => ({ ...r, actor_label: r.actor ? `${r.actor.first_name} ${r.actor.last_name}`.trim() : "System" }));
  },

  /* organizations */
  async organizations(q = ""): Promise<AdminOrgRow[]> {
    const ql = q.trim().toLowerCase();
    if (DEMO) return wait(demo.demoAdminOrgs.filter((o) => !ql || `${o.name} ${o.slug}`.toLowerCase().includes(ql)));
    let query = sb().from("organizations").select("id, slug, name, status, created_at, members:organization_members(count), entitlements(*, plan:plans(name,code,seats)), links:organization_links(id, module_key, external_org_id, status, link_method)").order("created_at", { ascending: false }).limit(200);
    if (ql) { const safe = ql.replace(/[%,()*]/g, " "); query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`); }
    return must(await query) as unknown as AdminOrgRow[];
  },
  async setOrgStatus(id: string, status: "active" | "disabled") {
    if (DEMO) { const o = demo.demoAdminOrgs.find((x) => x.id === id); if (o) o.status = status; return wait(true); }
    return invoke("admin-actions", { action: "set_org_status", organization_id: id, status });
  },
  async linkOrganization(id: string, module: ModuleKey, externalOrgId: string, reason: string) {
    if (DEMO) return wait(true);
    must(await sb().rpc("admin_link_organization", { p_org: id, p_module: module, p_external_org_id: externalOrgId, p_reason: reason }));
    return true;
  },
  async unlinkOrganization(linkId: string, reason: string) {
    if (DEMO) return wait(true);
    must(await sb().rpc("admin_unlink_organization", { p_link: linkId, p_reason: reason }));
    return true;
  },

  /* identity links */
  async linksToReview(): Promise<ReviewLink[]> {
    if (DEMO) return wait(demo.demoReviewLinks);
    return must(await sb().from("identity_links").select("*, profile:profiles!identity_links_user_id_fkey(omniforce_id,email,first_name,last_name)").eq("status", "pending_review").order("created_at")) as unknown as ReviewLink[];
  },
  async reviewLink(id: string, approve: boolean, reason: string) {
    if (DEMO) { demo.demoReviewLinks.splice(demo.demoReviewLinks.findIndex((l) => l.id === id), 1); return wait(true); }
    must(await sb().rpc("admin_review_identity_link", { p_link: id, p_approve: approve, p_reason: reason || null }));
    return true;
  },
  async linkIdentity(userId: string, module: ModuleKey, externalId: string, reason: string) {
    if (DEMO) return wait(true);
    must(await sb().rpc("admin_link_identity", { p_user: userId, p_module: module, p_external_id: externalId, p_reason: reason }));
    return true;
  },
  async unlinkIdentity(linkId: string, reason: string) {
    if (DEMO) return wait(true);
    must(await sb().rpc("admin_unlink_identity", { p_link: linkId, p_reason: reason }));
    return true;
  },

  /* applications (OAuth clients) and module integration switches */
  async modules(): Promise<Module[]> {
    return account.modules();
  },
  async clients(): Promise<OAuthClient[]> {
    if (DEMO) return wait(demo.demoClients);
    return must(await sb().from("oauth_clients").select("client_id, module_key, name, environment, status, secret_hint, redirect_uris, initiate_login_uri, allowed_scopes, created_at").order("created_at")) as OAuthClient[];
  },
  async createClient(input: { module: ModuleKey; name: string; environment: OAuthClient["environment"]; redirect_uris: string[]; initiate_login_uri: string | null }): Promise<{ client_id: string; client_secret: string }> {
    if (DEMO) {
      const c: OAuthClient = { client_id: `ofc_demo${Date.now().toString(16)}`, module_key: input.module, name: input.name, environment: input.environment, status: "disabled", secret_hint: "9f2c", redirect_uris: input.redirect_uris, initiate_login_uri: input.initiate_login_uri, allowed_scopes: ["openid", "profile", "email", "organizations", "entitlements"], created_at: new Date().toISOString() };
      demo.demoClients.push(c);
      return wait({ client_id: c.client_id, client_secret: "ofs_demo_secret_not_real" });
    }
    return must(await sb().rpc("admin_create_oauth_client", {
      p_module: input.module, p_name: input.name, p_environment: input.environment, p_redirect_uris: input.redirect_uris, p_initiate_login_uri: input.initiate_login_uri,
    })) as { client_id: string; client_secret: string };
  },
  async updateClient(c: Pick<OAuthClient, "client_id" | "name" | "redirect_uris" | "initiate_login_uri" | "status">) {
    if (DEMO) { const i = demo.demoClients.findIndex((x) => x.client_id === c.client_id); if (i >= 0) demo.demoClients[i] = { ...demo.demoClients[i], ...c }; return wait(true); }
    must(await sb().rpc("admin_update_oauth_client", { p_client_id: c.client_id, p_name: c.name, p_redirect_uris: c.redirect_uris, p_initiate_login_uri: c.initiate_login_uri, p_status: c.status }));
    return true;
  },
  async rotateClientSecret(clientId: string): Promise<{ client_secret: string }> {
    if (DEMO) return wait({ client_secret: "ofs_demo_rotated_not_real" });
    return must(await sb().rpc("admin_rotate_oauth_client_secret", { p_client_id: clientId })) as { client_secret: string };
  },
  async setModuleIntegration(m: ModuleKey, sso: Module["sso_status"] | null, provisioning: Module["provisioning_status"] | null) {
    if (DEMO) {
      const mod = demo.demoModules.find((x) => x.key === m);
      if (sso === "enabled" && !demo.demoClients.some((c) => c.module_key === m && c.status === "enabled")) throw new Error(friendly.enable_a_client_first);
      if (mod) { if (sso) mod.sso_status = sso; if (provisioning) mod.provisioning_status = provisioning; }
      return wait(true);
    }
    must(await sb().rpc("admin_set_module_integration", { p_module: m, p_sso_status: sso, p_provisioning_status: provisioning }));
    return true;
  },
};

export function setDemoAdmin(v: boolean) { demoAdmin = v; }
