import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../../lib/api";
import { Alert, Button, Field, PasswordInput } from "../../components/ui";

/** 0–4: length, letters+numbers, mixed case, symbol or 14+ chars. */
export function passwordScore(pw: string) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  return Math.max(1, s);
}
export const passwordOk = (pw: string) => pw.length >= 10 && /[0-9]/.test(pw) && /[A-Za-z]/.test(pw);
const scoreLabel = ["", "Weak", "Fair", "Good", "Strong"];

export function StrengthMeter({ pw }: { pw: string }) {
  const s = passwordScore(pw);
  return (
    <div className="stack-xs" aria-live="polite">
      <div className="strength" data-score={s} aria-hidden="true"><span /><span /><span /><span /></div>
      {pw && <span className="field-hint">Strength: {scoreLabel[s]}</span>}
    </div>
  );
}

export function StepsBar({ step }: { step: number }) {
  return <div className="steps-bar" aria-hidden="true">{[1, 2, 3, 4].map((i) => <span key={i} className={i <= step ? "on" : ""} />)}</div>;
}

export function Signup() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", company: "", password: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const pwOk = passwordOk(f.password);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email);
  const fieldErr = (ok: boolean, msg: string) => (touched && !ok ? msg : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setTouched(true);
    if (!f.firstName.trim() || !f.lastName.trim() || !emailOk) return setErr("Fill in your name and a valid email.");
    if (!pwOk) return setErr("Use at least 10 characters with letters and numbers.");
    if (!agree) return setErr("Accept the terms to create your account.");
    setBusy(true);
    try {
      await auth.signUp(f);
      const plan = params.get("plan");
      nav(`/verify?email=${encodeURIComponent(f.email)}${plan ? `&plan=${encodeURIComponent(plan)}` : ""}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-up failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" noValidate>
      <div className="stack-sm">
        <StepsBar step={1} />
        <p className="step-tag">Step 1 of 4 · Create account</p>
        <h2>Create your Omni Force Vector account</h2>
        <p className="dim">One account for the Drone Directory, WSSO and Workforce 2.0.</p>
      </div>
      {err && <Alert>{err}</Alert>}
      <div className="grid-2">
        <Field label="First name" required error={fieldErr(!!f.firstName.trim(), "Required")}><input id="su-first" required autoComplete="given-name" value={f.firstName} onChange={set("firstName")} /></Field>
        <Field label="Last name" required error={fieldErr(!!f.lastName.trim(), "Required")}><input id="su-last" required autoComplete="family-name" value={f.lastName} onChange={set("lastName")} /></Field>
      </div>
      <Field label="Work email" required error={fieldErr(emailOk, "Enter a valid email address")}><input id="su-email" type="email" required autoComplete="email" value={f.email} onChange={set("email")} placeholder="you@company.com" /></Field>
      <Field label="Company" hint="Optional. You can create an organization for your team later."><input id="su-company" autoComplete="organization" value={f.company} onChange={set("company")} /></Field>
      <Field label="Password" required hint="At least 10 characters, with letters and numbers." error={fieldErr(pwOk, "At least 10 characters, with letters and numbers")}>
        <PasswordInput id="su-password" required autoComplete="new-password" value={f.password} onChange={set("password")} />
      </Field>
      <StrengthMeter pw={f.password} />
      <label className="check">
        <input id="su-terms" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I agree to the Terms of Service and Privacy Policy.</span>
      </label>
      <Button type="submit" loading={busy} className="btn-block btn-lg">Create account</Button>
      <p className="dim small center">Already have an account? <Link to="/login">Sign in</Link></p>
    </form>
  );
}
