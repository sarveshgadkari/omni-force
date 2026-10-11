// node scripts/gen-sso-key.mjs
//   stdout: ES256 private JWK for SSO_PRIVATE_JWK
//   stderr: the matching public JWK (keep it: it goes into SSO_PREVIOUS_PUBLIC_JWKS when you rotate)
const { privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
delete jwk.key_ops; delete jwk.ext;
jwk.kid = `of-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 4)}`;
const { d: _d, ...pub } = jwk;
console.log(JSON.stringify(jwk));
console.error(`public: ${JSON.stringify(pub)}`);
