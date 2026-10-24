// POST { module: "directory" | "wsso", target_link_uri? } → { url }
//
// Directory: token SSO. After entitlement + sso_status checks, the hub fetches a
// DirectoryUp login token and sends the browser to /login/token/{token}.
// WSSO: OIDC third-party-initiated login (initiate_login_uri). No credential in
// that URL. Until WSSO SSO is verified, this returns 409 sso_unavailable.
import { serve } from "../_shared/handler.ts";
import { json } from "../_shared/cors.ts";
import { admin, HttpError, requireUser, rpc } from "../_shared/db.ts";
import { directoryup } from "../_shared/directoryup.ts";
import { issuer } from "../_shared/keys.ts";
import { provision } from "../_shared/provision.ts";

type LaunchTarget = {
  error?: string;
  app_url?: string;
  module_name?: string;
  initiate_login_uri?: string;
  protocol?: string;
};

async function directoryLogin(userId: string, appUrl: string | null) {
  const { data: link } = await admin.from("identity_links")
    .select("external_id, status")
    .eq("user_id", userId)
    .eq("module_key", "directory")
    .maybeSingle();

  let memberId = link?.status === "linked" ? String(link.external_id) : "";

  if (!memberId) {
    try {
      const result = await provision(userId, "directory");
      if (result && "external_id" in result && result.external_id) memberId = String(result.external_id);
      if (result && "skipped" in result && result.skipped === "link_pending_review") {
        throw new HttpError(409, "This Directory listing already exists and is waiting for an administrator to confirm it is yours.",
          "sso_unavailable", { app_url: appUrl });
      }
      if (result && "skipped" in result && result.skipped === "email_unverified") {
        throw new HttpError(403, "Verify your email before opening the Directory.");
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/provisioning for directory is disabled/i.test(msg)) {
        throw new HttpError(409, "Your Directory member is not linked yet. An administrator needs to enable Directory provisioning, or you can sign in on the Directory site.",
          "sso_unavailable", { app_url: appUrl });
      }
      throw new HttpError(502, `Couldn't open the Directory: ${msg}`, "directory_sso_failed", { app_url: appUrl });
    }
  }

  if (!memberId) {
    throw new HttpError(409, "Your Directory member is not linked yet. Sign in on the Directory site, or ask an administrator to enable Directory provisioning.",
      "sso_unavailable", { app_url: appUrl });
  }

  try {
    const token = await directoryup.loginToken(memberId);
    return directoryup.loginUrl(token);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new HttpError(502, `Couldn't open the Directory: ${msg}`, "directory_sso_failed", { app_url: appUrl });
  }
}

serve(async (req) => {
  const user = await requireUser(req);
  const { module, target_link_uri } = await req.json().catch(() => ({}));
  if (module !== "directory" && module !== "wsso") throw new HttpError(400, "That module doesn't use web sign-in.");

  const { data: p } = await admin.from("profiles").select("omniforce_id, status").eq("id", user.id).single();
  if (!p || p.status !== "active") throw new HttpError(403, "This account is disabled.");

  const t = await rpc<LaunchTarget>("sso_launch_target", { p_user: user.id, p_module: module });
  if (t.error === "not_entitled") throw new HttpError(402, "This module isn't in your plan. Add it from Plans and billing.", "not_entitled");
  if (t.error === "sso_unavailable") {
    throw new HttpError(409, `Signing in to ${t.module_name ?? "this module"} with OmniForce isn't available yet. Sign in there directly with your existing login.`,
      "sso_unavailable", { app_url: t.app_url ?? null });
  }

  if (t.protocol === "directory_token") {
    const url = await directoryLogin(user.id, t.app_url ?? null);
    await admin.from("profiles").update({ last_module: "directory" }).eq("id", user.id);
    return json({ url });
  }

  if (t.error || !t.initiate_login_uri) throw new HttpError(400, "Unknown module.");

  const url = new URL(t.initiate_login_uri);
  url.searchParams.set("iss", issuer());
  url.searchParams.set("login_hint", p.omniforce_id);
  if (typeof target_link_uri === "string") {
    try {
      const target = new URL(target_link_uri);
      if (target.origin === url.origin) url.searchParams.set("target_link_uri", target.toString());
    } catch { /* ignore invalid target */ }
  }
  await admin.from("profiles").update({ last_module: module }).eq("id", user.id);
  return json({ url: url.toString() });
});
