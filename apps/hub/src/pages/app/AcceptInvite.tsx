import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { orgs } from "../../lib/api";
import { Alert, Button, Icon, Spinner, Wordmark, useLoad } from "../../components/ui";
import { roleHelp, roleLabel } from "./Organizations";

/** /invite/:token — accept an organization invitation (requires sign-in with the invited email). */
export function AcceptInvite() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const { profile, refresh, signOut } = useAuth();
  const preview = useLoad(() => orgs.previewInvitation(token), [token]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = preview.data;
  const wrongEmail = p?.email && profile && p.email.toLowerCase() !== profile.email.toLowerCase();

  return (
    <div className="redirect-screen">
      <Wordmark />
      <div className="redirect-card stack">
        {!p ? (preview.error ? <Alert>{preview.error}</Alert> : <Spinner label="Checking invitation" />)
          : p.state !== "open" ? (
            <>
              <h2>{p.state === "expired" ? "This invitation has expired" : p.state === "used" ? "This invitation was already used" : "This invitation link isn't valid"}</h2>
              <p className="dim">Ask the organization's owner or admin for a new link.</p>
              <Link to="/app" className="btn btn-ghost">Go to my account</Link>
            </>
          ) : (
            <>
              <span className="redirect-icon m-bundle"><Icon name="building" size={28} /></span>
              <p className="dim">You're invited to join</p>
              <h2>{p.organization_name}</h2>
              <p className="dim small">as <strong>{roleLabel[p.role!]}</strong>: {roleHelp[p.role!]}</p>
              {wrongEmail ? (
                <>
                  <Alert>This invitation is for <strong>{p.email}</strong>, but you're signed in as {profile!.email}.</Alert>
                  <Button variant="ghost" onClick={async () => { await signOut(); nav("/login", { state: { from: `/invite/${token}` } }); }}>Sign in with a different account</Button>
                </>
              ) : (
                <>
                  {err && <Alert>{err}</Alert>}
                  <Button loading={busy} onClick={async () => {
                    setBusy(true); setErr(null);
                    try { const id = await orgs.acceptInvitation(token); await refresh(); nav(`/app/orgs/${id}`, { replace: true }); }
                    catch (e) { setErr(e instanceof Error ? e.message : "Could not accept the invitation."); }
                    finally { setBusy(false); }
                  }}>Join {p.organization_name}</Button>
                  <Link to="/app" className="small dim">Not now</Link>
                </>
              )}
            </>
          )}
      </div>
    </div>
  );
}
