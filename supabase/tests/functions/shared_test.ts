// Unit tests for the edge functions' pure security logic (no network, no database).
// Run: npm run test:functions
import { assert, assertEquals, assertFalse, assertRejects, assertThrows } from "jsr:@std/assert@1.0.13";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "npm:jose@5.9.6";
import { HttpError, requireSecret, safeEqual, sha256Hex } from "../../functions/_shared/errors.ts";
import { issuer, publicJwks, signJwt, verifyJwt } from "../../functions/_shared/keys.ts";
import { clientCredentials, parseScope, pkceS256, randomToken, subpath, withParams } from "../../functions/_shared/oauth.ts";
import { isHubUrl } from "../../functions/_shared/urls.ts";
import { hmacHex, verifySignedRequest } from "../../functions/_shared/wsso.ts";

async function newKey(kid: string) {
  const { privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  delete jwk.key_ops; delete jwk.ext;
  return { ...jwk, kid };
}

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

const ISS = "https://hub.example.test/functions/v1/oidc";

Deno.test("requireSecret fails closed on missing or short secrets", withEnv({ T_SECRET: undefined }, () => {
  assertThrows(() => requireSecret("T_SECRET"), HttpError, "not configured");
  Deno.env.set("T_SECRET", "!");
  assertThrows(() => requireSecret("T_SECRET"), HttpError);
  Deno.env.set("T_SECRET", "x".repeat(32));
  assertEquals(requireSecret("T_SECRET"), "x".repeat(32));
}));

Deno.test("safeEqual", () => {
  assert(safeEqual("abc", "abc"));
  assertFalse(safeEqual("abc", "abd"));
  assertFalse(safeEqual("abc", "abcd"));
  assertFalse(safeEqual("", "!"));
});

Deno.test("signing is unavailable until a key and issuer are configured", withEnv({ SSO_PRIVATE_JWK: undefined, SSO_ISSUER: ISS }, async () => {
  assertThrows(() => publicJwks(), HttpError);
  await assertRejects(() => signJwt({}, { audience: "a", subject: "s", ttlSeconds: 60 }), HttpError);
  Deno.env.set("SSO_PRIVATE_JWK", JSON.stringify({ kty: "EC", crv: "P-256", x: "x", y: "y" })); // no d / kid
  assertThrows(() => publicJwks(), HttpError);
}));

Deno.test("issuer must be https (or localhost http)", withEnv({ SSO_ISSUER: "http://evil.test" }, () => {
  assertThrows(() => issuer(), HttpError);
  Deno.env.set("SSO_ISSUER", "http://localhost:54321/functions/v1/oidc/");
  assertEquals(issuer(), "http://localhost:54321/functions/v1/oidc");
}));

Deno.test("id tokens verify against the published JWKS; private key never published", async () => {
  const key = await newKey("of-test-1");
  await withEnv({ SSO_PRIVATE_JWK: JSON.stringify(key), SSO_ISSUER: ISS, SSO_PREVIOUS_PUBLIC_JWKS: undefined }, async () => {
    const jwks = publicJwks();
    assertEquals(jwks.keys.length, 1);
    assertEquals(jwks.keys[0].d, undefined);
    assertEquals(jwks.keys[0].kid, "of-test-1");

    const t = await signJwt({ email: "a@b.test", nonce: "n1" }, { audience: "ofc_client", subject: "OF-0001000", ttlSeconds: 300 });
    assertEquals(decodeProtectedHeader(t), { alg: "ES256", kid: "of-test-1", typ: "JWT" });
    // what a relying party does with the discovery document's jwks_uri
    const { payload } = await jwtVerify(t, createLocalJWKSet(jwks), { issuer: ISS, audience: "ofc_client", algorithms: ["ES256"] });
    assertEquals(payload.sub, "OF-0001000");
    assertEquals(payload.nonce, "n1");
    assert(payload.jti && payload.exp! - payload.iat! === 300);
    await assertRejects(() => jwtVerify(t, createLocalJWKSet(jwks), { issuer: ISS, audience: "other_client" }));
  })();
});

Deno.test("access tokens require their typ and audience", async () => {
  const key = await newKey("of-test-2");
  await withEnv({ SSO_PRIVATE_JWK: JSON.stringify(key), SSO_ISSUER: ISS }, async () => {
    const at = await signJwt({ client_id: "c", scope: "openid" }, { audience: `${ISS}/userinfo`, subject: "OF-1", ttlSeconds: 300, typ: "at+jwt" });
    assertEquals((await verifyJwt(at, { audience: `${ISS}/userinfo`, typ: "at+jwt" })).sub, "OF-1");
    // an id_token can't be used as an access token
    const idt = await signJwt({}, { audience: `${ISS}/userinfo`, subject: "OF-1", ttlSeconds: 300 });
    await assertRejects(() => verifyJwt(idt, { audience: `${ISS}/userinfo`, typ: "at+jwt" }));
  })();
});

Deno.test("key rotation: tokens from the previous key still verify while it is listed", async () => {
  const oldKey = await newKey("of-old");
  const newK = await newKey("of-new");
  let oldToken = "";
  await withEnv({ SSO_PRIVATE_JWK: JSON.stringify(oldKey), SSO_ISSUER: ISS }, async () => {
    oldToken = await signJwt({}, { audience: "a", subject: "s", ttlSeconds: 300 });
  })();
  const { d: _d, ...oldPub } = oldKey;
  await withEnv({ SSO_PRIVATE_JWK: JSON.stringify(newK), SSO_ISSUER: ISS, SSO_PREVIOUS_PUBLIC_JWKS: JSON.stringify([oldPub, { ...oldKey, kid: "leak" }]) }, async () => {
    const keys = publicJwks().keys;
    assertEquals(keys.map((k) => k.kid), ["of-new", "of-old"]); // entries carrying a private part are ignored
    assertEquals((await verifyJwt(oldToken, { audience: "a" })).sub, "s");
  })();
  await withEnv({ SSO_PRIVATE_JWK: JSON.stringify(newK), SSO_ISSUER: ISS, SSO_PREVIOUS_PUBLIC_JWKS: undefined }, async () => {
    await assertRejects(() => verifyJwt(oldToken, { audience: "a" }));
  })();
});

Deno.test("PKCE S256 matches RFC 7636 appendix B and the SQL implementation's encoding", async () => {
  assertEquals(await pkceS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert(/^[A-Za-z0-9_-]{43}$/.test(randomToken(32)));
});

Deno.test("client credentials: Basic or body, never both", () => {
  const basic = (id: string, s: string) => new Request("https://x/token", { headers: { authorization: `Basic ${btoa(`${encodeURIComponent(id)}:${encodeURIComponent(s)}`)}` } });
  assertEquals(clientCredentials(basic("ofc_1", "ofs_a:b"), {}), { id: "ofc_1", secret: "ofs_a:b", basic: true });
  assertEquals(clientCredentials(basic("ofc_1", "s"), { client_secret: "s2" }), null);
  assertEquals(clientCredentials(new Request("https://x"), { client_id: "c", client_secret: "s" }), { id: "c", secret: "s", basic: false });
  assertEquals(clientCredentials(new Request("https://x"), { client_id: "c" }), null);
  assertEquals(clientCredentials(new Request("https://x", { headers: { authorization: "Basic !!!" } }), {}), null);
});

Deno.test("scope parsing, redirect building and routing", () => {
  assertEquals(parseScope("openid  profile openid email"), ["openid", "profile", "email"]);
  assertEquals(parseScope(42), []);
  assertEquals(withParams("https://app.test/cb?x=1", { code: "c", state: null, iss: ISS }), `https://app.test/cb?x=1&code=c&iss=${encodeURIComponent(ISS)}`);
  assertEquals(subpath("https://ref.supabase.co/functions/v1/oidc/.well-known/openid-configuration", "oidc"), "/.well-known/openid-configuration");
  assertEquals(subpath("http://localhost/oidc/token/", "oidc"), "/token");
  assertEquals(subpath("http://localhost/oidc", "oidc"), "/");
});

Deno.test("hub return URLs: exact origin only, fail closed", () => {
  const origins = ["https://account.omniforce.app", "http://localhost:5173"];
  assert(isHubUrl("https://account.omniforce.app/checkout/success", origins));
  assert(isHubUrl("http://localhost:5173/plans", origins));
  assertFalse(isHubUrl("https://account.omniforce.app.evil.test/x", origins));
  assertFalse(isHubUrl("https://evil.test/?https://account.omniforce.app", origins));
  assertFalse(isHubUrl("javascript:alert(1)", origins));
  assertFalse(isHubUrl("https://account.omniforce.app/x", []));
});

Deno.test("signed webhooks: valid, tampered, stale, and wrong-secret requests", async () => {
  const secret = "s".repeat(40);
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));
  const body = JSON.stringify({ event: "member.updated" });
  const sig = await hmacHex(secret, `${ts}.${body}`);
  assert(await verifySignedRequest(body, ts, sig, secret, now));
  assertFalse(await verifySignedRequest(body + " ", ts, sig, secret, now));
  assertFalse(await verifySignedRequest(body, ts, sig, "t".repeat(40), now));
  assertFalse(await verifySignedRequest(body, ts, sig, secret, now + 301_000));
  assertFalse(await verifySignedRequest(body, "abc", sig, secret, now));
});

Deno.test("sha256Hex matches the SQL sha256_hex used for stored hashes", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
