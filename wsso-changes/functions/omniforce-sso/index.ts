// POST { ticket } → { token_hash, email, redirect_to }
// The WSSO page /sso/omniforce sends the ticket here, then calls
// supabase.auth.verifyOtp({ type: "magiclink", token_hash }) to start a normal WSSO session.
// Deploy with --no-verify-jwt (the visitor has no WSSO session yet).
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { admin, cors, json, upsertMember } from "../_shared.ts";

const JWKS = createRemoteJWKSet(new URL(Deno.env.get("OMNIFORCE_JWKS_URL") ?? "https://<hub-ref>.supabase.co/functions/v1/sso-jwks"));
const ISSUER = Deno.env.get("OMNIFORCE_ISSUER") ?? "https://account.omniforce.app";
const APP = Deno.env.get("WSSO_APP_ORIGIN") ?? "https://wsso.tlbisbig.world";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { ticket } = await req.json();
    if (typeof ticket !== "string") return json({ error: "Missing sign-in ticket." }, 400);

    // signature, issuer, audience, expiry (60s, 10s clock skew)
    const { payload } = await jwtVerify(ticket, JWKS, { issuer: ISSUER, audience: "wsso", clockTolerance: 10, algorithms: ["ES256"] });
    const ofId = String(payload.sub);
    if (!payload.jti || payload.of_id !== ofId) return json({ error: "Invalid sign-in ticket." }, 401);
    if (payload.entitlement === "canceled") return json({ error: "WSSO isn't in your OmniForce plan." }, 402);

    // single use
    const { error: replay } = await admin.from("omniforce_sso_nonces").insert({ jti: payload.jti, of_id: ofId, expires_at: new Date((payload.exp ?? 0) * 1000).toISOString() });
    if (replay) return json({ error: "This sign-in link was already used. Open WSSO from OmniForce again." }, 401);

    const member = await upsertMember({
      omniforce_user_id: ofId, email: String(payload.email), first_name: String(payload.given_name ?? ""), last_name: String(payload.family_name ?? ""),
      company_name: (payload.company as string) ?? null,
    });

    const { data: u } = await admin.from("users").select("is_active").eq("id", member.wsso_user_id).single();
    if (!u?.is_active) return json({ error: "Your WSSO access is disabled. Ask your workspace admin." }, 403);

    // one-time login token for this user (never emailed — returned to the browser that holds the ticket)
    const { data: au } = await admin.auth.admin.getUserById(member.wsso_user_id);
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: au.user?.email ?? String(payload.email) });
    if (error) throw error;

    const rt = typeof payload.return_to === "string" && payload.return_to.startsWith("/") && !payload.return_to.startsWith("//") ? payload.return_to : "/";
    return json({ token_hash: link.properties.hashed_token, email: au.user?.email ?? payload.email, redirect_to: `${APP}${rt}` });
  } catch (e) {
    console.error(e);
    const msg = String((e as Error).message ?? "");
    if (/exp|signature|claim|JWS|JWT/i.test(msg)) return json({ error: "This sign-in link expired. Open WSSO from OmniForce again." }, 401);
    return json({ error: "We couldn't sign you in. Try again from OmniForce." }, 500);
  }
});
