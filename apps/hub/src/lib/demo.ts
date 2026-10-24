// Sample data for demo mode. Every record here is fictional.
import type {
  AdminOrgRow, AdminUserRow, AuditEntry, Entitlement, IdentityLink, Installation, IntegrationEvent, Invoice, Module, ModuleAccess, OAuthClient,
  OrgInvitation, OrgMember, OrgModule, Organization, Plan, Profile, ReviewLink, Subscription,
} from "./types";

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();
const ahead = (days: number) => new Date(now + days * 86_400_000).toISOString();

// Same integration state as a fresh database: no module has Omni Force Vector sign-in switched on.
export const demoModules: Module[] = [
  { key: "directory", name: "Drone Directory", deployment: "cloud", app_url: "https://drones-drones-drones.directoryup.com", sso_status: "not_configured", provisioning_status: "disabled", integration_notes: "DirectoryUp token SSO and member provisioning are implemented. An admin still has to switch Directory sign-in and provisioning on.", is_active: true, sort: 1 },
  { key: "wsso", name: "WSSO", deployment: "cloud", app_url: "https://wsso.tlbisbig.world", sso_status: "not_configured", provisioning_status: "disabled", integration_notes: "Separate Supabase project (profiles, organizations). Integration contract drafted, nothing deployed on the WSSO side.", is_active: true, sort: 2 },
  { key: "workforce", name: "Workforce 2.0", deployment: "onprem", app_url: null, sso_status: "not_configured", provisioning_status: "disabled", integration_notes: "Desktop app (Windows, Linux, Android). Omni Force Vector licence keys; activation from the app is not live.", is_active: true, sort: 3 },
];

let pid = 0;
const plan = (p: Partial<Plan> & Pick<Plan, "code" | "name" | "interval" | "price_cents">): Plan => ({
  id: `plan-${++pid}`, module_key: null, bundle_modules: [], currency: "usd", external_ref: null, seats: null,
  trial_days: 0, is_public: true, is_active: true, stripe_price_id: null, audience: "any", sort: pid, ...p,
});

export const demoPlans: Plan[] = [
  plan({ code: "dir_scout", name: "Scout", module_key: "directory", interval: "free", price_cents: 0, external_ref: "1" }),
  plan({ code: "dir_recreational", name: "Recreational Pilot", module_key: "directory", interval: "free", price_cents: 0, external_ref: "6" }),
  plan({ code: "dir_commercial_month", name: "Commercial Pilot", module_key: "directory", interval: "month", price_cents: 1900, external_ref: "3", stripe_price_id: "price_demo_1" }),
  plan({ code: "dir_provider_month", name: "Service Provider", module_key: "directory", interval: "month", price_cents: 4900, external_ref: "2", stripe_price_id: "price_demo_2" }),
  plan({ code: "dir_vendor_month", name: "Vendor", module_key: "directory", interval: "month", price_cents: 7900, external_ref: "5" }),
  plan({ code: "dir_employer_month", name: "Employer / Contractor", module_key: "directory", interval: "month", price_cents: 9900, external_ref: "5" }),
  plan({ code: "wsso_starter_month", name: "Starter", module_key: "wsso", interval: "month", price_cents: 9900, seats: 10, trial_days: 14, external_ref: "starter", stripe_price_id: "price_demo_3" }),
  plan({ code: "wsso_growth_month", name: "Growth", module_key: "wsso", interval: "month", price_cents: 29900, seats: 50, trial_days: 14, external_ref: "growth", stripe_price_id: "price_demo_4" }),
  plan({ code: "wsso_business_month", name: "Business", module_key: "wsso", interval: "month", price_cents: 69900, seats: 150, external_ref: "business" }),
  plan({ code: "wsso_enterprise_month", name: "Enterprise", module_key: "wsso", interval: "month", price_cents: 150000, seats: 500, external_ref: "enterprise" }),
  plan({ code: "wf_single_license", name: "Single site", module_key: "workforce", interval: "license", price_cents: 0, external_ref: "single" }),
  plan({ code: "wf_multi_license", name: "Multi site", module_key: "workforce", interval: "license", price_cents: 0, external_ref: "multi" }),
  plan({ code: "bundle_dir_wsso_month", name: "Directory + WSSO", bundle_modules: ["directory", "wsso"], interval: "month", price_cents: 32900, seats: 50, trial_days: 14, external_ref: "2|growth" }),
];
const P = (code: string) => demoPlans.find((p) => p.code === code)!;

export const demoMe: Profile = {
  id: "u-1", omniforce_id: "OF-0009821", email: "avery@skylineaerial.example", first_name: "Avery", last_name: "Cole",
  company_name: "Skyline Aerial Survey", phone: "+1 303 555 0142", status: "active",
  last_module: "wsso", default_module: "directory", created_at: ago(60 * 24 * 41),
};

const ent = (user: string, m: Entitlement["module_key"], code: string, status: Entitlement["status"] = "active", source: Entitlement["source"] = "stripe"): Entitlement => {
  const p = P(code);
  return { id: `e-${user}-${m}`, user_id: user, module_key: m, plan_id: p.id, status, source, valid_until: source === "stripe" ? ahead(19) : null, plan: { name: p.name, code: p.code, seats: p.seats } };
};

export const demoEntitlements: Entitlement[] = [
  ent("u-1", "directory", "dir_provider_month"),
  ent("u-1", "workforce", "wf_single_license", "active", "license"),
];

export const demoSubscriptions: Subscription[] = [
  {
    id: "s-1", user_id: "u-1", status: "active", current_period_end: ahead(19), cancel_at_period_end: false,
    items: [{ plan: P("dir_provider_month"), quantity: 1 }],
  },
];

export const demoInvoices: Invoice[] = [
  { id: "in_3", number: "OF-2026-0093", amount_paid_cents: 4900, currency: "usd", status: "paid", hosted_invoice_url: null, created_at: ago(60 * 24 * 11) },
  { id: "in_2", number: "OF-2026-0061", amount_paid_cents: 4900, currency: "usd", status: "paid", hosted_invoice_url: null, created_at: ago(60 * 24 * 41) },
];

export const demoLinks: IdentityLink[] = [];

const people: [string, string, string, string, string | null][] = [
  ["u-2", "Henry", "", "henry@omniforce.example", "Omni Force Vector"],
  ["u-3", "Trence", "", "trence@omniforce.example", "Omni Force Vector"],
  ["u-4", "Priya", "Raman", "priya@ridgeline.example", "Ridgeline Inspections"],
  ["u-5", "Marcus", "Bell", "marcus@bellag.example", "Bell Ag Spraying"],
  ["u-6", "Lena", "Vogt", "lena@vogtmapping.example", "Vogt Mapping"],
  ["u-7", "Diego", "Santos", "diego@skyfilm.example", null],
  ["u-8", "Hana", "Kim", "hana@northgrid.example", "NorthGrid Utilities"],
];

export const demoUsers: AdminUserRow[] = [
  { ...demoMe, entitlements: demoEntitlements, links: demoLinks },
  ...people.map(([id, f, l, email, co], i): AdminUserRow => ({
    id, omniforce_id: `OF-${String(9822 + i).padStart(7, "0")}`, email, first_name: f, last_name: l, company_name: co, phone: null,
    status: id === "u-7" ? "disabled" : "active", last_module: i % 2 ? "wsso" : "directory", default_module: "directory", created_at: ago(60 * 24 * (30 - i * 3)),
    entitlements: [
      ent(id, "directory", i % 3 === 0 ? "dir_scout" : "dir_commercial_month", "active", i % 3 === 0 ? "free" : "stripe"),
      ...(i % 2 ? [ent(id, "wsso", i === 3 ? "wsso_starter_month" : "wsso_business_month", i === 5 ? "past_due" : "active")] : []),
    ],
    links: [], // no module integration is live yet, so nothing is linked
  })),
];

// Provisioning is disabled for every module until its API contract is verified,
// so a fresh hub has no outbound sync traffic.
export const demoEvents: IntegrationEvent[] = [];

export const demoInstallations: Installation[] = [
  { id: "i-1", user_id: "u-1", name: "Denver HQ", hostname: "wf-denver-01", license_key_prefix: "WF2-7Q4K", status: "active", version: "2.0.6", last_seen_at: ago(4), created_at: ago(60 * 24 * 30), owner_label: "Skyline Aerial Survey" },
  { id: "i-2", user_id: "u-5", name: "Hangar 2", hostname: "bellag-srv", license_key_prefix: "WF2-M2PX", status: "active", version: "2.0.5", last_seen_at: ago(60 * 9), created_at: ago(60 * 24 * 12), owner_label: "Bell Ag Spraying" },
  { id: "i-3", user_id: "u-8", name: "Substation ops", hostname: null, license_key_prefix: "WF2-ZK81", status: "pending", version: null, last_seen_at: null, created_at: ago(60 * 5), owner_label: "NorthGrid Utilities" },
];

export const demoAudit: AuditEntry[] = [
  { id: 88, actor_label: "Henry", action: "entitlement.grant", target_type: "user", target_id: "OF-0009824", created_at: ago(35) },
  { id: 87, actor_label: "Trence", action: "user.disable", target_type: "user", target_id: "OF-0009827", created_at: ago(62) },
  { id: 86, actor_label: "System", action: "stripe.subscription.updated", target_type: "subscription", target_id: "sub_1Q…", created_at: ago(90) },
  { id: 85, actor_label: "Henry", action: "plan.update", target_type: "plan", target_id: "wsso_growth_month", created_at: ago(60 * 20) },
];

/* ───────────── organizations (demo) ───────────── */

export const memberOf = (p: Profile): Omit<OrgMember, "role" | "modules"> => ({
  user_id: p.id, omniforce_id: p.omniforce_id, first_name: p.first_name, last_name: p.last_name, email: p.email, status: "active", joined_at: p.created_at,
});

export const demoOrgs: Organization[] = [
  { id: "o-1", slug: "skyline-aerial", name: "Skyline Aerial Survey", status: "active", role: "owner", member_count: 4, created_at: ago(60 * 24 * 40) },
];

const person = (id: string, of: string, first: string, last: string, email: string): Profile => ({
  id, omniforce_id: of, email, first_name: first, last_name: last, company_name: "Skyline Aerial Survey", phone: null, status: "active", last_module: null, default_module: "directory", created_at: ago(60 * 24 * 20),
});

export const demoOrgMembers: Record<string, OrgMember[]> = {
  "o-1": [
    { ...memberOf(demoMe), role: "owner", modules: ["wsso"] },
    { ...memberOf(person("u-11", "OF-0009901", "Jordan", "Reyes", "jordan@skylineaerial.example")), role: "admin", modules: ["wsso"] },
    { ...memberOf(person("u-12", "OF-0009902", "Sam", "Okafor", "sam@skylineaerial.example")), role: "billing", modules: [] },
    { ...memberOf(person("u-13", "OF-0009903", "Riley", "Chen", "riley@skylineaerial.example")), role: "member", modules: ["wsso"] },
  ],
};

export const demoOrgModules: Record<string, OrgModule[]> = {
  "o-1": [
    { module_key: "wsso", entitlement_id: "e-o1-wsso", plan_name: "Growth", plan_code: "wsso_growth_month", seats: 50, seats_used: 3, status: "trialing", source: "stripe", valid_until: ahead(9), live: true },
  ],
};

export const demoInvitations: Record<string, OrgInvitation[]> = {
  "o-1": [{ id: "inv-1", email: "casey@skylineaerial.example", role: "member", created_at: ago(60 * 26), expires_at: ahead(6), invited_by_name: "Avery Cole" }],
};

/** Effective access in demo: own Directory + Workforce, WSSO through the organization seat. */
export const demoAccess: ModuleAccess[] = [
  { module_key: "directory", via: "individual", organization_id: null, organization_name: null, org_role: null, entitlement_id: "e-u-1-directory", plan_code: "dir_provider_month", plan_name: "Service Provider", seats: null, status: "active", source: "stripe", valid_until: ahead(19) },
  { module_key: "wsso", via: "organization", organization_id: "o-1", organization_name: "Skyline Aerial Survey", org_role: "owner", entitlement_id: "e-o1-wsso", plan_code: "wsso_growth_month", plan_name: "Growth", seats: 50, status: "trialing", source: "stripe", valid_until: ahead(9) },
  { module_key: "workforce", via: "individual", organization_id: null, organization_name: null, org_role: null, entitlement_id: "e-u-1-workforce", plan_code: "wf_single_license", plan_name: "Single site", seats: null, status: "active", source: "license", valid_until: null },
];

export const demoAdminOrgs: AdminOrgRow[] = [
  { id: "o-1", slug: "skyline-aerial", name: "Skyline Aerial Survey", status: "active", created_at: ago(60 * 24 * 40), members: [{ count: 4 }],
    entitlements: [{ id: "e-o1-wsso", user_id: null, organization_id: "o-1", module_key: "wsso", plan_id: P("wsso_growth_month").id, status: "trialing", source: "stripe", valid_until: ahead(9), plan: { name: "Growth", code: "wsso_growth_month", seats: 50 } }],
    links: [] },
  { id: "o-2", slug: "bell-ag", name: "Bell Ag Spraying", status: "active", created_at: ago(60 * 24 * 12), members: [{ count: 9 }],
    entitlements: [{ id: "e-o2-wsso", user_id: null, organization_id: "o-2", module_key: "wsso", plan_id: P("wsso_business_month").id, status: "active", source: "admin", valid_until: null, plan: { name: "Business", code: "wsso_business_month", seats: 150 } }],
    links: [] },
];

export const demoClients: OAuthClient[] = [];

export const demoReviewLinks: ReviewLink[] = [
  { id: "rl-1", user_id: "u-6", module_key: "directory", external_id: "141", external_account_id: null, status: "pending_review", link_method: "verified_email",
    last_error: null, last_synced_at: ago(55), review_reason: null, created_at: ago(55),
    profile: { omniforce_id: "OF-0009826", email: "lena@vogtmapping.example", first_name: "Lena", last_name: "Vogt" } },
];
