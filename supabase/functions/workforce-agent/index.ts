// Called by an on-prem Workforce 2.0 server. Deploy with --no-verify-jwt.
// POST { action: "activate", license_key, hostname, version } → { installation_id, mcp_url, mcp_token }
// POST { action: "heartbeat" } with Authorization: Bearer <mcp_token>   → { status, offline_grace_hours }
import { json, fail } from "../_shared/cors.ts";
import { admin, sha256 } from "../_shared/db.ts";

const HUB = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));

  if (body.action === "activate") {
    const { data: inst } = await admin.from("workforce_installations").select("*").eq("license_key_hash", await sha256(String(body.license_key ?? ""))).maybeSingle();
    if (!inst || inst.status === "revoked") return fail("Licence key not recognised or revoked.", 403);
    const token = `wfmcp_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    await admin.from("workforce_installations").update({
      status: "active", mcp_token_hash: await sha256(token), hostname: String(body.hostname ?? "").slice(0, 120) || null,
      version: String(body.version ?? "").slice(0, 32) || null, last_seen_at: new Date().toISOString(),
    }).eq("id", inst.id);
    return json({ installation_id: inst.id, mcp_url: `${HUB}/functions/v1/mcp`, mcp_token: token });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: inst } = await admin.from("workforce_installations").select("id, status").eq("mcp_token_hash", await sha256(token)).maybeSingle();
  if (!inst) return fail("Unknown installation.", 401);
  if (body.action === "heartbeat") {
    await admin.from("workforce_installations").update({ last_seen_at: new Date().toISOString(), version: body.version ?? undefined }).eq("id", inst.id);
    return json({ status: inst.status, offline_grace_hours: 72 });
  }
  return fail("Unknown action.");
});
