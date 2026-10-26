import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../../lib/api";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Button, Field, PasswordInput } from "../../components/ui";
import { DEMO } from "../../lib/supabase";

export function Login() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(DEMO ? "avery@skylineaerial.example" : "");
  const [password, setPassword] = useState(DEMO ? "demo-password-1" : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(params.get("disabled") ? "This account is disabled. Contact support to restore access." : null);
  const reset = params.get("reset") === "1";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await auth.signIn(email, password);
      await refresh();
      // Smart redirect unless the user was sent here from a specific page (same-app paths only)
      const from = loc.state?.from;
      const safe = typeof from === "string" && /^\/(?![/\\])/.test(from) && from !== "/app";
      nav(safe ? from : "/go", { replace: true });
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setErr(/confirm/i.test(m) ? "Verify your email first. Create the account again to get a new 6-digit code."
        : /invalid login credentials/i.test(m) || !m ? "Email or password is incorrect."
        : `Couldn't sign you in: ${m}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" aria-describedby={err ? "login-err" : undefined}>
      <div className="stack-sm">
        <p className="step-tag">Welcome back</p>
        <h2>Sign in to Omni Force Vector</h2>
        <p className="dim">Manage your organizations, plans and access to every product.</p>
      </div>
      {reset && <Alert tone="ok">Your password was changed. Sign in with the new one.</Alert>}
      {loc.state?.from?.startsWith("/oauth/authorize") && <Alert tone="info">An application asked you to sign in with Omni Force Vector. You'll continue there afterwards.</Alert>}
      {err && <div id="login-err"><Alert>{err}</Alert></div>}
      <Field label="Email"><input id="li-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
      <Field label="Password">
        <PasswordInput id="li-password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <div className="row-between small">
        <span />
        <Link to="/forgot">Forgot password?</Link>
      </div>
      <Button type="submit" loading={busy} className="btn-block btn-lg">Sign in</Button>
      <p className="dim small center">New to Omni Force Vector? <Link to="/signup">Create an account</Link></p>
    </form>
  );
}
