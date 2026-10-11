import { useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../../lib/api";
import { Alert, Button, Field, Icon } from "../../components/ui";

export function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="stack">
        <span className="success-badge" aria-hidden="true"><Icon name="mail" size={22} /></span>
        <div className="stack-sm">
          <h2>Check your email</h2>
          <p className="dim">If an account exists for <strong className="fg">{email}</strong>, we've sent a link to choose a new password. It expires in one hour.</p>
        </div>
        <Alert tone="info">Didn't get it? Check spam, or wait a minute before trying again.</Alert>
        <Button variant="ghost" className="btn-block" onClick={() => setSent(false)}>Use a different email</Button>
        <p className="dim small center"><Link to="/login">Back to sign in</Link></p>
      </div>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        // The response is the same whether or not the account exists.
        try { await auth.sendReset(email); setSent(true); }
        catch (x) { const m = x instanceof Error ? x.message : ""; if (/rate|seconds/i.test(m)) setErr("Too many requests. Wait a minute and try again."); else setSent(true); }
        finally { setBusy(false); }
      }}
    >
      <div className="stack-sm">
        <p className="step-tag">Account recovery</p>
        <h2>Reset your password</h2>
        <p className="dim">Enter the email you sign in with and we'll send you a reset link.</p>
      </div>
      {err && <Alert>{err}</Alert>}
      <Field label="Email" required><input id="fp-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
      <Button type="submit" loading={busy} className="btn-block btn-lg">Send reset link</Button>
      <p className="dim small center"><Link to="/login">Back to sign in</Link></p>
    </form>
  );
}
