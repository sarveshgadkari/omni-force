// OmniForce as an OpenID Connect-shaped provider for module applications.
// Deploy with --no-verify-jwt (token/userinfo/discovery are called by app back ends).
//
//   GET  /oidc/.well-known/openid-configuration   discovery
//   GET  /oidc/jwks                                public signing keys
//   POST /oidc/authorize                           (hub page only, user's OmniForce JWT) → { redirect_to }
//   POST /oidc/token                               authorization_code + PKCE, client authentication
//   GET  /oidc/userinfo                            Bearer access token
//
// SSO_ISSUER must be this function's public URL, e.g.
// https://<hub-ref>.supabase.co/functions/v1/oidc (or a custom domain proxying it).
// The browser-facing authorization endpoint is the hub page HUB_ORIGIN/oauth/authorize.
// Nothing is enabled until a client and the module are switched on (docs/INTEGRATION_AUTH.md).
import { cors, json } from "../_shared/cors.ts";
import { HttpError, sha256Hex } from "../_shared/errors.ts";
import { issuer, publicJwks, signJwt, verifyJwt } from "../_shared/keys.ts";
import {
  ACCESS_TOKEN_TTL, clientCredentials, ID_TOKEN_TTL, oauthError, parseScope, randomToken, readParams, SCOPES, subpath, withParams,
} from "../_shared/oauth.ts";
import { admin, requireUser, rpc } from "../_shared/db.ts";

const hubOrigin = () => (Deno.env.get("HUB_ORIGIN") ?? "").split(",")[0].trim().replace(/\/+$/, "");
const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

function discovery() {
  const iss = issuer();
  return {
    issuer: iss,
    authorization_endpoint: `${hubOrigin()}/oauth/authorize`,
    token_endpoint: `${iss}/token`,
    userinfo_endpoint: `${iss}/userinfo`,
    jwks_uri: `${iss}/jwks`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["ES256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: SCOPES,
    claims_supported: [
      "sub", "iss", "aud", "exp", "iat", "auth_time", "nonce", "azp", "name", "given_name", "family_name", "updated_at",
      "email", "email_verified", "org", "omniforce_access", "module_user_id",
    ],
    authorization_response_iss_parameter_supported: true,
    request_parameter_supported: false,
    claims_parameter_supported: false,
  };
}

/** Hub page → issue a one-time code for the signed-in user. */
async function authorize(req: Request) {
  const user = await requireUser(req);
  const b = await req.json().catch(() => ({}));
  const str = (k: string, max: number) => (typeof b[k] === "string" && b[k].length <= max ? b[k] as string : null);
  const client_id = str("client_id", 100), redirect_uri = str("redirect_uri", 2000);
  if (!client_id || !redirect_uri) throw new HttpError(400, "This sign-in link is incomplete.", "invalid_request");
  if (b.response_type !== "code") throw new HttpError(400, "Only response_type=code is supported.", "unsupported_response_type");
  const state = typeof b.state === "string" ? b.state.slice(0, 1024) : null;
  const org = typeof b.organization_id === "string" && /^[0-9a-f-]{36}$/i.test(b.organization_id) ? b.organization_id : null;

  const code = randomToken(32);
  const r = await rpc<{ ok?: boolean; error?: string; error_description?: string; redirectable?: boolean; organizations?: unknown }>(
    "oauth_issue_code", {
      p_user: user.id, p_client_id: client_id, p_redirect_uri: redirect_uri, p_scope: parseScope(b.scope),
      p_nonce: str("nonce", 255), p_code_challenge: str("code_challenge", 128), p_code_challenge_method: str("code_challenge_method", 10),
      p_organization_id: org, p_code_hash: await sha256Hex(code),
    });

  const iss = issuer();
  if (r.ok) return json({ redirect_to: withParams(redirect_uri, { code, state, iss }) });
  if (r.redirectable) {
    return json({ redirect_to: withParams(redirect_uri, { error: r.error, error_description: r.error_description, state, iss }) });
  }
  throw new HttpError(400, r.error_description ?? "This application can't use OmniForce sign-in.", r.error,
    r.organizations ? { organizations: r.organizations } : undefined);
}

async function token(req: Request) {
  const params = await readParams(req);
  const creds = clientCredentials(req, params);
  if (!creds || (params.client_id && params.client_id !== creds.id)) {
    return oauthError("invalid_client", "Client authentication failed.", 401, { "WWW-Authenticate": 'Basic realm="omniforce"' });
  }
  const okClient = await rpc<boolean>("oauth_client_authenticate", { p_client_id: creds.id, p_secret_hash: await sha256Hex(creds.secret) });
  if (!okClient) return oauthError("invalid_client", "Client authentication failed.", 401, creds.basic ? { "WWW-Authenticate": 'Basic realm="omniforce"' } : {});
  if (params.grant_type !== "authorization_code") return oauthError("unsupported_grant_type", "Only authorization_code is supported.");
  if (!params.code || !params.redirect_uri || !params.code_verifier) return oauthError("invalid_request", "code, redirect_uri and code_verifier are required.");

  const r = await rpc<{ ok?: boolean; error?: string; error_description?: string; organization_id: string | null; scope: string[]; nonce: string | null; auth_time: number | null; claims: Record<string, unknown> }>(
    "oauth_consume_code", { p_code_hash: await sha256Hex(params.code), p_client_id: creds.id, p_redirect_uri: params.redirect_uri, p_code_verifier: params.code_verifier });
  if (!r.ok) return oauthError(r.error ?? "invalid_grant", r.error_description ?? "Invalid grant.");

  const sub = String(r.claims.sub);
  const id_token = await signJwt(
    { ...r.claims, azp: creds.id, ...(r.nonce ? { nonce: r.nonce } : {}), ...(r.auth_time ? { auth_time: r.auth_time } : {}) },
    { audience: creds.id, subject: sub, ttlSeconds: ID_TOKEN_TTL },
  );
  const access_token = await signJwt(
    { client_id: creds.id, scope: r.scope.join(" "), ...(r.organization_id ? { org_id: r.organization_id } : {}) },
    { audience: `${issuer()}/userinfo`, subject: sub, ttlSeconds: ACCESS_TOKEN_TTL, typ: "at+jwt" },
  );
  return new Response(JSON.stringify({ access_token, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL, id_token, scope: r.scope.join(" ") }), {
    headers: { "Content-Type": "application/json", ...noStore },
  });
}

async function userinfo(req: Request) {
  const t = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const invalid = () => new Response(JSON.stringify({ error: "invalid_token" }), {
    status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer error="invalid_token"', ...noStore },
  });
  let p;
  try { p = await verifyJwt(t, { audience: `${issuer()}/userinfo`, typ: "at+jwt" }); } catch { return invalid(); }
  const { data: prof } = await admin.from("profiles").select("id").eq("omniforce_id", String(p.sub)).maybeSingle();
  if (!prof) return invalid();
  // claims are rebuilt now, so a disabled account or removed access stops working immediately
  const claims = await rpc<Record<string, unknown> | null>("oauth_claims", {
    p_user: prof.id, p_client_id: String(p.client_id), p_org: (p.org_id as string) ?? null, p_scope: String(p.scope ?? "").split(" "),
  });
  if (!claims) return invalid();
  return new Response(JSON.stringify(claims), { headers: { "Content-Type": "application/json", ...noStore } });
}

Deno.serve(async (req) => {
  const path = subpath(req.url, "oidc");
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method === "GET" && path === "/.well-known/openid-configuration") {
      return json(discovery(), 200, { "Cache-Control": "public, max-age=300" });
    }
    if (req.method === "GET" && path === "/jwks") return json(publicJwks(), 200, { "Cache-Control": "public, max-age=300" });
    if (req.method === "POST" && path === "/authorize") return await authorize(req);
    if (req.method === "POST" && path === "/token") return await token(req);
    if ((req.method === "GET" || req.method === "POST") && path === "/userinfo") return await userinfo(req);
    return json({ error: "not_found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) {
      if (path === "/token") return oauthError(e.code ?? "invalid_request", e.message, e.status);
      return json({ error: e.code ?? "error", error_description: e.message, ...e.extra }, e.status);
    }
    console.error(e);
    return path === "/token" ? oauthError("server_error", "Try again later.", 500) : json({ error: "server_error" }, 500);
  }
});
