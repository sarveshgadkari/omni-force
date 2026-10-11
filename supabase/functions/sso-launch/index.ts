// POST { module: "directory" | "wsso", target_link_uri? } → { url }
// Hub "Open module" button. Uses OIDC third-party-initiated login: the browser is
// sent to the application's registered initiate_login_uri, and the application
// then starts a normal authorization request (state + PKCE) against OmniForce.
// No credential travels in this URL.
//
// Until a module's SSO has been built and verified on the module's side
// (modules.sso_status), this returns 409 { code: "sso_unavailable", app_url }
// and the hub tells the user to sign in to the module directly.
//
// (Earlier versions pushed a signed ticket straight into the module and provisioned
// accounts here. Neither module implemented that ticket endpoint, so it was removed.)
import { serve } from "../_shared/handler.ts";
import { json } from "../_shared/cors.ts";
import { admin, HttpError, requireUser, rpc } from "../_shared/db.ts";
import { issuer } from "../_shared/keys.ts";

serve(async (req) => {
  const user = await requireUser(req);
  const { module, target_link_uri } = await req.json().catch(() => ({}));
  if (module !== "directory" && module !== "wsso") throw new HttpError(400, "That module doesn't use web sign-in.");

  const { data: p } = await admin.from("profiles").select("omniforce_id, status").eq("id", user.id).single();
  if (!p || p.status !== "active") throw new HttpError(403, "This account is disabled.");

  const t = await rpc<{ error?: string; app_url?: string; module_name?: string; initiate_login_uri?: string }>(
    "sso_launch_target", { p_user: user.id, p_module: module });
  if (t.error === "not_entitled") throw new HttpError(402, "This module isn't in your plan. Add it from Plans and billing.", "not_entitled");
  if (t.error === "sso_unavailable") {
    throw new HttpError(409, `Signing in to ${t.module_name ?? "this module"} with OmniForce isn't available yet. Sign in there directly with your existing login.`,
      "sso_unavailable", { app_url: t.app_url ?? null });
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
