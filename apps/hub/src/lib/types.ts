export type ModuleKey = "directory" | "wsso" | "workforce";
export type AccountStatus = "active" | "disabled";
export type EntitlementStatus = "active" | "trialing" | "past_due" | "canceled";
export type EventStatus = "queued" | "sent" | "failed" | "dead" | "received" | "processed";

export type SsoStatus = "not_configured" | "testing" | "enabled";
export type OrgRole = "owner" | "admin" | "billing" | "member";

export interface Module {
  key: ModuleKey;
  name: string;
  deployment: "cloud" | "onprem";
  app_url: string | null;
  sso_status: SsoStatus;
  provisioning_status: "disabled" | "enabled";
  integration_notes: string | null;
  is_active: boolean;
  sort: number;
}

export interface Profile {
  id: string;
  omniforce_id: string;
  email: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  phone: string | null;
  status: AccountStatus;
  last_module: ModuleKey | null;
  default_module: ModuleKey;
  created_at: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  module_key: ModuleKey | null;
  bundle_modules: ModuleKey[];
  interval: "month" | "year" | "free" | "license";
  price_cents: number;
  currency: string;
  external_ref: string | null;
  seats: number | null;
  trial_days: number;
  is_public: boolean;
  is_active: boolean;
  stripe_price_id: string | null;
  audience: "any" | "individual" | "organization";
  sort: number;
}

export interface Entitlement {
  id: string;
  user_id: string | null;
  organization_id?: string | null;
  module_key: ModuleKey;
  plan_id: string | null;
  status: EntitlementStatus;
  source: "stripe" | "free" | "admin" | "license";
  valid_until: string | null;
  plan?: Pick<Plan, "name" | "code" | "seats"> | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  items: { plan: Plan; quantity: number }[];
}

export interface Invoice {
  id: string;
  number: string | null;
  amount_paid_cents: number;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
  created_at: string;
}

export interface IdentityLink {
  id: string;
  user_id: string;
  module_key: ModuleKey;
  external_id: string | null;
  external_account_id: string | null;
  status: "pending" | "pending_review" | "linked" | "error" | "disabled";
  link_method?: "provisioned" | "app_assertion" | "verified_email" | "admin" | "import" | null;
  last_error: string | null;
  last_synced_at: string | null;
}

export interface IntegrationEvent {
  id: number;
  direction: "outbound" | "inbound";
  module_key: ModuleKey;
  event_type: string;
  user_id: string | null;
  payload: Record<string, unknown>;
  status: EventStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
  user_label?: string;
}

export interface Installation {
  id: string;
  user_id: string;
  name: string;
  hostname: string | null;
  license_key_prefix: string;
  status: "pending" | "active" | "revoked";
  version: string | null;
  last_seen_at: string | null;
  created_at: string;
  owner_label?: string;
}

export interface AuditEntry {
  id: number;
  actor_label: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
}

export interface AdminStats {
  users: number;
  active_users: number;
  paying_users: number;
  mrr_cents: number;
  by_module: Partial<Record<ModuleKey, number>>;
  queue_failed: number;
  queue_pending: number;
  installations: number;
  organizations?: number;
  links_to_review?: number;
}

export interface AdminUserRow extends Profile {
  entitlements: Entitlement[];
  links: IdentityLink[];
}

/** Effective access to a module: own entitlement, or a seat in an organization. */
export interface ModuleAccess {
  module_key: ModuleKey;
  via: "individual" | "organization";
  organization_id: string | null;
  organization_name: string | null;
  org_role: OrgRole | null;
  entitlement_id: string;
  plan_code: string | null;
  plan_name: string | null;
  seats: number | null;
  status: EntitlementStatus;
  source: Entitlement["source"];
  valid_until: string | null;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  status: AccountStatus;
  role: OrgRole;
  member_count: number;
  created_at: string;
}

export interface OrgMember {
  user_id: string;
  omniforce_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: OrgRole;
  status: "active" | "suspended";
  joined_at: string;
  modules: ModuleKey[];
}

export interface OrgInvitation {
  id: string;
  email: string;
  role: OrgRole;
  created_at: string;
  expires_at: string;
  invited_by_name: string;
}

export interface OrgModule {
  module_key: ModuleKey;
  entitlement_id: string;
  plan_name: string | null;
  plan_code: string | null;
  seats: number | null;
  seats_used: number;
  status: EntitlementStatus;
  source: Entitlement["source"];
  valid_until: string | null;
  live: boolean;
}

export interface OAuthClient {
  client_id: string;
  module_key: ModuleKey;
  name: string;
  environment: "production" | "staging" | "development";
  status: "disabled" | "testing" | "enabled";
  secret_hint: string | null;
  redirect_uris: string[];
  initiate_login_uri: string | null;
  allowed_scopes: string[];
  created_at: string;
}

export interface AdminOrgRow {
  id: string;
  slug: string;
  name: string;
  status: AccountStatus;
  created_at: string;
  members: { count: number }[];
  entitlements: Entitlement[];
  links: { id: string; module_key: ModuleKey; external_org_id: string; status: string; link_method: string }[];
}

export interface ReviewLink extends IdentityLink {
  review_reason: string | null;
  created_at: string;
  profile: Pick<Profile, "omniforce_id" | "email" | "first_name" | "last_name"> | null;
}

/** sso-launch result: a URL to open, or the module's own sign-in when SSO isn't available. */
export type LaunchResult = { url: string } | { unavailable: true; app_url: string | null; message: string };
