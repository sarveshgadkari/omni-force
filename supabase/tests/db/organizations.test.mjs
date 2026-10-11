import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./harness.mjs";

const t = await setup(after);

const owner = await t.user("olive@acme.test", { first: "Olive" });
const adminU = await t.user("adam@acme.test", { first: "Adam" });
const member = await t.user("mia@acme.test", { first: "Mia" });
const outsider = await t.user("otto@other.test", { first: "Otto" });
const unverified = await t.user("una@acme.test", { confirmed: false });

let org;

async function invite(by, email, role = "member") {
  return (await t.as(by, "select public.create_org_invitation($1, $2, $3::org_role) as r", [org, email, role]))[0].r;
}

test("creating an organization makes the caller its owner", async () => {
  const [o] = await t.as(owner, "select * from public.create_organization('Acme Drones, Inc.')");
  org = o.id;
  assert.equal(o.slug, "acme-drones-inc");
  const m = await t.one("select role from organization_members where organization_id = $1 and user_id = $2", [org, owner]);
  assert.equal(m.role, "owner");
  const [dup] = await t.as(owner, "select slug from public.create_organization('Acme Drones Inc')");
  assert.match(dup.slug, /^acme-drones-inc-[0-9a-f]{6}$/);
});

test("unverified accounts can't create organizations", async () => {
  await t.rejects(t.as(unverified, "select public.create_organization('Nope Org')"), /email_unverified/);
});

test("non-members can't see the organization or its members", async () => {
  assert.equal((await t.as(outsider, "select * from organizations where id = $1", [org])).length, 0);
  assert.equal((await t.as(outsider, "select * from organization_members where organization_id = $1", [org])).length, 0);
  await t.rejects(t.as(outsider, "select * from public.org_members($1)", [org]), /forbidden/);
  assert.equal((await t.as(owner, "select * from organizations where id = $1", [org])).length, 1);
});

test("invitations: only owners/admins invite, only owners invite owners", async () => {
  const a = await invite(owner, "Adam@Acme.test", "admin");
  assert.equal(a.email, "adam@acme.test");
  assert.match(a.token, /^[0-9a-f]{64}$/);
  // token is stored hashed only
  const row = await t.one("select token_hash from organization_invitations where id = $1", [a.id]);
  assert.notEqual(row.token_hash, a.token);
  await t.as(adminU, "select public.accept_org_invitation($1)", [a.token]);

  await t.rejects(invite(adminU, "new-owner@acme.test", "owner"), /forbidden/);
  await t.rejects(invite(outsider, "x@acme.test"), /forbidden/);
  // invitations table is not readable directly
  await t.rejects(t.as(owner, "select * from organization_invitations"), /permission denied/);
});

test("accepting requires the invited, verified email and works once", async () => {
  const inv = await invite(adminU, "mia@acme.test");
  await t.rejects(t.as(outsider, "select public.accept_org_invitation($1)", [inv.token]), /invitation_email_mismatch/);
  const preview = (await t.as(member, "select public.get_org_invitation($1) as r", [inv.token]))[0].r;
  assert.equal(preview.state, "open");
  assert.equal(preview.organization_name, "Acme Drones, Inc.");
  await t.as(member, "select public.accept_org_invitation($1)", [inv.token]);
  await t.rejects(t.as(member, "select public.accept_org_invitation($1)", [inv.token]), /invitation_used/);
  await t.rejects(t.as(member, "select public.accept_org_invitation('nonsense')"), /invalid_invitation/);

  const unv = await invite(owner, "una@acme.test");
  await t.rejects(t.as(unverified, "select public.accept_org_invitation($1)", [unv.token]), /email_unverified/);

  const exp = await invite(owner, "late@acme.test");
  await t.q("update organization_invitations set expires_at = now() - interval '1 minute' where id = $1", [exp.id]);
  const late = await t.user("late@acme.test");
  await t.rejects(t.as(late, "select public.accept_org_invitation($1)", [exp.token]), /invitation_expired/);
});

test("re-inviting the same email revokes the older link", async () => {
  const first = await invite(owner, "twice@acme.test");
  const second = await invite(owner, "twice@acme.test");
  const twice = await t.user("twice@acme.test");
  await t.rejects(t.as(twice, "select public.accept_org_invitation($1)", [first.token]), /invitation_used/);
  await t.as(twice, "select public.accept_org_invitation($1)", [second.token]);
  await t.as(owner, "select public.remove_org_member($1, $2)", [org, twice]);
});

test("members can't invite and see no emails", async () => {
  await t.rejects(invite(member, "z@acme.test"), /forbidden/);
  const rows = await t.as(member, "select * from public.org_members($1)", [org]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.email === null));
  const asAdmin = await t.as(adminU, "select * from public.org_members($1)", [org]);
  assert.ok(asAdmin.every((r) => r.email));
});

test("role rules: admins can't touch owners; the last owner can't leave", async () => {
  await t.rejects(t.as(adminU, "select public.set_org_member_role($1, $2, 'owner')", [org, member]), /forbidden/);
  await t.rejects(t.as(adminU, "select public.set_org_member_role($1, $2, 'member')", [org, owner]), /forbidden/);
  await t.rejects(t.as(adminU, "select public.remove_org_member($1, $2)", [org, owner]), /forbidden/);
  await t.rejects(t.as(member, "select public.set_org_member_role($1, $2, 'admin')", [org, member]), /forbidden/);

  await t.rejects(t.as(owner, "select public.remove_org_member($1, $2)", [org, owner]), /last_owner/);
  await t.rejects(t.as(owner, "select public.set_org_member_role($1, $2, 'admin')", [org, owner]), /last_owner/);

  await t.as(adminU, "select public.set_org_member_role($1, $2, 'billing')", [org, member]);
  await t.as(owner, "select public.set_org_member_role($1, $2, 'owner')", [org, adminU]);
  await t.as(owner, "select public.set_org_member_role($1, $2, 'admin')", [org, owner]);  // now allowed: Adam is owner
  const roles = Object.fromEntries((await t.q("select user_id, role from organization_members where organization_id = $1", [org])).map((r) => [r.user_id, r.role]));
  assert.deepEqual([roles[owner], roles[adminU], roles[member]], ["admin", "owner", "billing"]);
});

test("members can leave; audit trail records membership changes", async () => {
  await t.as(member, "select public.remove_org_member($1, $2)", [org, member]);
  assert.equal((await t.as(member, "select * from public.my_organizations()")).length, 0);
  const actions = (await t.q("select action from audit_log where target_id = $1 order by id", [org])).map((r) => r.action);
  for (const a of ["org.create", "org.invite", "org.invite.accept", "org.member.role", "org.member.leave"]) assert.ok(actions.includes(a), a);
});

test("direct writes to membership tables are blocked by RLS", async () => {
  await t.rejects(t.as(outsider, "insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [org, outsider]), /row-level security|permission denied/);
  await t.as(adminU, "update organization_members set role = 'owner' where user_id = $1", [adminU]); // no update policy → no rows touched
  await t.as(owner, "update organizations set status = 'disabled' where id = $1", [org]);
  assert.equal((await t.one("select status from organizations where id = $1", [org])).status, "active");
});

test("deleting an organization isn't blocked by the last-owner guard", async () => {
  const [o] = await t.as(outsider, "select * from public.create_organization('Throwaway')");
  await t.q("delete from organizations where id = $1", [o.id]);
  assert.equal((await t.q("select * from organization_members where organization_id = $1", [o.id])).length, 0);
});
