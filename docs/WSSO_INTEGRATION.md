# WSSO ↔ OmniForce: mapping design (not implemented on the WSSO side)

WSSO is a separate Supabase project with its own Auth, `profiles` and `organizations`. This phase made **no changes to WSSO** and ran **no WSSO migrations**. This document records how the OmniForce model maps onto WSSO, so the WSSO work can be planned against it. Table and column names on the WSSO side must be confirmed against the live WSSO schema; the WSSO schema wasn't available when this was written.

## Mapping

| OmniForce | WSSO (assumed) | How they connect |
|---|---|---|
| `profiles.omniforce_id` (`sub`) | `profiles.id` (= WSSO `auth.users.id`) | OmniForce `identity_links (module_key='wsso', external_id = WSSO profiles.id)`. WSSO will also need to store `sub` somewhere of its own (column or mapping table) to find the profile at sign-in. |
| `organizations.id` | `organizations.id` | OmniForce `organization_links (module_key='wsso', external_org_id = WSSO organizations.id)`, 1:1 both ways. |
| `organization_members.role` | WSSO's own membership roles | **Not mapped.** WSSO keeps its roles and resource permissions. The token carries the OmniForce role for information only. |
| Entitlement + seat (WSSO module) | (whatever WSSO uses for plan/seat checks) | Delivered in the token (`omniforce_access`) and through `check_access`. WSSO enforces its own seat counting. |

## How an existing WSSO user gets linked without duplication or takeover

1. The user signs in to WSSO the usual way.
2. They choose "Connect OmniForce". WSSO starts the OIDC flow (state, nonce, PKCE) and the user signs in to OmniForce.
3. WSSO exchanges the code and gets `sub`. Because the current WSSO session proves control of the WSSO profile, WSSO stores `sub` on that profile and calls `link_identity` with its `profiles.id`. If an organization admin connects inside a WSSO organization, they also send that organization's id.
4. From then on "Sign in with OmniForce" finds the WSSO profile by `sub`.

What must **not** happen: WSSO receiving an OmniForce sign-in for an unknown `sub` and attaching it to whichever WSSO profile has the same email. That would let anyone who registers that email at OmniForce, and verifies it, take over the WSSO account. It would also merge two different people who share an inbox. A new `sub` should create a new WSSO profile, or ask the person to sign in to their existing WSSO account first and connect from there.

### Bulk migration of existing WSSO organizations (later)

If WSSO wants to move existing customers in bulk, an export of `(WSSO profile id, email)` and `(WSSO organization id, owner profile id)` can be imported into OmniForce as **`pending_review`** candidates (`link_method = 'import'`). Each one becomes `linked` only when either:

- the person completes the connect flow above (an `app_assertion` upgrades the candidate), or
- a platform admin approves it after out-of-band verification.

Nothing in that import grants access by itself.

## Open questions for the WSSO team

1. Exact names: `profiles` key and columns, `organizations`, and the membership table and its roles.
2. Can one WSSO profile belong to several organizations? (The OmniForce sign-in carries one organization at a time.)
3. How does WSSO bill today, and which flag will mark an organization as "billed by OmniForce"?
4. Should WSSO users who never had an OmniForce account keep local logins indefinitely? (OmniForce assumes yes.)
5. Does WSSO want OmniForce to provision members (push), or only to answer access checks (pull)? Pull via `check_access` is already available. Push isn't defined.

## What's in this repo for WSSO

- `docs/INTEGRATION_AUTH.md`: the contract WSSO would build against.
- `wsso-changes/`: an **earlier draft** written before this design. It assumes different tables (`users`, `companies`) and a signed-ticket protocol that has since been removed from OmniForce. **Don't apply it.** See `wsso-changes/README.md`.
