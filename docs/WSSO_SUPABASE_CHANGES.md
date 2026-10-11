# WSSO Supabase changes for OmniForce (superseded draft)

> **Superseded.** This was written before the organization model and the OIDC sign-in interface. It assumes the wrong WSSO tables (`users`/`companies` instead of `profiles`/`organizations`), a pushed-ticket sign-in that OmniForce no longer issues, and linking by email, which is now forbidden. Nothing here was applied. Use [WSSO_INTEGRATION.md](WSSO_INTEGRATION.md) and [INTEGRATION_AUTH.md](INTEGRATION_AUTH.md) instead.

WSSO keeps its own Supabase project, its own data and its own Auth. OmniForce becomes the place where people **sign up, pay and get access**. WSSO trusts OmniForce for identity and plan, and reports member changes back.

> Table names below assume WSSO uses `companies`, `users` (id = `auth.users.id`) and `roles`.
> Confirm against the real WSSO schema before running anything. Nothing was applied to any Supabase project.

## Summary of changes

| # | Change | Where | Why |
|---|--------|-------|-----|
| 1 | Add `omniforce_user_id` (unique), `auth_source`, `omniforce_linked_at` to `users` | migration | Permanent mapping OF-ID ⇄ WSSO user. Email is never the key. |
| 2 | Add `billing_source`, `omniforce_owner_id`, `omniforce_plan_code`, `omniforce_seat_limit`, `omniforce_status`, `omniforce_valid_until` to `companies` | migration | Workspaces paid through OmniForce get their plan and seats from OmniForce instead of WSSO Stripe. |
| 3 | New `omniforce_sso_nonces` table | migration | Each SSO ticket works once (replay protection). |
| 4 | New `omniforce_inbox` table | migration | Provisioning calls are idempotent; retries never double-create. |
| 5 | New `omniforce_outbox` table + triggers on `users` | migration | Member created/updated/role changed/deleted and seat usage are sent back to OmniForce. |
| 6 | Guard triggers on `users` / `companies` | migration | Signed-in users can't edit the OmniForce fields or OmniForce-managed billing. |
| 7 | `company_has_access(company_id)` function | migration | One access check covering OmniForce-billed and WSSO-billed workspaces. Use it in route guards and RLS. |
| 8 | Seat-limit trigger | migration | Blocks activating more members than the OmniForce plan allows. |
| 9 | pg_cron jobs | migration | Send the outbox every minute; clear old nonces daily. |
| 10 | Edge function `omniforce-sso` | functions | Verifies the OmniForce ticket (ES256, JWKS, aud=`wsso`, 60s, single use), finds/links/creates the user, returns a one-time token to start a normal WSSO session. |
| 11 | Edge function `omniforce-provision` | functions | OmniForce creates/updates/disables members and sets plan + seats. HMAC-signed, idempotent. |
| 12 | Edge function `omniforce-events` | functions | Delivers the outbox to OmniForce with retries and backoff. |
| 13 | Route `/sso/omniforce` | frontend | Receives the ticket, calls `omniforce-sso`, then `verifyOtp`. |
| 14 | `<OmniForceSwitcher />` in the header | frontend | Switch to Directory / Workforce 2.0 without signing in again. |
| 15 | Sign-up, sign-in, billing and sign-out screens | frontend | Send new sign-ups and billing to OmniForce. Keep invites and local logins working. |

## What stays the same

- All WSSO business data: time and attendance, work orders and TACTICs, people and CRM, training, documents and reports.
- WSSO roles (admin, director, manager, employee) and RLS. OmniForce only creates the owner as workspace admin; the owner invites employees inside WSSO as today.
- Existing WSSO customers on WSSO Stripe keep `billing_source = 'wsso'` until they move.
- The WSSO "Connect AI" MCP connection.

## Sign-in flow

```
User clicks WSSO in OmniForce
  → hub sso-launch: checks entitlement, provisions if needed, signs ticket (ES256, aud=wsso, 60s, jti)
  → https://wsso.tlbisbig.world/sso/omniforce?ticket=…
  → WSSO page strips ticket from URL, POSTs it to omniforce-sso
  → omniforce-sso: verify via hub JWKS → store jti → find user by omniforce_user_id
       (else link existing user by verified email, else create auth user + workspace + users row)
     → auth.admin.generateLink(magiclink) → returns hashed_token
  → browser: supabase.auth.verifyOtp({ type: "magiclink", token_hash }) → normal WSSO session
```

## Provisioning and events

| Direction | Call | Signed with |
|---|---|---|
| OmniForce → WSSO | `POST /functions/v1/omniforce-provision` `{ action: upsert_member \| disable_member \| enable_member, … }` | `X-OmniForce-Timestamp` + `X-OmniForce-Signature` = HMAC-SHA256(`ts.body`) |
| WSSO → OmniForce | `POST <hub>/functions/v1/wsso-webhook` `{ event, event_id, omniforce_user_id, … }` | same HMAC, same shared secret |

Events WSSO sends: `member.created`, `member.updated`, `member.role_changed`, `member.deleted`, `seats.changed`.

## Secrets to set in WSSO

```
OMNIFORCE_JWKS_URL       https://<hub-ref>.supabase.co/functions/v1/sso-jwks
OMNIFORCE_ISSUER         https://account.omniforce.app
OMNIFORCE_SHARED_SECRET  (same as WSSO_SHARED_SECRET in the hub)
OMNIFORCE_WEBHOOK_URL    https://<hub-ref>.supabase.co/functions/v1/wsso-webhook
WSSO_APP_ORIGIN          https://wsso.tlbisbig.world
CRON_SECRET              random
```

## Rollout order

1. Back up WSSO. Apply `wsso-changes/migrations/20261009_omniforce_integration.sql` on a **branch** first.
2. Deploy `omniforce-sso`, `omniforce-provision`, `omniforce-events` with `--no-verify-jwt`.
3. Add `/sso/omniforce` and the switcher. Test with a staging hub.
4. Turn on the "Continue with OmniForce" button, then move new sign-ups to OmniForce.
5. Migrate existing WSSO-billed workspaces one by one (set `billing_source = 'omniforce'` after their OmniForce subscription is active, then cancel the WSSO Stripe subscription).

## Open questions for the WSSO team

- Exact table and column names for workspaces, users and roles.
- How a new workspace seeds its default roles (the code looks for a role named `admin`).
- Whether one person can belong to more than one WSSO workspace. If yes, the ticket needs a `workspace` claim and a picker.
- Current WSSO Stripe price IDs, to map existing subscribers to OmniForce plans.
