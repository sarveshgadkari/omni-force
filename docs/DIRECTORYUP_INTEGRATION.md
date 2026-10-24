# DirectoryUp (Drone Directory) integration

DirectoryUp runs on Brilliant Directories (BD). OmniForce never touches its database. Everything goes through BD's API.

**Status (2026-10-24).** The DirectoryUp-side SSO is tested and active. OmniForce implements that contract:

1. Provision a member on signup (`user/create`, then `users_meta/create`).
2. Open the Directory with a one-time login token (`user/get/{id}?include_user_token=1` → `/login/token/{token}`).

Directory sign-in and provisioning still **start switched off**. An OmniForce administrator turns them on in **Admin → Applications** after `DIRECTORYUP_API_KEY` is set. WSSO is unrelated and remains not configured.

Site origin: `https://drones-drones-drones.directoryup.com`  
API base: `https://drones-drones-drones.directoryup.com/api/v2`

## Sign-in (SSO)

Not OIDC. When a entitled user clicks **Open Drone Directory**:

1. `sso-launch` checks entitlement and `modules.sso_status` (`testing` = platform admins only, `enabled` = everyone with access).
2. If there is no `identity_links` row, it runs Directory provisioning (requires provisioning enabled).
3. GET `/api/v2/user/get/{directory_user_id}?include_user_token=1` with `X-Api-Key`.
4. Redirect the browser to `https://drones-drones-drones.directoryup.com/login/token/{token}`.

No OAuth client is registered for Directory. `admin_set_module_integration('directory', 'enabled', …)` is allowed without one.

Until sign-in is switched on, the hub explains that SSO isn't live and links to the Directory's own login.

## Provisioning (OmniForce → BD)

Implemented in `supabase/functions/_shared/directoryup.ts` and `provision.ts`. It only runs when an admin sets Directory provisioning to `enabled`.

All **POST** bodies are `application/x-www-form-urlencoded`, not JSON.

| Step | Method | Path | Body |
|---|---|---|---|
| Create member | POST | `/api/v2/user/create` | `email`, `password` (random, never stored), `first_name`, `last_name`, `subscription_id` |
| Map OmniForce ID | POST | `/api/v2/users_meta/create` | `database=users_data&database_id={user_id}&key=omniforce_user_id&value={omniforce_id}` |

Capture `user_id` from the create response, then use it as `database_id`. Two calls per new member.

Safety rules:

- A transient API error never leads to creating a duplicate member. Only a confirmed "not found" does.
- A BD member carrying our `omniforce_user_id` is ours.
- A BD member that matches **only by email** becomes a `pending_review` candidate in Admin → Identity links. Nothing is written to BD for it until an admin approves.
- A BD member already tagged with a *different* OmniForce ID is a hard error, never overwritten.
- Nothing is provisioned for an OmniForce user whose email isn't verified.

## API key permissions

In Brilliant Directories, the OmniForce key needs:

- Users (`users_data`): GET, POST, PUT
- User Metadata (`users_meta`): GET, POST, PUT (Advanced Endpoints)
- Sensitive Data: **Include User Token**

Verify with GET `/api/v2/token/verify`.

## Plan mapping (`subscription_id`)

| OmniForce plan | DirectoryUp `subscription_id` | DirectoryUp name |
|---|---|---|
| Scout | `1` | Scout (free) |
| Recreational Pilot | `6` | Recreational / General User Account (free) |
| Commercial Pilot | `3` | Standard (paid) |
| Service Provider | `2` | Provider (paid) |
| Vendor | `5` | Pro |
| Employer / Contractor | `5` | Pro (no separate ID was supplied) |
| Directory + WSSO bundle | `2` (Directory part) | Provider |

`plans.external_ref` holds these values. The bundle uses `2|growth` (Directory part before the bar).

## Webhooks (BD → OmniForce)

`directory-webhook` accepts BD events authenticated with `X-Webhook-Token` (`DIRECTORYUP_WEBHOOK_TOKEN`, at least 32 characters; the endpoint refuses everything if it's unset). It logs every event and only updates links that already exist; it never creates or re-points a link.

## Secrets

See `supabase/functions/.env.example`:

- `DIRECTORYUP_API_BASE`
- `DIRECTORYUP_API_KEY`
- `DIRECTORYUP_SITE_ORIGIN`
- `DIRECTORYUP_FREE_SUBSCRIPTION_ID` (fallback Scout = `1`)
- `DIRECTORYUP_WEBHOOK_TOKEN`

## Rollout

1. Put the API key in function secrets.
2. Admin → Applications: Directory **provisioning = enabled**.
3. Confirm a new verified signup creates a Directory member and an `identity_links` row.
4. Admin → Applications: Directory **sign-in = testing**, then open the Directory as a platform admin.
5. Set sign-in to **enabled** when that path is confirmed.

To pause: set Directory sign-in back to `not_configured` and provisioning to `disabled`.
