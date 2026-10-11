import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.75.0";
import { HttpError, safeEqual, sha256Hex } from "./errors.ts";

export { HttpError, safeEqual };
export const sha256 = sha256Hex;

/** Service-role client: bypasses RLS. Only use server-side. */
export const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Resolve the signed-in user from the request's Authorization header. */
export async function requireUser(req: Request): Promise<User> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sign in first.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");
  return data.user;
}

export async function requireAdmin(req: Request): Promise<User> {
  const user = await requireUser(req);
  const { data } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) throw new HttpError(403, "Admin access required.");
  return user;
}

/** Call a SQL function with the service role; throws on error. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function audit(actor: string | null, action: string, target_type: string, target_id: string, details: Record<string, unknown> = {}) {
  await admin.from("audit_log").insert({ actor_id: actor, action, target_type, target_id, details });
}
