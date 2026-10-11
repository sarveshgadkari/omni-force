// Server-to-server API for registered module applications (client credentials).
// Deploy with --no-verify-jwt.
//
// POST { action: "check_access", sub, external_org_id? }
//   → { sub, active, module, via, status, plan, plan_ref, seats, seats_assigned, valid_until } | { active:false, reason }
//   OmniForce's central answer to "may this person use your module (in this organization)?".
//   What they can do inside the module stays the module's decision.
//
// POST { action: "link_identity", sub, external_user_id, external_org_id? }
//   Binds the app's own account (and optionally its organization) to the OmniForce
//   identity that just signed in to this client. Rejected unless that user completed
//   an OmniForce sign-in to this client in the last 15 minutes; organizations can only
//   be bound by an owner/admin of the OmniForce organization they signed in with.
//
// Authentication: HTTP Basic client_id:client_secret (or client_id/client_secret in the body).
import { json } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/errors.ts";
import { clientCredentials } from "../_shared/oauth.ts";
import { rpc } from "../_shared/db.ts";

const idOk = (v: unknown, max = 200) => typeof v === "string" && v.length > 0 && v.length <= max;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 8_192) return json({ error: "too_large" }, 413);
    const body = JSON.parse(raw || "{}");
    const creds = clientCredentials(req, { client_id: String(body.client_id ?? ""), client_secret: String(body.client_secret ?? "") });
    if (!creds || !(await rpc<boolean>("oauth_client_authenticate", { p_client_id: creds.id, p_secret_hash: await sha256Hex(creds.secret) }))) {
      return json({ error: "invalid_client" }, 401, { "WWW-Authenticate": 'Basic realm="omniforce"' });
    }
    if (!idOk(body.sub, 40)) return json({ error: "invalid_request", error_description: "sub is required." }, 400);
    const extOrg = body.external_org_id == null ? null : idOk(body.external_org_id) ? String(body.external_org_id) : undefined;
    if (extOrg === undefined) return json({ error: "invalid_request", error_description: "external_org_id is invalid." }, 400);

    if (body.action === "check_access") {
      return json(await rpc("integration_access", { p_client_id: creds.id, p_omniforce_id: body.sub, p_external_org_id: extOrg }), 200, { "Cache-Control": "no-store" });
    }
    if (body.action === "link_identity") {
      if (!idOk(body.external_user_id)) return json({ error: "invalid_request", error_description: "external_user_id is required." }, 400);
      const r = await rpc<{ ok?: boolean; error?: string }>("integration_link_identity", {
        p_client_id: creds.id, p_omniforce_id: body.sub, p_external_user_id: body.external_user_id, p_external_org_id: extOrg,
      });
      return json(r, r.ok ? 200 : 409);
    }
    return json({ error: "invalid_request", error_description: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
