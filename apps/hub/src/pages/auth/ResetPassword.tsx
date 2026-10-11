import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { auth } from "../../lib/api";
import { Alert, Button, Field, PasswordInput, Spinner } from "../../components/ui";
import { passwordOk, StrengthMeter } from "./Signup";

/**
 * /reset-password — target of the emailed recovery link. Supabase signs the user in
 * from the link (detectSessionInUrl); this page then sets the new password.
 */
export function ResetPassword() {
  const nav = useNavigate();
  const { loading, profile, signOut } = useAuth();
  const fromLink = /[?#&](code|access_token|token_hash)=/.test(window.location.href);
  const [waited, setWaited] = useState(!fromLink);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // the session from the link can arrive a moment after the first render
  useEffect(() => { if (!fromLink) return; const t = setTimeout(() => setWaited(true), 4000); return () => clearTimeout(t); }, [fromLink]);

  if (loading || (!profile && !waited)) return <Spinner label="Checking your reset link" />;
  if (!profile) {
    return (
      <div className="stack">
        <div className="stack-sm">
          <p className="step-tag">Account recovery</p>
          <h2>This reset link isn't valid</h2>
          <p className="dim">It may have expired or already been used. Reset links work once, for one hour.</p>
        </div>
        <Link to="/forgot" className="btn btn-primary btn-block btn-lg">Send a new link</Link>
        <p className="dim small center"><Link to="/login">Back to sign in</Link></p>
      </div>
    );
  }

  const mismatch = touched && pw2 !== pw;
  return (
    <form
      className="stack"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault(); setTouched(true); setErr(null);
        if (!passwordOk(pw)) return setErr("Use at least 10 characters with letters and numbers.");
        if (pw !== pw2) return setErr("The two passwords don't match.");
        setBusy(true);
        try {
          await auth.updatePassword(pw);
          await signOut();
          nav("/login?reset=1", { replace: true });
        } catch (x) {
          setErr(x instanceof Error ? x.message : "Couldn't change the password. Request a new link and try again.");
        } finally { setBusy(false); }
      }}
    >
      <div className="stack-sm">
        <p className="step-tag">Account recovery</p>
        <h2>Choose a new password</h2>
        <p className="dim">For <strong className="fg">{profile.email}</strong>. You'll sign in again afterwards.</p>
      </div>
      {err && <Alert>{err}</Alert>}
      <Field label="New password" required hint="At least 10 characters, with letters and numbers.">
        <PasswordInput id="rp-password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <StrengthMeter pw={pw} />
      <Field label="Confirm new password" required error={mismatch ? "Passwords don't match" : undefined}>
        <PasswordInput id="rp-password2" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      <Button type="submit" loading={busy} className="btn-block btn-lg">Update password</Button>
    </form>
  );
}
