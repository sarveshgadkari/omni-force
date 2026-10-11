import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setup, makeAdmin } from "./harness.mjs";

const t = await setup(after);
const admin = await makeAdmin(t);
const ann = await t.user("ann@x.test");
const bob = await t.user("bob@x.test");

const link = (u, m, ext, method) => t.one("select * from public.record_identity_link($1, $2, $3, $4)", [u, m, ext, method]);

test("an email match only creates a review candidate", async () => {
  const l = await link(ann, "wsso", "wsso-profile-ann", "verified_email");
  assert.equal(l.status, "pending_review");
  assert.equal(l.verified_at, null);
});

test("an external account can't be linked to two OmniForce users", async () => {
  await t.rejects(link(bob, "wsso", "wsso-profile-ann", "admin"), /external_account_linked_to_other_user/);
});

test("a user's existing link is never silently re-pointed", async () => {
  await t.rejects(link(ann, "wsso", "wsso-profile-OTHER", "provisioned"), /user_already_linked_to_other_account/);
});

test("platform admin approves a candidate; proof upgrades but never downgrades", async () => {
  const { id } = await t.one("select id from identity_links where user_id = $1 and module_key = 'wsso'", [ann]);
  await t.rejects(t.as(ann, "select public.admin_review_identity_link($1, true)", [id]), /forbidden/);
  await t.as(admin, "select public.admin_review_identity_link($1, true, 'checked with WSSO support')", [id]);
  const l = await t.one("select * from identity_links where id = $1", [id]);
  assert.equal(l.status, "linked");
  assert.equal(l.verified_by, admin);
  assert.equal((await link(ann, "wsso", "wsso-profile-ann", "verified_email")).status, "linked");
});

test("rejecting a candidate removes it", async () => {
  await link(bob, "directory", "bd-77", "verified_email");
  const { id } = await t.one("select id from identity_links where user_id = $1 and module_key = 'directory'", [bob]);
  await t.as(admin, "select public.admin_review_identity_link($1, false, 'different person')", [id]);
  assert.equal((await t.q("select * from identity_links where id = $1", [id])).length, 0);
  const a = await t.one("select details from audit_log where action = 'identity_link.reject'");
  assert.equal(a.details.external_id, "bd-77");
});

test("admin links need a reason; users can't write links directly", async () => {
  await t.rejects(t.as(admin, "select public.admin_link_identity($1, 'directory', 'bd-1', '')", [bob]), /reason_required/);
  await t.as(admin, "select public.admin_link_identity($1, 'directory', 'bd-1', 'ticket #4411')", [bob]);
  await t.rejects(t.as(bob, "insert into identity_links (user_id, module_key, external_id, status) values ($1, 'wsso', 'mine', 'pending')", [bob]), /permission denied/);
  await t.rejects(t.as(bob, "update identity_links set external_id = 'x' where user_id = $1", [bob]), /permission denied/);
  await t.rejects(t.as(bob, "select public.record_identity_link($1, 'wsso', 'x', 'admin')", [bob]), /permission denied/);
});

test("organization links: one external organization per OmniForce organization and vice versa", async () => {
  const [o1] = await t.as(ann, "select * from public.create_organization('Org One')");
  const [o2] = await t.as(bob, "select * from public.create_organization('Org Two')");
  await t.as(admin, "select public.admin_link_organization($1, 'wsso', 'wsso-org-1', 'migration plan row 3')", [o1.id]);
  await t.rejects(t.as(admin, "select public.admin_link_organization($1, 'wsso', 'wsso-org-1', 'duplicate attempt')", [o2.id]), /external_org_linked_to_other_organization/);
  await t.rejects(t.as(admin, "select public.admin_link_organization($1, 'wsso', 'wsso-org-9', 'repoint attempt')", [o1.id]), /organization_already_linked_to_other_account/);
  assert.equal((await t.as(ann, "select * from organization_links")).length, 1);
  assert.equal((await t.as(bob, "select * from organization_links")).length, 0);
});

test("a 'linked' row always carries its proof", async () => {
  await t.rejects(t.q("insert into identity_links (user_id, module_key, status) values ($1, 'workforce', 'linked')", [bob]), /identity_links_linked_has_proof/);
});
