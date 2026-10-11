// Signing keys and JWTs issued by OmniForce (ES256). Public keys are published
// at <issuer>/jwks (and the legacy sso-jwks function). Rotation: generate a new
// key, move the old PUBLIC key into SSO_PREVIOUS_PUBLIC_JWKS, deploy, wait for
// the longest token TTL, then drop it.
import { createLocalJWKSet, importJWK, jwtVerify, SignJWT, type JWK, type JWTPayload } from "npm:jose@5.9.6";
import { HttpError } from "./errors.ts";

export function issuer(): string {
  const v = (Deno.env.get("SSO_ISSUER") ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+/.test(v) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(v)) {
    throw new HttpError(503, "Sign-in is not configured.", "not_configured");
  }
  return v;
}

function privateJwk(): JWK & { kid: string } {
  let jwk: JWK;
  try {
    jwk = JSON.parse(Deno.env.get("SSO_PRIVATE_JWK") ?? "");
  } catch {
    throw new HttpError(503, "Sign-in is not configured.", "not_configured");
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y || !jwk.kid) {
    throw new HttpError(503, "Sign-in is not configured.", "not_configured");
  }
  return jwk as JWK & { kid: string };
}

const toPublic = ({ d: _d, key_ops: _k, ext: _e, ...pub }: JWK): JWK => ({ ...pub, use: "sig", alg: "ES256" });

export function publicJwks(): { keys: JWK[] } {
  const keys = [toPublic(privateJwk())];
  try {
    const prev = JSON.parse(Deno.env.get("SSO_PREVIOUS_PUBLIC_JWKS") ?? "[]");
    for (const k of Array.isArray(prev) ? prev : prev.keys ?? []) if (k?.kid && !k.d) keys.push(toPublic(k));
  } catch { /* ignore malformed rotation list */ }
  return { keys };
}

export async function signJwt(
  claims: Record<string, unknown>,
  opts: { audience: string; subject: string; ttlSeconds: number; typ?: string },
) {
  const jwk = privateJwk();
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: jwk.kid, typ: opts.typ ?? "JWT" })
    .setIssuer(issuer())
    .setAudience(opts.audience)
    .setSubject(opts.subject)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds}s`)
    .sign(await importJWK(jwk, "ES256"));
}

export async function verifyJwt(token: string, opts: { audience: string; typ?: string }): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, createLocalJWKSet(publicJwks()), {
    issuer: issuer(),
    audience: opts.audience,
    algorithms: ["ES256"],
    typ: opts.typ,
    clockTolerance: 5,
  });
  return payload;
}
