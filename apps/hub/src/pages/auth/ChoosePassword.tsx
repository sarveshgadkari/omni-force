import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { auth } from "../../lib/api";
import { selfServeBilling } from "../../lib/supabase";
import { Alert, Button, Field, PasswordInput, Spinner } from "../../components/ui";
import { passwordOk, signupSteps, StepsBar, StrengthMeter } from "./Signup";

/** After email OTP: set the password used for later sign-in. */
export function ChoosePassword() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get("welcome") === "1";
  const plan = params.get("plan");
  const { loading, profile } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  if (loading) return <Spinner label="Checking your session" />;
  if (!profile) {
    return (
      <div className="stack">
        <div className="stack-sm">
          <p className="step-tag">Create account</p>
          <h2>Verify your email first</h2>
          <p className="dim">Enter the 6-digit code we emailed you, then choose a password.</p>
        </div>
        <Link to="/signup" className="btn btn-primary btn-block btn-lg">Back to create account</Link>
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
          nav(selfServeBilling() ? `/plans${plan ? `?plan=${encodeURIComponent(plan)}` : ""}` : "/app", { replace: true });
        } catch (x) {
          setErr(x instanceof Error ? x.message : "Couldn't save the password. Try again.");
        } finally { setBusy(false); }
      }}
    >
      <div className="stack-sm">
        {welcome && <StepsBar step={3} />}
        <p className="step-tag">{welcome ? `Step 3 of ${signupSteps()} · Password` : "Password"}</p>
        <h2>Choose a password</h2>
        <p className="dim">Your email is verified{profile.email ? <> for <strong className="fg">{profile.email}</strong></> : ""}. Use this password to sign in next time.</p>
      </div>
      {err && <Alert>{err}</Alert>}
      <Field label="Password" required hint="At least 10 characters, with letters and numbers.">
        <PasswordInput id="cp-password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <StrengthMeter pw={pw} />
      <Field label="Confirm password" required error={mismatch ? "Passwords don't match" : undefined}>
        <PasswordInput id="cp-password2" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      <Button type="submit" loading={busy} className="btn-block btn-lg">Save password and continue</Button>
    </form>
  );
}
