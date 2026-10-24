import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { directoryup, pickDeep, siteOrigin } from "../../functions/_shared/directoryup.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  return async () => {
    const old: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
      old[k] = Deno.env.get(k);
      v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    }
    try { await fn(); } finally {
      for (const [k, v] of Object.entries(old)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    }
  };
}

const BASE = "https://drones-drones-drones.directoryup.com/api/v2";
const env = {
  DIRECTORYUP_API_BASE: BASE,
  DIRECTORYUP_API_KEY: "bd_test_key_long_enough",
  DIRECTORYUP_SITE_ORIGIN: undefined,
};

type Call = { url: string; method: string; contentType: string | null; body: string | null };
const calls: Call[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.test("pickDeep finds user_id and token in nested BD payloads", () => {
  assertEquals(pickDeep({ status: "success", message: { user_id: 41 } }, ["user_id"]), "41");
  assertEquals(pickDeep({ data: { profile: { token: "tok_abc" } } }, ["token", "user_token"]), "tok_abc");
  assertEquals(pickDeep({ message: [{ database_id: "77" }] }, ["database_id", "user_id"]), "77");
});

Deno.test("create then map omniforce_user_id uses form-urlencoded POSTs", withEnv(env, async () => {
  calls.length = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = String(input);
    const method = String(init?.method ?? "GET");
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : null;
    calls.push({ url, method, contentType: headers.get("Content-Type"), body });
    if (url.endsWith("/user/create")) return Promise.resolve(jsonResponse({ status: "success", message: { user_id: "41" } }));
    if (url.endsWith("/users_meta/create")) return Promise.resolve(jsonResponse({ status: "success" }));
    return Promise.resolve(jsonResponse({ status: "error", message: "unexpected " + url }, 500));
  };
  try {
    const created = await directoryup.create({ email: "pat@x.test", first_name: "Pat", last_name: "Pilot", subscription_id: "1" });
    assertEquals(created.user_id, "41");
    await directoryup.writeOmniforceId("41", "OF-0001000");
  } finally {
    globalThis.fetch = orig;
  }
  assertEquals(calls.length, 2);
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].url, `${BASE}/user/create`);
  assertEquals(calls[0].contentType, "application/x-www-form-urlencoded");
  assert(calls[0].body?.includes("email=pat%40x.test"));
  assert(calls[0].body?.includes("subscription_id=1"));
  assert(calls[0].body?.includes("password="));
  assert(!calls[0].body?.includes("omniforce_user_id"));
  assertEquals(calls[1].url, `${BASE}/users_meta/create`);
  assertEquals(calls[1].contentType, "application/x-www-form-urlencoded");
  assertEquals(calls[1].body, "database=users_data&database_id=41&key=omniforce_user_id&value=OF-0001000");
}));

Deno.test("SSO login token is fetched and turned into a Directory login URL", withEnv(env, async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (input) => {
    const url = String(input);
    assertStringIncludes(url, "/user/get/41?");
    assertStringIncludes(url, "include_user_token=1");
    return Promise.resolve(jsonResponse({ status: "success", message: { user_id: "41", token: "sess_abc" } }));
  };
  try {
    const token = await directoryup.loginToken("41");
    assertEquals(token, "sess_abc");
    assertEquals(directoryup.loginUrl(token), "https://drones-drones-drones.directoryup.com/login/token/sess_abc");
    assertEquals(siteOrigin(), "https://drones-drones-drones.directoryup.com");
  } finally {
    globalThis.fetch = orig;
  }
}));

Deno.test("create refuses a payload with no user_id", withEnv(env, async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(jsonResponse({ status: "success", message: "ok" }));
  try {
    await assertRejects(() => directoryup.create({ email: "a@b.test", first_name: "A", last_name: "B", subscription_id: "1" }), Error, "no user_id");
  } finally {
    globalThis.fetch = orig;
  }
}));
