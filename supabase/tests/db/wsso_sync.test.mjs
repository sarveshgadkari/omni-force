import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setup, plan } from "./harness.mjs";

const t = await setup(after);
const boss = await t.user("boss@sync.test");
const crew = await t.user("crew@sync.test");
const [org] = await t.as(boss, "select * from public.create_organization('Sync Co')");
await t.q("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [org.id, crew]);

const events = async () => (await t.q(
  "select event_type, user_id, organization_id from integration_events where module_key = 'wsso' order by id")).map(
  (e) => [e.event_type, e.user_id === boss ? "boss" : e.user_id === crew ? "crew" : e.user_id, e.organization_id === org.id ? "org" : e.organization_id]);
const clear = () => t.q("delete from integration_events");

test("nothing is queued while WSSO provisioning is disabled", async () => {
  await t.q("insert into entitlements (organization_id, module_key, plan_id, status, source) values ($1, 'wsso', $2, 'active', 'admin')", [org.id, await plan(t, "wsso_growth_month")]);
  await t.as(boss, "select public.assign_org_module_seat($1, $2, 'wsso')", [org.id, crew]);
  assert.deepEqual(await events(), []);
});

test("seat changes are queued per person and organization", async () => {
  await t.q("update modules set provisioning_status = 'enabled' where key = 'wsso'");
  await t.as(boss, "select public.unassign_org_module_seat($1, $2, 'wsso')", [org.id, crew]);
  await t.as(boss, "select public.assign_org_module_seat($1, $2, 'wsso')", [org.id, crew]);
  assert.deepEqual(await events(), [["member.seat_removed", "crew", "org"], ["member.seat_assigned", "crew", "org"]]);
  await clear();
});

test("suspending a member, or removing them, is queued", async () => {
  await t.q("update organization_members set status = 'suspended' where organization_id = $1 and user_id = $2", [org.id, crew]);
  await t.q("update organization_members set role = 'admin' where organization_id = $1 and user_id = $2", [org.id, crew]);
  assert.deepEqual(await events(), [["member.org_status_changed", "crew", "org"]]);
  await clear();
  await t.q("delete from organization_members where organization_id = $1 and user_id = $2", [org.id, crew]);
  assert.deepEqual(await events(), [["member.seat_removed", "crew", "org"]]);
  await clear();
});

test("disabling the organization is queued once per module it holds", async () => {
  await t.q("update organizations set status = 'disabled' where id = $1", [org.id]);
  await t.q("update organizations set name = 'Sync Co Ltd' where id = $1", [org.id]);
  assert.deepEqual(await events(), [["organization.status_changed", null, "org"]]);
  await clear();
});

test("org_module_access reports what the organization holds, and is service-only", async () => {
  let [a] = await t.q("select * from public.org_module_access($1, 'wsso')", [org.id]);
  assert.equal(a.live, false); // organization disabled
  await t.q("update organizations set status = 'active' where id = $1", [org.id]);
  [a] = await t.q("select * from public.org_module_access($1, 'wsso')", [org.id]);
  assert.deepEqual([a.live, a.plan_ref, a.seats], [true, "growth", 50]);
  [a] = await t.q("select * from public.org_module_access($1, 'directory')", [org.id]);
  assert.equal(a.live, false);
  await t.rejects(t.as(boss, "select * from public.org_module_access($1, 'wsso')", [org.id]), /permission denied/);
  await clear();
});

test("deleting a person with a seat neither fails nor queues anything", async () => {
  await t.q("update organizations set status = 'active' where id = $1", [org.id]);
  const temp = await t.user("temp@sync.test");
  await t.q("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [org.id, temp]);
  await t.as(boss, "select public.assign_org_module_seat($1, $2, 'wsso')", [org.id, temp]);
  await clear();
  await t.q("delete from auth.users where id = $1", [temp]);
  assert.equal((await t.q("select 1 from profiles where id = $1", [temp])).length, 0);
  assert.deepEqual(await events(), []);
});
