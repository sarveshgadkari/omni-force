# OmniForce architecture: identity, organizations, access

OmniForce is the central platform for identity, sign-in, organizations, memberships, module access, subscriptions, payments and platform administration. The modules (WSSO, the Drone Directory, Workforce 2.0) keep their own data and their own in-app permissions.

**Status (2026-10-24).** The hub's data model, access rules and authentication interface are built and tested locally. DirectoryUp token SSO and member provisioning are implemented on the OmniForce side ([DIRECTORYUP_INTEGRATION.md](DIRECTORYUP_INTEGRATION.md)); an administrator still has to switch Directory sign-in and provisioning on. WSSO's contract is drafted ([WSSO_INTEGRATION.md](WSSO_INTEGRATION.md)). **Single sign-on to WSSO is not live.** Both modules still *start* with `sso_status = not_configured` and `provisioning_status = disabled`.

## 1. Who is who

| Concept | Table | Notes |
|---|---|---|
| Person | `auth.users` + `profiles` | One Supabase Auth user per person. `profiles.omniforce_id` (`OF-0001000`…) is the permanent public ID, used as `sub` in tokens. Email is never a key. |
| Individual account | (a profile with no organization) | Every user is an individual account. Nothing needs to change for people who never join an organization. |
| Organization | `organizations` | A customer company or team. Has its own Stripe customer and its own subscriptions. |
| Membership | `organization_members` | One row per person per organization, with one explicit role. |
| Invitation | `organization_invitations` | Single-use, 7-day link, stored hashed. It can only be accepted by a signed-in user whose **verified** email equals the invited address. |
| Platform admin | `platform_admins` | OmniForce staff. Separate from organization roles. |

### Organization roles

Roles are explicit, and there's no inheritance beyond this table:

| Role | Can |
|---|---|
| `owner` | Everything, including billing and managing other owners. There's always at least one active owner (enforced by a trigger). |
| `admin` | Members, invitations, module seats and organization settings. Can't touch owners or billing. |
| `billing` | Subscriptions, checkout, invoices and payment methods. |
| `member` | Uses the modules they hold a seat for. |

All changes go through SQL functions (`create_organization`, `create_org_invitation`, `accept_org_invitation`, `set_org_member_role`, `remove_org_member`, `assign_org_module_seat`, …). Each one checks the caller's role and writes an `audit_log` row. Row-level security blocks direct table writes.

## 2. Module access (OmniForce is the source of truth)

OmniForce decides **who may enter a module**. Each module still decides **what they can do inside it** (its own roles and resource permissions). OmniForce never sends module-internal roles.

- An **entitlement** grants one module to exactly one owner: a user (`user_id`) *or* an organization (`organization_id`). Sources: `stripe`, `free`, `admin`, `license`.
- A **seat** (`organization_module_seats`) lets one member use one of the organization's modules. An organization entitlement on its own grants nobody access. When an organization first gets a module, its owners are seated automatically, within the seat limit. Everyone else is seated explicitly by an owner or admin.
- **Effective access** is computed in one place, `module_access_for(user)`. A user has access if their profile is active and either:
  - they have their own *live* entitlement for the module, or
  - they are an active member of an active organization that has a *live* entitlement for the module, **and** they hold a seat for it.
- *Live* means status `active`, `trialing` or `past_due`, and `valid_until` hasn't passed. Stripe grants get 7 days of grace past the period end, in case a renewal webhook is late.

Everything reads access through this function: the hub UI (`my_module_access`), smart redirect, the sign-in interface (`oauth_issue_code`, `oauth_claims`), the app access-check API (`integration_access`) and Workforce licence creation.

### Billing

- An individual pays as before, with the Stripe customer on `profiles`.
- An organization has its own Stripe customer (`organizations.stripe_customer_id`). Only `owner` and `billing` members can start checkout or open the portal for it. The webhook resolves ownership from the Stripe customer, and recomputes either `recompute_entitlements(user)` or `recompute_org_entitlements(org)`.
- `plans.audience` (`any` | `individual` | `organization`) restricts who may hold a plan. Every plan is seeded as `any`, so current checkout keeps working.

## 3. Identity mapping to module accounts

`identity_links` maps an OmniForce user to their account in a module. `organization_links` maps an OmniForce organization to a module's own organization or workspace. The rules are enforced in `record_identity_link` / `record_organization_link`:

1. **No duplicates in either direction.** An OmniForce user maps to at most one account per module, and each module account maps to at most one OmniForce user. The same applies to organizations.
2. **A link is `linked` only with proof:**
   - `provisioned`: OmniForce created the account.
   - `app_assertion`: the module bound its account to a user who had just signed in through OmniForce.
   - `admin`: a platform admin linked it, with a reason recorded in the audit log.
3. **An email match never links anything.** `verified_email` and `import` only create a `pending_review` candidate. A candidate grants nothing, isn't sent in tokens, and waits in Admin → Identity links.
4. **A proven link is never silently re-pointed.** A conflict is an error for an admin to resolve.
5. **Inbound webhooks only update existing links.** They never create or move one.

## 4. Authentication interface for module applications

See [INTEGRATION_AUTH.md](INTEGRATION_AUTH.md) for the full contract. In short:

- OmniForce exposes an **OpenID Connect-shaped provider**: authorization code flow, **mandatory PKCE (S256)**, confidential clients, ES256-signed ID tokens, userinfo, discovery and JWKS (the `oidc` edge function).
- Applications are registered as **clients** (`oauth_clients`): exact redirect URIs, hashed secrets, 24-hour overlap when a secret is rotated, and status `disabled` → `testing` (platform admins only) → `enabled`.
- **"Open module" in the hub is per product.** Directory uses a DirectoryUp login token: the hub fetches `include_user_token=1` and sends the browser to `/login/token/{token}` (no OAuth client). WSSO uses OIDC third-party-initiated login: the hub sends the browser to the app's `initiate_login_uri`, and the app then starts a normal authorization request with its own `state` and PKCE. No OmniForce credential travels in that WSSO URL. This replaces the earlier design, which pushed a signed ticket into the module. WSSO never implemented that ticket, so it was removed rather than kept as an unused bearer-credential path.
- A server-to-server **integration API** (`check_access`, `link_identity`) lets an app back end ask OmniForce for central access, and report which of its own accounts a just-signed-in user was bound to.

## 5. Decisions that affect the future WSSO integration

These are the choices that WSSO's integration will have to fit. Each can be revisited, but changing one later means changing both sides.

1. **WSSO stays a separate Supabase project with its own Auth.** OmniForce doesn't try to share `auth.users` across projects. WSSO keeps creating its own sessions; OmniForce only proves who the person is and what access they have. The expected shape is a WSSO edge function that exchanges the code, then mints a WSSO session for the matched profile. If WSSO's Supabase Auth turns out to support a custom OIDC provider by integration time, that's an alternative worth checking. It isn't assumed here.
2. **The join key is `sub` = OmniForce ID, never email.** WSSO will need a place to store it on its `profiles` row (a new column, or a mapping table in WSSO). Until then, the mapping lives only in OmniForce `identity_links.external_id` = WSSO `profiles.id`.
3. **An existing WSSO user is linked by proving control of both accounts.** The user is signed in to WSSO, clicks "Connect OmniForce", completes OmniForce sign-in, and WSSO calls `link_identity`. An email match is at most a review candidate. Bulk imports would also land as `pending_review`, and need either per-user confirmation or an admin decision.
4. **WSSO `organizations` map 1:1 to OmniForce organizations** through `organization_links`. Only an OmniForce `owner`/`admin` who signed in with that organization can bind it, and WSSO should only send `external_org_id` when the local user is an admin of that WSSO organization.
5. **One WSSO organization per sign-in.** A person in several organizations picks one at OmniForce. The token carries that one `org`, with its WSSO `external_id` once linked. If WSSO lets one profile belong to many organizations, WSSO switches organization by starting a new sign-in.
6. **Seats in OmniForce are an upper bound for OmniForce-authorized users.** OmniForce enforces `assigned seats ≤ plan seats` for people it lets in. WSSO still counts its own active users, including any local-login users, against `omniforce_access.seats`.
7. **Roles don't cross over.** An OmniForce `owner`/`admin` is not automatically a WSSO admin. WSSO decides in-app roles. The token only says the person may enter, and their OmniForce organization role, for display or first-time bootstrap.
8. **Billing moves organization by organization.** A WSSO organization billed by WSSO's own Stripe today stays that way until it's linked and has an OmniForce subscription. WSSO needs its own flag for that cut-over. No WSSO billing was changed in this phase.
9. **WSSO creates accounts itself; OmniForce only syncs access.** WSSO creates the workspace and user on first sign-in, so OmniForce never creates WSSO accounts. Once provisioning is enabled, the sync worker sends WSSO signed events that restate current access: workspace plan and seats, and members enabled or blocked. The Directory still has no organization handler; those events are dead-lettered.

**As built for WSSO (2026-10-14):** decisions 1, 2, 4 to 8 hold as written. The join key is a new `profiles.omniforce_user_id` column in WSSO. Workspaces created through OmniForce are flagged `billing_source = 'omniforce'`. Decision 3 (connecting an existing WSSO account) isn't built: a matching email is refused, never merged.

## 6. Where things live

```
supabase/migrations/20261009000001_omniforce_core.sql      original schema (unchanged)
supabase/migrations/20261009000002_cron_sync.sql            extensions only (schedule moved to supabase/setup/)
supabase/migrations/20261010000001_organizations.sql        organizations, roles, invitations, seats
supabase/migrations/20261010000002_access_model.sql         entitlement ownership, effective access, recompute, sync gates
supabase/migrations/20261010000003_identity_links.sql       linking rules, organization links, admin review
supabase/migrations/20261010000004_integration_auth.sql     clients, codes, claims, launch, integration API
supabase/migrations/20261024000001_directoryup_token_sso.sql Directory plan IDs, token SSO launch, Directory enable without OAuth client
supabase/functions/oidc/                                    discovery, jwks, authorize (hub), token, userinfo
supabase/functions/sso-launch/                              Open module: Directory token SSO or WSSO initiate_login_uri
supabase/functions/integration-api/                         check_access, link_identity
supabase/tests/db/                                          PGlite tests for every rule above
supabase/tests/functions/                                   Deno unit tests + end-to-end sign-in contract test
```
