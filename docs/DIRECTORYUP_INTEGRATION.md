# DirectoryUp (Drone Directory) integration

DirectoryUp runs on Brilliant Directories (BD). It is **not** on Supabase, and OmniForce never touches its database. Everything goes through BD's API and webhooks.

> **Status: nothing is verified or switched on.** In OmniForce the Directory module has `sso_status = not_configured` and `provisioning_status = disabled`. Members keep using their Directory login. Every item marked *unverified* below is an assumption that must be confirmed with the BD team before it's relied on.

## Sign-in (SSO)

**Not available, and the protocol is unverified.** OmniForce doesn't assume BD supports any particular SSO mechanism.

- An earlier draft of this document expected BD to build a custom `/omniforce/sso` endpoint that verified an OmniForce-pushed ticket. That ticket protocol has been removed from OmniForce, and no such endpoint exists.
- OmniForce now offers one standard interface: OpenID Connect authorization code + PKCE ([INTEGRATION_AUTH.md](INTEGRATION_AUTH.md)). Directory SSO becomes possible when **one** of these is confirmed:
  1. BD (or a BD plugin/add-on) can act as an **OIDC/OAuth 2.0 client** against a custom provider. *Unverified.*
  2. BD offers an API to **create a member login session or one-time login link** for a given member, which a small OmniForce-hosted relying-party service could call after completing the OIDC flow. *Unverified.*
  3. The BD team builds a custom endpoint that acts as an OIDC client (start + callback + server-side code exchange). *Requires BD custom development.*
- Until then, "Open Drone Directory" in the hub explains that sign-in isn't live and links to the Directory's own login.

## Provisioning (OmniForce → BD)

Implemented in `supabase/functions/_shared/directoryup.ts` and `provision.ts`, but **disabled**. It only runs when an admin sets Directory provisioning to `enabled` in Admin → Applications and SSO.

| Assumption (unverified) | Used for |
|---|---|
| BD REST API v2 at `DIRECTORYUP_API_BASE`, auth with `X-Api-Key` | all calls |
| `user/search` by custom field `omniforce_user_id`, `user/get` by email, `user/create`, `user/update` | find, create, update members |
| `active` = 2 (active) / 3 (inactive) | enable / disable |
| `subscription_id` values per plan (`plans.external_ref`) | plan mapping |
| a "not found" response is HTTP 404 or `status: "error"` with a "not found / no records" message | telling "no member" apart from "API failed" |

Safety rules built in:

- A transient API error never leads to creating a duplicate member. Only a confirmed "not found" does.
- A BD member carrying our `omniforce_user_id` is ours. A BD member that matches **only by email** becomes a `pending_review` candidate in Admin → Identity links. Nothing is written to BD for it until an admin approves.
- A BD member already tagged with a *different* OmniForce ID is a hard error, never overwritten.
- Nothing is provisioned for an OmniForce user whose email isn't verified.

## Webhooks (BD → OmniForce)

`directory-webhook` accepts BD events authenticated with `X-Webhook-Token` (`DIRECTORYUP_WEBHOOK_TOKEN`, at least 32 characters; the endpoint refuses everything if it's unset). It logs every event and only updates links that already exist; it never creates or re-points a link. The payload fields (`event`, `user_id`/`member_id`, `event_id`) are *unverified*.

## Plan mapping

Set real values in Admin → Plans → *Module mapping*, once BD supplies them:

| OmniForce plan | DirectoryUp subscription_id |
|---|---|
| Scout (free) | `BD_SUB_SCOUT` → replace |
| Recreational Pilot (free) | `BD_SUB_RECREATIONAL` → replace |
| Commercial Pilot | `BD_SUB_COMMERCIAL` → replace |
| Service Provider | `BD_SUB_PROVIDER` → replace |
| Vendor | `BD_SUB_VENDOR` → replace |
| Employer / Contractor | `BD_SUB_EMPLOYER` → replace |
| Directory + WSSO bundle | `BD_SUB_PROVIDER\|growth` (Directory part before the bar) |

## Questions for the BD team

1. Does BD support any standard SSO (OIDC/OAuth client, SAML SP) natively or through an add-on? If not, is there an API to create a login session or one-time login link for a member?
2. Exact API v2 endpoint names, field names, the `active` codes, and the "not found" response shape.
3. Can a custom member field `omniforce_user_id` be added and made unique and searchable?
4. Real `subscription_id` values for each plan.
5. Webhook events available, their payloads, and whether a custom header can be sent.
6. Can the API key be limited to member create/update/search?
