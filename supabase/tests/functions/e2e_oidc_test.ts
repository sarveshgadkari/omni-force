// End-to-end: the real oidc, sso-launch and integration-api handlers, running in
// Deno against the real migrations in PGlite. Covers the whole application
// sign-in contract: launch → authorize → token → id_token verification → userinfo
// → link_identity → check_access, plus the "not configured" default.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { createLocalJWKSet, jwtVerify } from "npm:jose@5.9.6";
// @ts-types="./harness.d.ts"
import { freshDb, makeAdmin, plan } from "../db/harness.mjs";
import { fakeClient } from "./fake_supabase.ts";

const ISS = "http://localhost:54321/functions/v1/oidc";
const HUB = "http://localhost:5173";
const REDIRECT = "https://wsso.example.test/auth/omniforce/callback";
const START = "https://wsso.example.test/auth/omniforce/start";

// ── environment + key before any handler module loads
const { privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
Deno.env.set("SSO_PRIVATE_JWK", JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d, kid: "of-e2e" }));
Deno.env.set("SSO_ISSUER", ISS);
Deno.env.set("HUB_ORIGIN", HUB);
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

// ── database + fake service client
const t = await freshDb();
const tokens = new Map<string, string>();
const fake = fakeClient(t, tokens);
const { admin } = await import("../../functions/_shared/db.ts");
// deno-lint-ignore no-explicit-any
const a = admin as any;
a.rpc = fake.rpc;
a.from = fake.from;
a.auth.getUser = fake.getUser;

// ── capture each handler instead of listening on a port
type Handler = (req: Request) => Promise<Response> | Response;
const handlers: Handler[] = [];
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: Handler) => { handlers.push(h); return { finished: Promise.resolve(), shutdown: async () => {}, ref() {}, unref() {}, addr: {} }; };
const load = async (path: string) => { await import(path); return handlers[handlers.length - 1]; };
const oidc = await load("../../functions/oidc/index.ts");
const launch = await load("../../functions/sso-launch/index.ts");
const api = await load("../../functions/integration-api/index.ts");

// ── people
const adminId = await makeAdmin(t);
const pilot = await t.user("pilot@x.test", { first: "Pat", last: "Pilot" });
tokens.set("tok-admin", adminId);
tokens.set("tok-pilot", pilot);
await t.q("insert into entitlements (user_id, module_key, plan_id, status, source) values ($1, 'wsso', $2, 'active', 'admin')", [pilot, await plan(t, "wsso_growth_month")]);
const pilotOf = (await t.one("select omniforce_id from profiles where id = $1", [pilot])).omniforce_id as string;

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));

const post = (h: Handler, path: string, body: unknown, headers: Record<string, string> = {}) =>
  h(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const authorize = (extra: Record<string, unknown> = {}, tok = "tok-pilot") => post(oidc, "/oidc/authorize", {
  client_id: client.client_id, redirect_uri: REDIRECT, response_type: "code", scope: "openid profile email entitlements",
  state: "st-1", nonce: "nn-1", code_challenge: challenge, code_challenge_method: "S256", ...extra,
}, { authorization: `Bearer ${tok}` });
const tokenReq = (code: string, secret = client.client_secret, v = verifier) => oidc(new Request("http://localhost/oidc/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${btoa(`${client.client_id}:${secret}`)}` },
  body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: v }),
}));

let client: { client_id: string; client_secret: string };

Deno.test({ name: "e2e: application sign-in contract", sanitizeOps: false, sanitizeResources: false }, async (s) => {
  await s.step("default: the hub reports SSO unavailable and points at the module's own login", async () => {
    const r = await post(launch, "/sso-launch", { module: "wsso" }, { authorization: "Bearer tok-pilot" });
    assertEquals(r.status, 409);
    const j = await r.json();
    assertEquals(j.code, "sso_unavailable");
    assertEquals(j.app_url, "https://wsso.tlbisbig.world");
    const d = await post(launch, "/sso-launch", { module: "directory" }, { authorization: "Bearer tok-pilot" });
    assertEquals((await d.json()).code, "sso_unavailable");
  });

  await s.step("discovery and JWKS are served under the issuer", async () => {
    const d = await (await oidc(new Request(`http://localhost/oidc/.well-known/openid-configuration`))).json();
    assertEquals(d.issuer, ISS);
    assertEquals(d.authorization_endpoint, `${HUB}/oauth/authorize`);
    assertEquals(d.token_endpoint, `${ISS}/token`);
    assertEquals(d.code_challenge_methods_supported, ["S256"]);
    const k = await (await oidc(new Request(`http://localhost/oidc/jwks`))).json();
    assertEquals(k.keys[0].kid, "of-e2e");
    assertEquals(k.keys[0].d, undefined);
  });

  await s.step("an admin registers and enables the client and the module", async () => {
    client = (await t.as(adminId, "select public.admin_create_oauth_client('wsso', 'WSSO staging', 'staging', $1, $2) as r", [[REDIRECT], START]))[0].r;
    // disabled client: authorize refuses without redirecting
    const r0 = await authorize();
    assertEquals(r0.status, 400);
    assertEquals((await r0.json()).error, "invalid_client");
    await t.as(adminId, "select public.admin_update_oauth_client($1, null, null, $2, 'enabled')", [client.client_id, START]);
    await t.as(adminId, "select public.admin_set_module_integration('wsso', 'enabled', null)");
  });

  await s.step("hub launch now sends the browser to the app's initiate-login URI with no credential in it", async () => {
    const j = await (await post(launch, "/sso-launch", { module: "wsso", target_link_uri: "https://wsso.example.test/work-orders" }, { authorization: "Bearer tok-pilot" })).json();
    const u = new URL(j.url);
    assertEquals(u.origin + u.pathname, START);
    assertEquals(u.searchParams.get("iss"), ISS);
    assertEquals(u.searchParams.get("login_hint"), pilotOf);
    assertEquals(u.searchParams.get("target_link_uri"), "https://wsso.example.test/work-orders");
    assertEquals([...u.searchParams.keys()].sort(), ["iss", "login_hint", "target_link_uri"]);
  });

  let accessToken = "";
  await s.step("authorize → code → token → verified id_token", async () => {
    const r = await authorize();
    assertEquals(r.status, 200);
    const back = new URL((await r.json()).redirect_to);
    assertEquals(back.origin + back.pathname, REDIRECT);
    assertEquals(back.searchParams.get("state"), "st-1");
    assertEquals(back.searchParams.get("iss"), ISS);
    const code = back.searchParams.get("code")!;
    assertMatch(code, /^[A-Za-z0-9_-]{43}$/);

    const tr = await tokenReq(code);
    assertEquals(tr.status, 200);
    assertEquals(tr.headers.get("cache-control"), "no-store");
    const tok = await tr.json();
    assertEquals(tok.token_type, "Bearer");
    const jwks = await (await oidc(new Request(`http://localhost/oidc/jwks`))).json();
    const { payload } = await jwtVerify(tok.id_token, createLocalJWKSet(jwks), { issuer: ISS, audience: client.client_id, algorithms: ["ES256"] });
    assertEquals(payload.sub, pilotOf);
    assertEquals(payload.nonce, "nn-1");
    assertEquals(payload.azp, client.client_id);
    assertEquals(payload.email, "pilot@x.test");
    assertEquals(payload.email_verified, true);
    // deno-lint-ignore no-explicit-any
    assertEquals((payload.omniforce_access as any).plan_ref, "growth");
    assertEquals(payload.org, undefined); // no organizations scope requested

    // replaying the code fails
    const again = await tokenReq(code);
    assertEquals(again.status, 400);
    assertEquals((await again.json()).error, "invalid_grant");
    accessToken = tok.access_token;
  });

  await s.step("userinfo returns fresh claims and stops when the account is disabled", async () => {
    const ui = await oidc(new Request("http://localhost/oidc/userinfo", { headers: { authorization: `Bearer ${accessToken}` } }));
    assertEquals(ui.status, 200);
    assertEquals((await ui.json()).sub, pilotOf);
    await t.q("update profiles set status = 'disabled' where id = $1", [pilot]);
    const off = await oidc(new Request("http://localhost/oidc/userinfo", { headers: { authorization: `Bearer ${accessToken}` } }));
    assertEquals(off.status, 401);
    await t.q("update profiles set status = 'active' where id = $1", [pilot]);
  });

  await s.step("token endpoint rejects a wrong secret and a wrong PKCE verifier", async () => {
    const back = new URL((await (await authorize()).json()).redirect_to);
    const bad = await tokenReq(back.searchParams.get("code")!, "ofs_wrong");
    assertEquals(bad.status, 401);
    assertEquals((await bad.json()).error, "invalid_client");
    const back2 = new URL((await (await authorize()).json()).redirect_to);
    const pk = await tokenReq(back2.searchParams.get("code")!, client.client_secret, "x".repeat(43));
    assertEquals((await pk.json()).error, "invalid_grant");
  });

  await s.step("unregistered redirect_uri is never redirected to; no-access users get an error back at the app", async () => {
    const r = await authorize({ redirect_uri: "https://evil.test/cb" });
    assertEquals(r.status, 400);
    const outsider = await t.user("noaccess@x.test");
    tokens.set("tok-out", outsider);
    const j = await (await authorize({}, "tok-out")).json();
    const u = new URL(j.redirect_to);
    assertEquals(u.searchParams.get("error"), "access_denied");
    assertEquals(u.searchParams.get("code"), null);
  });

  await s.step("integration API: link the app's account, then check access", async () => {
    const basic = { authorization: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}` };
    const unauth = await post(api, "/integration-api", { action: "check_access", sub: pilotOf });
    assertEquals(unauth.status, 401);
    const l = await post(api, "/integration-api", { action: "link_identity", sub: pilotOf, external_user_id: "wsso-profile-123" }, basic);
    assertEquals(l.status, 200);
    assertEquals((await l.json()).identity_link, "linked");
    const c = await (await post(api, "/integration-api", { action: "check_access", sub: pilotOf }, basic)).json();
    assertEquals([c.active, c.via, c.plan_ref], [true, "individual", "growth"]);
    // the next id_token carries the app's own user id
    const back = new URL((await (await authorize()).json()).redirect_to);
    const tok = await (await tokenReq(back.searchParams.get("code")!)).json();
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0))));
    assertEquals(claims.module_user_id, "wsso-profile-123");
  });

  await t.db.close();
  assert(true);
});
