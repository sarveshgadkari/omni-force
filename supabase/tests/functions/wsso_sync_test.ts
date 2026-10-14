// The sync worker's WSSO handler against the real migrations in PGlite: queued
// events → signed requests to WSSO's /api/omniforce/events, restating current access.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
// @ts-types="./harness.d.ts"
import { freshDb, plan } from "../db/harness.mjs";
import { fakeClient } from "./fake_supabase.ts";

const URL_ = "https://wsso.example.test/api/omniforce/events";
const SECRET = "e".repeat(40);
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
Deno.env.set("WSSO_EVENTS_URL", URL_);
Deno.env.set("WSSO_EVENTS_SECRET", SECRET);

const t = await freshDb();
const fake = fakeClient(t, new Map());
const { admin } = await import("../../functions/_shared/db.ts");
// deno-lint-ignore no-explicit-any
const a = admin as any;
a.rpc = fake.rpc;
a.from = fake.from;
const { syncWsso } = await import("../../functions/_shared/provision.ts");
const { verifySignedRequest } = await import("../../functions/_shared/wsso.ts");

// ── capture what WSSO would receive
// deno-lint-ignore no-explicit-any
let sent: any[] = [];
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  assertEquals(String(input), URL_);
  const h = new Headers(init?.headers);
  const raw = String(init?.body);
  assert(await verifySignedRequest(raw, h.get("x-omniforce-timestamp") ?? "", h.get("x-omniforce-signature") ?? "", SECRET), "signed");
  sent.push(JSON.parse(raw));
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

/** Run the handler for every queued WSSO event, like the worker does, and return what was sent. */
async function drain() {
  sent = [];
  const events = await t.q("select id, event_type, user_id, organization_id from integration_events where module_key = 'wsso' and status = 'queued' order by id");
  for (const e of events) {
    await syncWsso({ ...e, id: Number(e.id) });
    await t.q("update integration_events set status = 'sent' where id = $1", [e.id]);
  }
  // deno-lint-ignore no-explicit-any
  return sent.map(({ event_id: _id, ...rest }: any) => rest);
}

await t.q("update modules set provisioning_status = 'enabled' where key = 'wsso'");
const of = async (u: string) => (await t.one("select omniforce_id from profiles where id = $1", [u])).omniforce_id as string;

const solo = await t.user("solo@x.test");
const boss = await t.user("boss@crew.test");
const crew = await t.user("crew@crew.test");
const [org] = await t.q("insert into organizations (slug, name, created_by) values ('crew-co', 'Crew Co', $1) returning id", [boss]);
await t.q("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')", [org.id, boss, crew]);
const WSSO_ORG = crypto.randomUUID();

Deno.test("personal access: workspace plan and seats, and the person enabled there", async () => {
  await t.q("insert into entitlements (user_id, module_key, plan_id, status, source) values ($1, 'wsso', $2, 'active', 'admin')", [solo, await plan(t, "wsso_growth_month")]);
  const sub = await of(solo);
  assertEquals(await drain(), [
    { event: "access.updated", sub, access: { plan_ref: "growth", seats: 50 } },
    { event: "member.enabled", sub, scope: "personal" },
  ]);
});

Deno.test("organization access: the workspace, the owner's seat, then a member's seat", async () => {
  await t.q("insert into organization_links (organization_id, module_key, external_org_id, status, link_method) values ($1, 'wsso', $2, 'linked', 'admin')", [org.id, WSSO_ORG]);
  await t.q("insert into entitlements (organization_id, module_key, plan_id, status, source) values ($1, 'wsso', $2, 'active', 'admin')", [org.id, await plan(t, "wsso_business_month")]);
  const target = { omniforce_org_id: org.id, external_org_id: WSSO_ORG };
  assertEquals(await drain(), [
    { event: "member.enabled", sub: await of(boss), scope: "organization", ...target },
    { event: "access.updated", ...target, access: { plan_ref: "business", seats: 150 } },
  ]);
  await t.q("insert into organization_module_seats (organization_id, user_id, module_key) values ($1, $2, 'wsso')", [org.id, crew]);
  assertEquals(await drain(), [{ event: "member.enabled", sub: await of(crew), scope: "organization", ...target }]);
});

Deno.test("removing a seat or suspending a member disables them in that workspace only", async () => {
  const target = { omniforce_org_id: org.id, external_org_id: WSSO_ORG };
  await t.q("update organization_members set status = 'suspended' where organization_id = $1 and user_id = $2", [org.id, crew]);
  assertEquals(await drain(), [{ event: "member.disabled", sub: await of(crew), scope: "organization", ...target }]);
  await t.q("update organization_members set status = 'active' where organization_id = $1 and user_id = $2", [org.id, crew]);
  assertEquals(await drain(), [{ event: "member.enabled", sub: await of(crew), scope: "organization", ...target }]);
  await t.q("delete from organization_module_seats where organization_id = $1 and user_id = $2", [org.id, crew]);
  assertEquals(await drain(), [{ event: "member.disabled", sub: await of(crew), scope: "organization", ...target }]);
});

Deno.test("disabling the organization revokes the workspace", async () => {
  await t.q("update organizations set status = 'disabled' where id = $1", [org.id]);
  assertEquals(await drain(), [{ event: "access.revoked", omniforce_org_id: org.id, external_org_id: WSSO_ORG }]);
  await t.q("update organizations set status = 'active' where id = $1", [org.id]);
  assertEquals((await drain())[0].event, "access.updated");
});

Deno.test("a disabled account is blocked everywhere; re-enabling restates every workspace", async () => {
  const sub = await of(boss);
  await t.q("insert into identity_links (user_id, module_key, external_id, status, link_method) values ($1, 'wsso', $2, 'linked', 'app_assertion')", [boss, crypto.randomUUID()]);
  await t.q("update profiles set status = 'disabled' where id = $1", [boss]);
  assertEquals(await drain(), [{ event: "member.disabled", sub, scope: "account" }]);
  await t.q("update profiles set status = 'active' where id = $1", [boss]);
  assertEquals(await drain(), [
    { event: "access.revoked", sub },
    { event: "member.disabled", sub, scope: "personal" },
    { event: "member.enabled", sub, scope: "organization", omniforce_org_id: org.id, external_org_id: WSSO_ORG },
  ]);
});

Deno.test("an organization not linked to a workspace yet is identified by its OmniForce id", async () => {
  const [o2] = await t.q("insert into organizations (slug, name, created_by) values ('new-co', 'New Co', $1) returning id", [solo]);
  await t.q("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [o2.id, solo]);
  await t.q("insert into entitlements (organization_id, module_key, plan_id, status, source) values ($1, 'wsso', $2, 'active', 'admin')", [o2.id, await plan(t, "wsso_starter_month")]);
  const out = await drain();
  assertEquals(out[1], { event: "access.updated", omniforce_org_id: o2.id, access: { plan_ref: "starter", seats: 10 } });
});
