import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setup, makeAdmin, plan } from "./harness.mjs";

const t = await setup(after);
const admin = await makeAdmin(t);

const access = async (u) => (await t.as(u, "select module_key, via, organization_id, plan_code from public.my_module_access() order by module_key, via"));
const mods = async (u) => (await access(u)).map((a) => `${a.module_key}:${a.via}`);

async function orgWith(ownerId, name) {
  const [o] = await t.as(ownerId, "select * from public.create_organization($1)", [name]);
  return o.id;
}
async function addMember(org, user, role = "member") {
  await t.q("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
}
async function grantOrg(org, module, code, extra = {}) {
  await t.q(
    `insert into entitlements (organization_id, module_key, plan_id, status, source, valid_until)
     values ($1, $2, $3, coalesce($4, 'active')::entitlement_status, coalesce($5, 'admin'), $6)
     on conflict (organization_id, module_key) do update set plan_id = excluded.plan_id, status = excluded.status, source = excluded.source, valid_until = excluded.valid_until`,
    [org, module, await plan(t, code), extra.status ?? null, extra.source ?? null, extra.valid_until ?? null],
  );
}

test("defaults: no module has SSO or provisioning switched on, and no clients exist", async () => {
  const rows = await t.q("select key, sso_status, provisioning_status, launch_url from modules order by key");
  for (const r of rows) {
    assert.equal(r.sso_status, "not_configured", r.key);
    assert.equal(r.provisioning_status, "disabled", r.key);
    assert.equal(r.launch_url, null, r.key);
  }
  assert.equal((await t.q("select * from oauth_clients")).length, 0);
});

test("new users get free Directory access as individuals", async () => {
  const u = await t.user("ivy@solo.test");
  assert.deepEqual(await mods(u), ["directory:individual"]);
});

test("organization entitlement grants access only to members holding a seat", async () => {
  const o1 = await t.user("owner1@org.test");
  const m1 = await t.user("member1@org.test");
  const org = await orgWith(o1, "Seat Co");
  await addMember(org, m1);
  await grantOrg(org, "wsso", "wsso_starter_month"); // 10 seats

  // owners are seated automatically when the org first gets the module
  assert.ok((await mods(o1)).includes("wsso:organization"));
  // a plain member has no access until seated
  assert.ok(!(await mods(m1)).includes("wsso:organization"));
  // members can see the org entitlement row itself (RLS), but that is not access
  assert.equal((await t.as(m1, "select * from entitlements where organization_id = $1", [org])).length, 1);

  await t.rejects(t.as(m1, "select public.assign_org_module_seat($1, $2, 'wsso')", [org, m1]), /forbidden/);
  await t.as(o1, "select public.assign_org_module_seat($1, $2, 'wsso')", [org, m1]);
  const a = (await access(m1)).find((x) => x.module_key === "wsso");
  assert.equal(a.via, "organization");
  assert.equal(a.organization_id, org);
  assert.equal(a.plan_code, "wsso_starter_month");

  // the member can give up their own seat
  await t.as(m1, "select public.unassign_org_module_seat($1, $2, 'wsso')", [org, m1]);
  assert.ok(!(await mods(m1)).includes("wsso:organization"));
});

test("seat limits are enforced and outsiders can't be seated", async () => {
  const o = await t.user("owner2@org.test");
  const org = await orgWith(o, "Small Co");
  await t.q("update plans set seats = 2 where code = 'wsso_starter_year'");
  await grantOrg(org, "wsso", "wsso_starter_year");
  const a = await t.user("a2@org.test"); const b = await t.user("b2@org.test"); const x = await t.user("x2@else.test");
  await addMember(org, a); await addMember(org, b);
  await t.as(o, "select public.assign_org_module_seat($1, $2, 'wsso')", [org, a]); // owner + a = 2
  await t.rejects(t.as(o, "select public.assign_org_module_seat($1, $2, 'wsso')", [org, b]), /seat_limit_reached/);
  await t.rejects(t.as(o, "select public.assign_org_module_seat($1, $2, 'wsso')", [org, x]), /member_not_found/);
  await t.rejects(t.as(o, "select public.assign_org_module_seat($1, $2, 'directory')", [org, a]), /module_not_in_org_plan/);
  const om = await t.as(o, "select module_key, seats, seats_used from public.org_modules($1)", [org]);
  assert.deepEqual(om.map((r) => [r.module_key, r.seats, Number(r.seats_used)]), [["wsso", 2, 2]]);
});

test("access disappears when the membership, organization, profile or grant stops being valid", async () => {
  const o = await t.user("owner3@org.test");
  const m = await t.user("m3@org.test");
  const org = await orgWith(o, "Lifecycle Co");
  await addMember(org, m);
  await grantOrg(org, "wsso", "wsso_growth_month");
  await t.as(o, "select public.assign_org_module_seat($1, $2, 'wsso')", [org, m]);
  const has = async () => (await mods(m)).includes("wsso:organization");
  assert.ok(await has());

  await t.q("update organization_members set status = 'suspended' where user_id = $1", [m]);
  assert.ok(!(await has()));
  await t.q("update organization_members set status = 'active' where user_id = $1", [m]);

  await t.q("update organizations set status = 'disabled' where id = $1", [org]);
  assert.ok(!(await has()));
  await t.q("update organizations set status = 'active' where id = $1", [org]);

  await t.q("update profiles set status = 'disabled' where id = $1", [m]);
  assert.equal((await access(m)).length, 0);
  await t.q("update profiles set status = 'active' where id = $1", [m]);

  await grantOrg(org, "wsso", "wsso_growth_month", { valid_until: new Date(Date.now() - 60_000).toISOString() });
  assert.ok(!(await has()), "admin grant past valid_until");
  await grantOrg(org, "wsso", "wsso_growth_month", { source: "stripe", valid_until: new Date(Date.now() - 2 * 86400_000).toISOString() });
  assert.ok(await has(), "stripe grant within 7-day grace");
  await grantOrg(org, "wsso", "wsso_growth_month", { status: "canceled", source: "stripe" });
  assert.ok(!(await has()));
});

test("authenticated users can't read other users' access", async () => {
  const u = await t.user("snoop@x.test");
  await t.rejects(t.as(u, "select * from public.module_access_for($1)", [admin]), /permission denied/);
  await t.rejects(t.as(u, "select public.user_can_access_module($1, 'wsso')", [admin]), /permission denied/);
  await t.rejects(t.as(u, "select * from public.admin_module_access($1)", [admin]), /forbidden/);
  assert.ok(Array.isArray(await t.as(admin, "select * from public.admin_module_access($1)", [u])));
});

// ─────────────────────────────── Stripe recompute

async function subscribe({ user, org = null, code, status = "active" }) {
  const s = await t.one(
    `insert into subscriptions (user_id, organization_id, stripe_subscription_id, status, current_period_end)
     values ($1, $2, 'sub_' || gen_random_uuid(), $3, now() + interval '20 days') returning id`, [user, org, status]);
  await t.q("insert into subscription_items (subscription_id, plan_id) values ($1, $2)", [s.id, await plan(t, code)]);
  return s.id;
}

test("an admin revoke of Directory is not undone by the next Stripe sync (bug fix)", async () => {
  const u = await t.user("revoked@x.test");
  await t.q("update entitlements set status = 'canceled', source = 'admin' where user_id = $1 and module_key = 'directory'", [u]);
  await t.q("select public.recompute_entitlements($1)", [u]);
  const e = await t.one("select status, source from entitlements where user_id = $1 and module_key = 'directory'", [u]);
  assert.deepEqual([e.status, e.source], ["canceled", "admin"]);
});

test("a canceled paid Directory plan falls back to free Scout", async () => {
  const u = await t.user("payer@x.test");
  const sub = await subscribe({ user: u, code: "dir_provider_month" });
  await t.q("select public.recompute_entitlements($1)", [u]);
  assert.equal((await t.one("select pl.code from entitlements e join plans pl on pl.id = e.plan_id where e.user_id = $1 and e.module_key = 'directory'", [u])).code, "dir_provider_month");
  await t.q("update subscriptions set status = 'canceled' where id = $1", [sub]);
  await t.q("select public.recompute_entitlements($1)", [u]);
  const e = await t.one("select e.status, e.source, pl.code from entitlements e join plans pl on pl.id = e.plan_id where e.user_id = $1 and e.module_key = 'directory'", [u]);
  assert.deepEqual([e.status, e.source, e.code], ["active", "free", "dir_scout"]);
});

test("an organization's subscription grants the organization, not the buyer", async () => {
  const buyer = await t.user("buyer@org.test");
  const org = await orgWith(buyer, "Bought Co");
  await subscribe({ user: buyer, org, code: "bundle_dir_wsso_month" });
  await t.q("select public.recompute_org_entitlements($1)", [org]);
  await t.q("select public.recompute_entitlements($1)", [buyer]);
  const orgEnts = await t.q("select module_key from entitlements where organization_id = $1 order by module_key", [org]);
  assert.deepEqual(orgEnts.map((r) => r.module_key), ["directory", "wsso"]);
  const own = await t.q("select module_key, source from entitlements where user_id = $1", [buyer]);
  assert.deepEqual(own.map((r) => `${r.module_key}:${r.source}`), ["directory:free"]);
  // buyer is the owner → seated on both
  assert.deepEqual((await mods(buyer)).sort(), ["directory:individual", "directory:organization", "wsso:organization"]);
});

test("only owner/billing roles see an organization's subscriptions and invoices", async () => {
  const o = await t.user("owner4@org.test");
  const bill = await t.user("bill4@org.test");
  const mem = await t.user("mem4@org.test");
  const org = await orgWith(o, "Billing Co");
  await addMember(org, bill, "billing");
  await addMember(org, mem, "admin");
  await subscribe({ user: o, org, code: "wsso_growth_month" });
  await t.q("insert into invoices (id, organization_id, status) values ('in_test_1', $1, 'paid')", [org]);
  for (const [u, n] of [[o, 1], [bill, 1], [mem, 0]]) {
    assert.equal((await t.as(u, "select * from subscriptions where organization_id = $1", [org])).length, n);
    assert.equal((await t.as(u, "select * from invoices where organization_id = $1", [org])).length, n);
  }
});

// ─────────────────────────────── provisioning gates

const events = async (u) => (await t.q("select module_key, event_type from integration_events where user_id = $1 order by id", [u])).map((r) => `${r.module_key}:${r.event_type}`);

test("nothing is queued for a module while its provisioning is disabled", async () => {
  const u = await t.user("quiet@x.test");
  await t.q("insert into entitlements (user_id, module_key, plan_id, status, source) values ($1, 'wsso', $2, 'active', 'admin')", [u, await plan(t, "wsso_growth_month")]);
  assert.deepEqual(await events(u), []);
});

test("with provisioning enabled, unverified users are only provisioned after verifying", async () => {
  await t.q("update modules set provisioning_status = 'enabled' where key = 'directory'");
  const u = await t.user("later@x.test", { confirmed: false });
  assert.deepEqual(await events(u), []);
  await t.q("update auth.users set email_confirmed_at = now() where id = $1", [u]);
  assert.deepEqual(await events(u), ["directory:member.provision"]);
  // a no-op update doesn't queue anything
  await t.q("update entitlements set updated_at = now() where user_id = $1", [u]);
  assert.deepEqual(await events(u), ["directory:member.provision"]);

  const o = await t.user("orgsync@x.test");
  const org = await orgWith(o, "Sync Co");
  await grantOrg(org, "directory", "dir_employer_month");
  const ev = await t.q("select event_type from integration_events where organization_id = $1 order by id", [org]);
  // the owner's automatic seat, then the organization's entitlement
  assert.deepEqual(ev.map((r) => r.event_type), ["member.seat_assigned", "organization.entitlement_changed"]);
  await t.q("update modules set provisioning_status = 'disabled' where key = 'directory'");
});

test("smart redirect follows organization access too", async () => {
  const o = await t.user("redirect@x.test");
  const org = await orgWith(o, "Redirect Co");
  await grantOrg(org, "wsso", "wsso_growth_month");
  await t.q("update profiles set last_module = 'wsso' where id = $1", [o]);
  assert.equal((await t.as(o, "select public.resolve_landing_module() as m"))[0].m, "wsso");
});
