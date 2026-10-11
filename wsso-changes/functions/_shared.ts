// Shared helpers for the WSSO-side OmniForce functions. Copy into supabase/functions/_shared/omniforce.ts in WSSO.
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

export const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("WSSO_APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

export async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Find or create the WSSO auth user + users row + workspace for an OmniForce identity. */
export async function upsertMember(m: {
  omniforce_user_id: string; email: string; first_name: string; last_name: string; company_name: string | null;
  plan_code?: string | null; seats?: number | null; status?: string; valid_until?: string | null;
}) {
  const full_name = `${m.first_name} ${m.last_name}`.trim() || m.email;

  // 1) already linked?
  let { data: row } = await admin.from("users").select("id, company_id").eq("omniforce_user_id", m.omniforce_user_id).maybeSingle();

  // 2) existing WSSO user with the same (OmniForce-verified) email → link it
  if (!row) {
    const { data: byEmail } = await admin.from("users").select("id, company_id, omniforce_user_id").ilike("email", m.email).maybeSingle();
    if (byEmail && !byEmail.omniforce_user_id) {
      await admin.from("users").update({ omniforce_user_id: m.omniforce_user_id, auth_source: "omniforce", omniforce_linked_at: new Date().toISOString() }).eq("id", byEmail.id);
      row = byEmail;
    }
  }

  // 3) brand-new: auth user, workspace, admin role, users row
  if (!row) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: m.email, email_confirm: true, user_metadata: { full_name, omniforce_user_id: m.omniforce_user_id },
    });
    if (error) throw new Error(`auth.createUser: ${error.message}`);
    const authId = created.user.id;

    const { data: company, error: cErr } = await admin.from("companies")
      .insert({ name: m.company_name || `${full_name}'s workspace`, omniforce_owner_id: m.omniforce_user_id, billing_source: "omniforce" })
      .select("id").single();
    if (cErr) throw cErr;

    // ADAPT: how WSSO seeds roles for a new workspace. Here we look for an "admin" role.
    const { data: role } = await admin.from("roles").select("id").eq("company_id", company.id).ilike("name", "admin").maybeSingle();

    const { error: uErr } = await admin.from("users").insert({
      id: authId, company_id: company.id, role_id: role?.id ?? null, full_name, email: m.email, is_active: true, is_company_admin: true,
      omniforce_user_id: m.omniforce_user_id, auth_source: "omniforce", omniforce_linked_at: new Date().toISOString(),
    });
    if (uErr) throw uErr;
    row = { id: authId, company_id: company.id };
  } else {
    await admin.from("users").update({ full_name, email: m.email, is_active: true }).eq("id", row.id);
    await admin.auth.admin.updateUserById(row.id, { email: m.email, ban_duration: "none" });
  }

  // plan + seats only on the workspace this person owns
  if (m.plan_code !== undefined) {
    await admin.from("companies").update({
      billing_source: "omniforce", omniforce_plan_code: m.plan_code, omniforce_seat_limit: m.seats ?? null,
      omniforce_status: m.status ?? "active", omniforce_valid_until: m.valid_until ?? null,
    }).eq("id", row.company_id).eq("omniforce_owner_id", m.omniforce_user_id);
  }
  return { wsso_user_id: row.id as string, company_id: row.company_id as string };
}
