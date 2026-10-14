import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../../lib/api";
import { selfServeBilling } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Button, Icon } from "../../components/ui";
import { StepsBar } from "./Signup";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cool, setCool] = useState(30);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  const code = digits.join("");

  function setAt(i: number, v: string) {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split("");
      setDigits([...next, ...Array(6 - next.length).fill("")]);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const d = [...digits];
    d[i] = clean;
    setDigits(d);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== 6) return setErr("Enter all 6 digits from the email.");
    setBusy(true);
    setErr(null);
    try {
      await auth.verifyOtp(email, code);
      await refresh();
      const plan = params.get("plan");
      nav(selfServeBilling() ? `/plans${plan ? `?plan=${encodeURIComponent(plan)}` : ""}` : "/app", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work. Check the latest email and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="stack-sm">
        <StepsBar step={2} />
        <p className="step-tag">Step 2 of 4 · Verify email</p>
        <span className="list-ico" aria-hidden="true"><Icon name="mail" /></span>
        <h2>Check your inbox</h2>
        <p className="dim">We sent a 6-digit code to <strong className="fg">{email || "your email"}</strong>. It expires in 10 minutes.</p>
      </div>
      {err && <Alert>{err}</Alert>}
      <div className="otp" role="group" aria-label="Verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            id={`otp-${i}`}
            ref={(el) => { refs.current[i] = el; }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={6}
            value={d}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); }}
          />
        ))}
      </div>
      <Button type="submit" loading={busy} className="btn-block btn-lg" disabled={code.length !== 6}>Verify and continue</Button>
      <p className="dim small center">
        Didn't get it?{" "}
        <button type="button" className="link-btn" disabled={cool > 0} onClick={async () => { try { await auth.resendOtp(email); setCool(30); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't resend the code."); } }}>
          {cool > 0 ? `Resend in ${cool}s` : "Resend code"}
        </button>
      </p>
    </form>
  );
}
