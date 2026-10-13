import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { ApiError, oauth } from "../../lib/api";
import { Alert, Button, Wordmark } from "../../components/ui";

const PARAMS = ["client_id", "redirect_uri", "response_type", "scope", "state", "nonce", "code_challenge", "code_challenge_method"] as const;

/**
 * /oauth/authorize — the browser-facing authorization endpoint for applications
 * that sign in with Omni Force Vector (see docs/INTEGRATION_AUTH.md). The signed-in user
 * is checked server-side (account, verified email, module access); the code goes
 * only to a redirect_uri registered for that client. Errors about the client or
 * redirect_uri are shown here and never redirected.
 */
export function OAuthAuthorize() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { profile, signOut } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [orgChoices, setOrgChoices] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(true);
  const hint = params.get("login_hint");
  const otherAccount = !!hint && !!profile && hint !== profile.omniforce_id && hint.toLowerCase() !== profile.email.toLowerCase();
  const [confirmedAccount, setConfirmedAccount] = useState(false);

  const run = useCallback(async (organizationId?: string) => {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, string | null> = Object.fromEntries(PARAMS.map((k) => [k, params.get(k)]));
      if (organizationId) body.organization_id = organizationId;
      const { redirect_to } = await oauth.authorize(body);
      window.location.replace(redirect_to);
    } catch (e) {
      if (e instanceof ApiError && e.code === "organization_required" && Array.isArray(e.extra.organizations)) {
        setOrgChoices(e.extra.organizations as { id: string; name: string }[]);
      } else {
        setErr(e instanceof Error ? e.message : "Sign-in could not be completed.");
      }
      setBusy(false);
    }
  }, [params]);

  useEffect(() => {
    if (!otherAccount || confirmedAccount) run();
    else setBusy(false);
  }, [run, otherAccount, confirmedAccount]);

  return (
    <div className="redirect-screen">
      <Wordmark />
      <div className="redirect-card stack">
        {otherAccount && !confirmedAccount ? (
          <>
            <h2>Continue as {profile!.first_name}?</h2>
            <p className="dim small">The application asked for <span className="mono">{hint}</span>, but you're signed in as {profile!.email}.</p>
            <Button onClick={() => setConfirmedAccount(true)}>Continue as {profile!.email}</Button>
            <Button variant="ghost" onClick={async () => { await signOut(); nav("/login", { state: { from: `/oauth/authorize?${params}` } }); }}>Use another account</Button>
          </>
        ) : orgChoices ? (
          <>
            <h2>Which organization?</h2>
            <p className="dim small">You have access to this application through these organizations.</p>
            {orgChoices.map((o) => <Button key={o.id} variant="ghost" className="btn-block" onClick={() => { setOrgChoices(null); run(o.id); }}>{o.name}</Button>)}
          </>
        ) : err ? (
          <>
            <h2>Can't sign you in</h2>
            <Alert>{err}</Alert>
            <Link to="/app">Go to my Omni Force Vector account</Link>
          </>
        ) : (
          <>{busy && <span className="spin spin-lg" />}<p className="dim">Signing you in…</p></>
        )}
      </div>
    </div>
  );
}
