import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { setup, makeAdmin, plan } from "./harness.mjs";

const t = await setup(after);
const admin = await makeAdmin(t);
const user = await t.user("pilot@x.test", { first: "Pat", last: "Pilot" });
await t.q("update auth.users set last_sign_in_at = now() where id = $1", [user]);

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
const pkce = () => { const v = b64url(randomBytes(32)); return { verifier: v, challenge: b64url(createHash("sha256").update(v).digest()) }; };
const REDIRECT = "https://wsso.example.test/auth/omniforce/callback";

let client, secret;

async function issue({ u = user, clientId = client, redirect = REDIRECT, scope = ["openid", "profile", "email", "organizations", "entitlements"], org = null, method = "S256", ch } = {}) {
  const code = b64url(randomBytes(32));
  const p = pkce();
  const r = await t.one("select public.oauth_issue_code($1, $2, $3, $4, 'n-123', $5, $6, $7, $8) as r",
    [u, clientId, redirect, scope, ch ?? p.challenge, method, org, sha256hex(code)]);
  return { ...r.r, code, verifier: p.verifier };
}
const consume = async (code, verifier, clientId = client, redirect = REDIRECT) =>
  (await t.one("select public.oauth_consume_code($1, $2, $3, $4) as r", [sha256hex(code), clientId, redirect, verifier])).r;

test("only platform admins register clients; secrets are stored hashed and hidden", async () => {
  await t.rejects(t.as(user, "select public.admin_create_oauth_client('wsso', 'WSSO', 'staging', $1)", [[REDIRECT]]), /forbidden/);
  const r = (await t.as(admin, "select public.admin_create_oauth_client('wsso', 'WSSO staging', 'staging', $1, 'https://wsso.example.test/auth/omniforce/start') as r", [[REDIRECT]]))[0].r;
  client = r.client_id; secret = r.client_secret;
  assert.match(secret, /^ofs_[0-9a-f]{64}$/);
  const row = await t.one("select status, secret_hash from oauth_clients where client_id = $1", [client]);
  assert.equal(row.status, "disabled");
  assert.equal(row.secret_hash, sha256hex(secret));
  await t.rejects(t.as(admin, "select secret_hash from oauth_clients"), /permission denied/);
  assert.equal((await t.as(admin, "select client_id, secret_hint from oauth_clients")).length, 1);
  assert.equal((await t.as(user, "select client_id from oauth_clients")).length, 0);
});

test("redirect URIs must be https (or http on localhost) without fragments", async () => {
  for (const bad of ["http://evil.test/cb", "https://ok.test/cb#x", "javascript:alert(1)", "https://UPPER.test/cb"]) {
    await t.rejects(t.as(admin, "select public.admin_create_oauth_client('wsso', 'x', 'development', $1)", [[bad]]), /check constraint|violates/);
  }
  await t.as(admin, "select public.admin_create_oauth_client('wsso', 'local', 'development', $1)", [["http://localhost:5174/cb"]]);
});

test("a disabled client or unregistered redirect is never redirected to", async () => {
  let r = await issue();
  assert.equal(r.error, "invalid_client");
  assert.equal(r.redirectable, false);
  await t.as(admin, "select public.admin_update_oauth_client($1, null, null, 'https://wsso.example.test/auth/omniforce/start', 'testing')", [client]);
  r = await issue({ redirect: "https://attacker.test/cb" });
  assert.equal(r.error, "invalid_request");
  assert.equal(r.redirectable, false);
});

test("while the module's SSO is not configured, nobody gets a code", async () => {
  const r = await issue({ u: admin });
  assert.equal(r.error, "access_denied");
  assert.match(r.error_description, /not available/);
  const launch = (await t.one("select public.sso_launch_target($1, 'directory') as r", [user])).r;
  assert.equal(launch.error, "sso_unavailable");
  assert.equal(launch.app_url, "https://drones-drones-drones.directoryup.com");
});

test("enabling a module's SSO requires an enabled client", async () => {
  await t.rejects(t.as(admin, "select public.admin_set_module_integration('wsso', 'enabled', null)"), /enable_a_client_first/);
  await t.as(admin, "select public.admin_set_module_integration('wsso', 'testing', null)");
  await t.rejects(t.as(user, "select public.admin_set_module_integration('wsso', 'testing', null)"), /forbidden/);
  await t.rejects(t.as(admin, "update modules set sso_status = 'enabled' where key = 'wsso'"), /permission denied/);
});

test("testing mode: only platform admins can sign in", async () => {
  await t.q("insert into entitlements (user_id, module_key, plan_id, status, source) values ($1, 'wsso', $2, 'active', 'admin'), ($3, 'wsso', $2, 'active', 'admin')",
    [user, await plan(t, "wsso_growth_month"), admin]);
  assert.equal((await issue()).error, "access_denied");
  assert.equal((await issue({ u: admin })).ok, true);
});

test("PKCE S256 and the openid scope are mandatory", async () => {
  assert.equal((await issue({ u: admin, method: "plain" })).error, "invalid_request");
  assert.equal((await issue({ u: admin, ch: "short" })).error, "invalid_request");
  assert.equal((await issue({ u: admin, scope: ["profile"] })).error, "invalid_scope");
  assert.equal((await issue({ u: admin, scope: ["openid", "admin:all"] })).error, "invalid_scope");
});

test("full flow once enabled: code → claims, single use, bound to client, redirect and verifier", async () => {
  await t.as(admin, "select public.admin_update_oauth_client($1, null, null, 'https://wsso.example.test/auth/omniforce/start', 'enabled')", [client]);
  await t.as(admin, "select public.admin_set_module_integration('wsso', 'enabled', null)");

  const a = await issue();
  assert.equal(a.ok, true);
  const r = await consume(a.code, a.verifier);
  assert.equal(r.ok, true);
  assert.equal(r.nonce, "n-123");
  assert.equal(r.claims.sub, (await t.one("select omniforce_id from profiles where id = $1", [user])).omniforce_id);
  assert.equal(r.claims.email, "pilot@x.test");
  assert.equal(r.claims.email_verified, true);
  assert.equal(r.claims.given_name, "Pat");
  assert.equal(r.claims.omniforce_access.module, "wsso");
  assert.equal(r.claims.omniforce_access.plan_ref, "growth");
  assert.equal(r.claims.module_user_id, null);
  assert.ok(r.auth_time > 0);

  assert.equal((await consume(a.code, a.verifier)).error, "invalid_grant", "replay");
  assert.ok(await t.one("select 1 from audit_log where action = 'oauth.code_replay'"));

  const b = await issue();
  assert.equal((await consume(b.code, "x".repeat(43))).error, "invalid_grant", "wrong verifier");
  assert.equal((await consume(b.code, b.verifier)).error, "invalid_grant", "code burnt by failed attempt");

  const c = await issue();
  assert.equal((await consume(c.code, c.verifier, "ofc_other")).error, "invalid_grant", "other client");
  const d = await issue();
  assert.equal((await consume(d.code, d.verifier, client, "https://wsso.example.test/other")).error, "invalid_grant", "other redirect");
  const e = await issue();
  await t.q("update oauth_authorization_codes set expires_at = now() - interval '1 second' where code_hash = $1", [sha256hex(e.code)]);
  assert.equal((await consume(e.code, e.verifier)).error, "invalid_grant", "expired");
});

test("access is re-checked at exchange time", async () => {
  const a = await issue();
  await t.q("update profiles set status = 'disabled' where id = $1", [user]);
  assert.equal((await consume(a.code, a.verifier)).error, "invalid_grant");
  await t.q("update profiles set status = 'active' where id = $1", [user]);
});

test("client authentication accepts the current secret and the previous one for 24h", async () => {
  const ok = async (s) => (await t.one("select public.oauth_client_authenticate($1, $2) as ok", [client, sha256hex(s)])).ok;
  assert.equal(await ok(secret), true);
  assert.equal(await ok("ofs_wrong"), false);
  const rotated = (await t.as(admin, "select public.admin_rotate_oauth_client_secret($1) as r", [client]))[0].r;
  assert.equal(await ok(rotated.client_secret), true);
  assert.equal(await ok(secret), true);
  await t.q("update oauth_clients set previous_secret_expires_at = now() - interval '1 second' where client_id = $1", [client]);
  assert.equal(await ok(secret), false);
  secret = rotated.client_secret;
});

test("organization context: users with only seat access must pick the organization", async () => {
  const worker = await t.user("worker@crew.test");
  const boss = await t.user("boss@crew.test");
  const [org] = await t.as(boss, "select * from public.create_organization('Crew Co')");
  await t.q("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [org.id, worker]);
  await t.q("insert into entitlements (organization_id, module_key, plan_id, status, source) values ($1, 'wsso', $2, 'active', 'admin')", [org.id, await plan(t, "wsso_business_month")]);
  await t.as(boss, "select public.assign_org_module_seat($1, $2, 'wsso')", [org.id, worker]);

  const need = await issue({ u: worker });
  assert.equal(need.error, "organization_required");
  assert.deepEqual(need.organizations.map((o) => o.name), ["Crew Co"]);

  const outsiderOrg = (await t.as(admin, "select * from public.create_organization('Not Mine')"))[0].id;
  assert.equal((await issue({ u: worker, org: outsiderOrg })).error, "access_denied");

  const a = await issue({ u: worker, org: org.id });
  const r = await consume(a.code, a.verifier);
  assert.equal(r.claims.org.name, "Crew Co");
  assert.equal(r.claims.org.role, "member");
  assert.equal(r.claims.org.external_id, null);
  assert.equal(r.claims.omniforce_access.via, "organization");

  // the app links its accounts: member may link themself but not the organization
  let l = (await t.one("select public.integration_link_identity($1, $2, 'wsso-user-w', 'wsso-org-crew') as r",
    [client, (await t.one("select omniforce_id from profiles where id = $1", [worker])).omniforce_id])).r;
  assert.equal(l.error, "organization_link_requires_admin");
  assert.equal(l.identity_link, "linked");

  // the owner signs in with the org and links it
  const bossOf = (await t.one("select omniforce_id from profiles where id = $1", [boss])).omniforce_id;
  const bc = await issue({ u: boss, org: org.id });
  await consume(bc.code, bc.verifier);
  l = (await t.one("select public.integration_link_identity($1, $2, 'wsso-user-b', 'wsso-org-crew') as r", [client, bossOf])).r;
  assert.equal(l.ok, true);
  assert.equal(l.organization_link, "linked");

  // now claims and access checks resolve the module's own organization id
  const again = await issue({ u: worker, org: org.id });
  const r2 = await consume(again.code, again.verifier);
  assert.equal(r2.claims.org.external_id, "wsso-org-crew");
  assert.equal(r2.claims.module_user_id, "wsso-user-w");
  const acc = (await t.one("select public.integration_access($1, $2, 'wsso-org-crew') as r", [client, bossOf])).r;
  assert.equal(acc.active, true);
  assert.equal(acc.via, "organization");
  assert.equal(Number(acc.seats_assigned), 2);
  const none = (await t.one("select public.integration_access($1, $2, 'wsso-org-unknown') as r", [client, bossOf])).r;
  assert.deepEqual([none.active, none.reason], [false, "organization_not_linked"]);
});

test("apps can only link users who just signed in through OmniForce", async () => {
  const fresh = await t.user("fresh@x.test");
  const of = (await t.one("select omniforce_id from profiles where id = $1", [fresh])).omniforce_id;
  const r = (await t.one("select public.integration_link_identity($1, $2, 'wsso-user-f') as r", [client, of])).r;
  assert.equal(r.error, "no_recent_sign_in");
  assert.equal((await t.q("select * from identity_links where user_id = $1", [fresh])).length, 0);
});

test("an app can't re-point an existing link to a different account", async () => {
  const a = await issue();
  await consume(a.code, a.verifier);
  const of = (await t.one("select omniforce_id from profiles where id = $1", [user])).omniforce_id;
  assert.equal((await t.one("select public.integration_link_identity($1, $2, 'wsso-user-p') as r", [client, of])).r.ok, true);
  const r = (await t.one("select public.integration_link_identity($1, $2, 'wsso-user-hijack') as r", [client, of])).r;
  assert.equal(r.error, "user_already_linked_to_other_account");
});

test("service-only functions are not callable by signed-in users", async () => {
  for (const sql of [
    "select public.oauth_consume_code('x', 'y', 'z', 'w')",
    "select public.oauth_client_authenticate('x', 'y')",
    "select public.integration_access('x', 'y')",
    "select public.sso_launch_target(gen_random_uuid(), 'wsso')",
  ]) await t.rejects(t.as(user, sql), /permission denied/);
  await t.rejects(t.as(user, "select * from oauth_authorization_codes"), /permission denied/);
});

test("webhook replay guard", async () => {
  assert.equal((await t.one("select public.webhook_seen('wsso', 'sig-1') as s")).s, false);
  assert.equal((await t.one("select public.webhook_seen('wsso', 'sig-1') as s")).s, true);
});

test("SQL PKCE matches RFC 7636 appendix B", async () => {
  const r = await t.one("select public.pkce_s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') as c");
  assert.equal(r.c, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});
