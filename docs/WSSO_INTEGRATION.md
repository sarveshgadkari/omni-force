# WSSO ↔ OmniForce

**Status (2026-10-14).** Both sides are built and pass their tests locally. Nothing is deployed or switched on yet: until the go-live steps below are done, WSSO sign-in through OmniForce is **not live**, and people keep using WSSO's own login.

## The flow

1. A person creates an account in OmniForce. They don't pay or pick a plan (`VITE_SELF_SERVE_BILLING` is off).
2. A platform admin gives them WSSO access: **Admin → Users → Grant** for one person, or **Admin → Organizations → Grant** for a team. In a team, owners and admins then give members WSSO seats on the organization page.
3. The person clicks **Open WSSO** on their OmniForce dashboard. OmniForce sends them to WSSO's `/auth/omniforce/start`, WSSO runs a normal OIDC sign-in (state, nonce, PKCE S256, client secret) and verifies the ES256 ID token.
4. On the first sign-in, WSSO creates what's needed:
   - **Personal access**: a workspace named "{first name}'s workspace". The person is its admin.
   - **Organization seat**: one workspace per OmniForce organization. The first owner or admin to open WSSO creates it and becomes its admin. Members who open WSSO later join it as employees. If a member arrives before an owner or admin has opened WSSO, they're asked to wait for one.
   - These workspaces have `billing_source = 'omniforce'`. WSSO never asks them to pay; plan and seats come from OmniForce.
5. WSSO starts its own Supabase session. It creates a one-time login token server-side and uses it immediately, so it is never emailed or shown to the browser. Then it reports the account back with `link_identity`, so OmniForce shows it as linked.
6. Afterwards, OmniForce's sync worker pushes access changes to WSSO as signed events.

## What stays in sync

| Change in OmniForce | Event to WSSO | Effect in WSSO |
|---|---|---|
| Personal WSSO access granted, changed or revoked | `access.updated` / `access.revoked` `{sub}` | Personal workspace active with plan and seats, or suspended |
| Organization's WSSO access granted, changed or revoked; organization disabled | `access.updated` / `access.revoked` `{omniforce_org_id, external_org_id}` | Team workspace active with plan and seats, or suspended |
| Seat given or removed; member suspended or removed | `member.enabled` / `member.disabled` `{sub, scope: organization}` | That person can or can't sign in, but only if their WSSO account is in that team's workspace |
| OmniForce account disabled | `member.disabled` `{sub, scope: account}` | Blocked from WSSO everywhere |
| OmniForce account re-enabled, or profile changed | Their personal state and their state in every organization, restated | Block lifted wherever they still have access |

Every event carries the current state, read when it's sent, so a repeat or a late retry can't undo a newer change. WSSO applies each `event_id` once. If applying fails, WSSO forgets that `event_id` so OmniForce's retry is processed. Workspaces billed by WSSO itself are never touched.

Signing is `X-OmniForce-Timestamp` plus `X-OmniForce-Signature = hex(HMAC-SHA256(secret, "{timestamp}.{body}"))`, with a 5-minute window.

Timing: a revoked workspace stops working immediately. A blocked person loses access when their WSSO session token next refreshes, within about an hour.

## Rules that protect accounts

- **The join key is the OmniForce ID (`sub`), never email.** If a WSSO account already uses the person's email, sign-in stops with "A WSSO account already uses this email". Nothing is merged automatically.
- **One WSSO account lives in one workspace.** Opening WSSO from a different context (personal versus an organization, or another organization) is refused with a clear message. It doesn't move the account.
- **Only an owner or admin can bind an organization to a workspace** (`integration_link_identity`). Members can only confirm the binding that already exists. An existing binding is never re-pointed.
- **People who sign in through OmniForce have no WSSO password.** WSSO's own customers and passwords are unchanged.
- In WSSO, signed-in users can't change the OmniForce columns. In an OmniForce-billed workspace they also can't change `status`, `seat_limit` or `plan`. A database trigger enforces both.

## Where the code is

**OmniForce (this repo)**
- `supabase/migrations/20261014000001_wsso_access_sync.sql`: queues seat, membership and organization-status changes, adds `org_module_access()`, and lets members confirm an existing workspace binding.
- `supabase/functions/_shared/provision.ts` `syncWsso()`, `supabase/functions/_shared/wsso.ts` `wssoEvent()`, and the dispatch in `supabase/functions/sync-worker`.
- Hub UI: `selfServeBilling()` in `apps/hub/src/lib/supabase.ts`.

**WSSO (`WSSO/`, its own git repository)**
- `supabase/migrations/20261014000001_omniforce_integration.sql` (also `saas/14_omniforce_integration.sql`).
- `src/lib/omniforce/`: config, OIDC client, account creation (`accounts.ts`), API calls, event signature check.
- `src/app/auth/omniforce/start`, `src/app/auth/omniforce/callback`, `src/app/api/omniforce/events`.
- Login page button and error messages. The billing page shows "Billed by Omni Force Vector", and checkout is refused for those workspaces.

**Tests**
- Hub: `npm test` covers the database (including `wsso_sync.test.mjs`) and the functions (including `wsso_sync_test.ts`, which checks the signed events end to end).
- WSSO: `npm run test:omniforce` (OIDC client, PKCE, ID token checks, state cookie, redirects, and signature compatibility with the hub) and `npm run typecheck`.

## Go-live runbook

Do these in order. Test with `testing` mode first, which limits sign-in to platform admins.

1. **WSSO database.** Run `supabase/migrations/20261014000001_omniforce_integration.sql` in WSSO's Supabase SQL editor.
2. **Hub database.** Run `supabase/migrations/20261014000001_wsso_access_sync.sql` in the hub's SQL editor.
3. **Register WSSO in the hub.** Go to **Admin → Applications → New**:
   - module: WSSO
   - redirect URI: `https://wsso.tlbisbig.world/auth/omniforce/callback`
   - initiate-login URI: `https://wsso.tlbisbig.world/auth/omniforce/start`

   Copy the client ID and secret. The secret is shown once.
4. **Generate one more secret** for events (at least 32 characters, e.g. `openssl rand -hex 32`).
5. **WSSO environment** (Vercel, or wherever WSSO runs). Then redeploy WSSO.
   ```
   OMNIFORCE_ISSUER=https://<hub-ref>.supabase.co/functions/v1/oidc
   OMNIFORCE_CLIENT_ID=ofc_…
   OMNIFORCE_CLIENT_SECRET=ofs_…
   OMNIFORCE_EVENTS_SECRET=<step 4>
   NEXT_PUBLIC_OMNIFORCE_HUB_URL=<hub URL>
   ```
6. **Hub function secrets.** Then redeploy `sync-worker`.
   ```
   supabase secrets set WSSO_EVENTS_URL=https://wsso.tlbisbig.world/api/omniforce/events WSSO_EVENTS_SECRET=<step 4>
   ```
7. **Test as a platform admin.** In **Admin → Applications**, set the client to `testing`. In **Admin → Integrations**, set WSSO sign-in to `testing`. Grant yourself WSSO, then click **Open WSSO** and check that the workspace and user are created. Revoke the grant, enable provisioning (next step), and check that the workspace is suspended.
8. **Turn it on.** Set the client to `enabled`, WSSO sign-in to `enabled`, and WSSO provisioning to `enabled`.

To pause everything, set WSSO sign-in back to `not_configured` and provisioning to `disabled`. Events already queued are dead-lettered, not sent.

## Not built yet

- **Connecting an existing WSSO account** (someone who already has a WSSO password) to OmniForce. Today they're told to keep using their WSSO password. Doing this safely needs a "Connect Omni Force Vector" button inside WSSO, used while they're signed in. Bulk imports would land as `pending_review` candidates.
- **One person in several WSSO workspaces** through OmniForce. WSSO profiles belong to a single workspace.
- **Events from WSSO back to OmniForce** (`wsso-webhook`). WSSO doesn't send any.
- **Self-serve purchase** of WSSO in OmniForce. The Stripe checkout is still there behind `VITE_SELF_SERVE_BILLING=1`, but the intended model is admin-granted access.
