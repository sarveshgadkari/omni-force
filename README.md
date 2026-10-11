# OmniForce

The central platform for **identity, sign-in, organizations, memberships, module access, subscriptions, payments and platform administration** across the **Drone Directory** (DirectoryUp), **WSSO** and **Workforce 2.0** (on-premise).

```
apps/landing        Next.js public landing page
apps/hub            React + Vite account hub (accounts, organizations, plans, module access, admin console)
supabase/           OmniForce hub Supabase project: migrations, seed, edge functions, tests
docs/               ARCHITECTURE.md (start here), INTEGRATION_AUTH.md, WSSO_INTEGRATION.md, DIRECTORYUP_INTEGRATION.md
scripts/            gen-sso-key.mjs (ES256 signing key)
wsso-changes/       superseded early draft for WSSO; do not apply (see its README)
```

## Status

| Area | State |
|---|---|
| Accounts, email OTP, OmniForce ID | Built |
| Organizations, roles, invitations, module seats | Built and tested |
| Central module access (individual + organization) | Built and tested |
| Stripe billing for individuals and organizations | Built; needs Stripe prices and a webhook |
| Identity / organization link model and admin review | Built and tested |
| "Sign in with OmniForce" interface for apps (OIDC code + PKCE) | Built and tested locally; **no app is registered** |
| **WSSO single sign-on** | **Not live.** WSSO hasn't built its side; nothing changed in WSSO |
| **Drone Directory single sign-on** | **Not live.** BD's SSO capability is unverified |
| Provisioning to WSSO / Directory | Code present, **disabled**; contracts unverified |
| Workforce 2.0 licences + MCP | Built (unchanged) |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the model, and the decisions that affect the WSSO integration.

## Test locally

No Docker or Supabase CLI is needed. The database tests run every migration in PGlite (Postgres compiled to WASM).

```bash
npm install                 # repo root: PGlite + Deno test tooling
npm test                    # DB rules (node --test) + edge function unit and end-to-end tests (deno)
npm run check:functions     # type-check every edge function

cd apps/hub && npm install && npm test && npm run build     # hub smoke tests (demo mode) + build
cd apps/landing && npm install && npm run build
```

Run the hub with demo data (no backend): `cd apps/hub && npm run dev` → http://localhost:5173

## Set up the hub Supabase project

```bash
supabase link --project-ref <hub-ref>
supabase db push                                  # migrations
psql "$DB_URL" -f supabase/seed.sql               # plan catalogue
node scripts/gen-sso-key.mjs                      # → SSO_PRIVATE_JWK
cp supabase/functions/.env.example supabase/functions/.env   # fill in; secrets ≥ 32 chars
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy                         # config.toml marks webhook/OIDC/MCP functions as no-verify-jwt
psql "$DB_URL" -f supabase/setup/schedule-sync-worker.sql    # after editing its two placeholders
```

Then:

- In Stripe, create prices, paste their IDs in Admin → Plans, and point a webhook at `/functions/v1/stripe-webhook`.
- In Auth → Email templates → Confirm signup, use `{{ .Token }}` so users get a 6-digit code.
- Add the hub's `/oauth/authorize` and `/invite/*` routes to your static host's SPA fallback.
- Add platform admins after they sign up: `insert into platform_admins (user_id) select id from profiles where email = '…';`

## Before launch

- Replace draft prices (Directory paid plans, bundle) in `supabase/seed.sql` and `apps/landing/lib/site.ts`.
- Leave every module's SSO and provisioning switched off until that module's side is built and verified ([docs/INTEGRATION_AUTH.md](docs/INTEGRATION_AUTH.md) → Rollout).
