# Sign in with OmniForce: contract for module applications

For teams building "Sign in with OmniForce" into a module that uses OIDC (WSSO, future apps). OmniForce acts as an OpenID Connect-shaped provider. It uses only standard pieces, so any OIDC/OAuth 2.0 client library that supports PKCE should work.

The Drone Directory does **not** use this contract. It uses a DirectoryUp login token. See [DIRECTORYUP_INTEGRATION.md](DIRECTORYUP_INTEGRATION.md).

> **Status:** the OmniForce OIDC side is built and tested locally (`npm test` at the repo root). WSSO has not built its side, so no WSSO client is registered and WSSO SSO stays `not_configured`. Directory token SSO is implemented on the OmniForce side and still starts `not_configured` until an administrator switches it on. Don't present SSO to users as available until the module is switched on (see Rollout).

## Endpoints

`<ISSUER>` is the `SSO_ISSUER` secret: the public URL of the `oidc` function, e.g. `https://<hub-ref>.supabase.co/functions/v1/oidc`, or a custom domain that proxies it.

| | URL |
|---|---|
| Discovery | `GET <ISSUER>/.well-known/openid-configuration` |
| Authorization (browser) | `https://<hub origin>/oauth/authorize` (the hub page; listed in discovery) |
| Token | `POST <ISSUER>/token` |
| UserInfo | `GET <ISSUER>/userinfo` |
| JWKS | `GET <ISSUER>/jwks` (also `…/functions/v1/sso-jwks`) |
| App back-end API | `POST https://<hub-ref>.supabase.co/functions/v1/integration-api` |

Supported: `response_type=code`, `grant_type=authorization_code`, `code_challenge_method=S256` (**required**), `client_secret_basic` / `client_secret_post`, ID tokens signed **ES256** with a `kid`, and the RFC 9207 `iss` parameter on the authorization response. Not supported: implicit or hybrid flows, refresh tokens, `request` objects, dynamic registration.

## Registering an application

A platform admin registers it in Admin → Applications and SSO, with:

- **Redirect URIs**: exact match, `https://` only (`http://localhost` allowed for development), no fragments.
- **Initiate-login URI**: where "Open module" in OmniForce sends the browser, e.g. `https://wsso.example.com/auth/omniforce/start`.

The admin receives `client_id` and a `client_secret` once. The secret is stored as a SHA-256 hash only. Rotating it keeps the previous secret valid for 24 hours. A new client starts `disabled`; `testing` lets only platform admins sign in; `enabled` opens it to everyone with access.

## Flow

```
User clicks "Open WSSO" in OmniForce
  → hub sso-launch returns   <initiate_login_uri>?iss=<ISSUER>&login_hint=<OF-ID>[&target_link_uri=…]
  → app /auth/omniforce/start: check iss == expected issuer; create state, nonce, PKCE verifier (store server-side or in a signed, HttpOnly cookie)
  → 302 https://<hub>/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&scope=openid profile email organizations entitlements
                                     &state=…&nonce=…&code_challenge=…&code_challenge_method=S256[&login_hint=…]
  → OmniForce: user signs in if needed, picks an organization if their access is through one,
               OmniForce checks the account is active, the email is verified and they have access to this module
  → 302 <redirect_uri>?code=…&state=…&iss=<ISSUER>      (code: single use, 60 seconds)
  → app back end: verify state and iss; POST <ISSUER>/token with code, redirect_uri, code_verifier + client auth
  → { id_token, access_token (5 min), token_type, expires_in, scope }
  → app: verify id_token (JWKS, iss, aud = client_id, exp, nonce), find/link the local user by `sub`, start the app's own session
```

People can also start at the app ("Sign in with OmniForce" button). That is the same flow without the first two steps.

**Errors.** If `client_id` or `redirect_uri` is wrong, OmniForce shows the error itself and never redirects. Other failures come back to the redirect URI as `error`, `error_description`, `state` and `iss`: `access_denied` (no plan, disabled account, SSO not on), `invalid_scope` or `invalid_request` (missing PKCE). The token endpoint returns RFC 6749 errors: `invalid_client` (401), `invalid_grant`.

**Code safety.** A code is marked used before any check runs, so a failed exchange (wrong verifier, wrong client) also burns it, and replays are written to the audit log. Access is checked again at exchange time.

## ID token claims

| Claim | Scope | Notes |
|---|---|---|
| `iss`, `aud` (= client_id), `azp`, `exp` (5 min), `iat`, `jti` | always | |
| `sub` | always | OmniForce ID, e.g. `OF-0001234`. **The only key to store and match on.** Never match on email. |
| `nonce`, `auth_time` | when available | |
| `name`, `given_name`, `family_name`, `updated_at` | `profile` | |
| `email`, `email_verified` | `email` | Informational; can change over time. |
| `org` | `organizations` | Only when the sign-in is in an organization context: `{ id, slug, name, role, external_id }`. `role` is the OmniForce organization role, **not** an app role. `external_id` is the app's own organization id once linked, else `null`. |
| `omniforce_access` | `entitlements` | `{ module, via: "individual" \| "organization", status, plan, plan_ref, seats, valid_until }`. `plan_ref` is the module-specific plan code (e.g. WSSO `growth`). |
| `module_user_id` | always | The app's own user id for this person, once linked; else `null`. |

`/userinfo` returns the same claims, rebuilt at request time. A disabled account or removed access gets `401 invalid_token`.

## App back-end API (`integration-api`)

Authenticate with HTTP Basic `client_id:client_secret`.

**`{ "action": "check_access", "sub": "OF-…", "external_org_id": "…?" }`**
Returns `{ active, via, status, plan, plan_ref, seats, seats_assigned, valid_until }`, or `{ active: false, reason }`. Call it on session refresh, or before seat-limited actions. OmniForce answers *may this person use your module (in this organization)*; the app still decides what they can do.

**`{ "action": "link_identity", "sub": "OF-…", "external_user_id": "<your user id>", "external_org_id": "<your org id>?" }`**
Tell OmniForce which of *your* accounts this person was bound to. Accepted only within **15 minutes** of that person completing an OmniForce sign-in to **your** client. Returns `409` on a conflict: the account is already linked to someone else, or the user is already linked to a different account. Conflicts are never overwritten. `external_org_id` is accepted only if the person is `owner`/`admin` of the OmniForce organization they signed in with. Only send it when the local user is an admin of that organization in your app.

### How the app should bind accounts (prevents takeovers and duplicates)

1. If a local user already stores this `sub`, sign them in.
2. If not, and the person is **already signed in locally** (e.g. clicked "Connect OmniForce" in settings): bind that local user to `sub`, then call `link_identity`.
3. Otherwise **do not** auto-merge with a local user who has the same email. Either create a new local user for this `sub`, or ask the person to sign in with their existing local login first, then connect. Never auto-link by email.

## Rollout for a module

1. The module team builds the start, callback and token-exchange routes against a **staging** client.
2. A platform admin registers the staging client, sets it to `testing`, and sets the module's sign-in to `testing`. Only platform admins can now sign in.
3. Test the flow end to end, including: wrong `state`, replayed code, an expired code, a user without access, a disabled user, the organization picker, and account linking.
4. Register the production client and enable it. Set the module's sign-in to `enabled` (refused unless an enabled client exists, except Directory which uses a login token and needs no client). The hub's "Open module" then starts working.
5. Provisioning (OmniForce pushing accounts into the module) is a separate switch. Leave it off until that API contract is also verified. Directory provisioning must be on for new members to exist before token SSO can log them in.

## Signing keys

`SSO_PRIVATE_JWK` is an ES256 private JWK with a `kid`; generate it with `node scripts/gen-sso-key.mjs`. To rotate:

1. Generate a new key.
2. Put the old **public** JWK into `SSO_PREVIOUS_PUBLIC_JWKS` (a JSON array), and the new private key into `SSO_PRIVATE_JWK`.
3. Deploy.
4. After at least 10 minutes (the longest token lifetime, plus JWKS caching), remove the old key.

Apps should cache JWKS for no more than 5 minutes, and refetch on an unknown `kid`.
