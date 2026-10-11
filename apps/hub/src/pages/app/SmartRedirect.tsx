import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { account, launch } from "../../lib/api";
import { useAuth } from "../../auth/AuthProvider";
import { moduleLabel } from "../../lib/format";
import type { ModuleKey } from "../../lib/types";
import { Button, ModuleIcon, Wordmark } from "../../components/ui";

/**
 * After login: open the module used last (if still in the plan), else the
 * default module, else the Drone Directory. Gives a short window to stay.
 */
export function SmartRedirect() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const [target, setTarget] = useState<ModuleKey | null>(null);
  const [reason, setReason] = useState("");
  const [count, setCount] = useState(3);
  const [stay, setStay] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    account.landingModule().then((m) => {
      setTarget(m);
      setReason(profile?.last_module === m ? "you used it last" : profile?.default_module === m ? "it's your default" : "it's included in your plan");
    });
  }, [profile]);

  useEffect(() => {
    if (!target || stay) return;
    if (count <= 0) {
      if (target === "workforce") { nav("/app/m/workforce", { replace: true }); return; }
      launch.module(target)
        // modules without live SSO yet: go to the module page, which explains how to sign in there
        .then((r) => ("url" in r ? window.location.assign(r.url) : nav(`/app/m/${target}`, { replace: true })))
        .catch((e) => setErr(e instanceof Error ? e.message : "Could not open the module."));
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [target, count, stay, nav]);

  return (
    <div className="redirect-screen">
      <Wordmark />
      {target ? (
        <div className={`redirect-card m-${target}`}>
          <span className="redirect-icon"><ModuleIcon m={target} size={30} /></span>
          <p className="dim">Welcome back, {profile?.first_name}.</p>
          <h2>Opening {moduleLabel[target]}</h2>
          <p className="dim small">Because {reason}. Access checked against your active subscription.</p>
          <div className="progress" aria-hidden="true"><span style={{ width: `${((3 - count) / 3) * 100}%` }} /></div>
          {err && <p className="field-error">{err}</p>}
          <div className="row gap center-row">
            <Button variant="ghost" onClick={() => { setStay(true); nav("/app", { replace: true }); }}>Stay in my account</Button>
            {target !== "workforce" && <Button onClick={() => setCount(0)}>Open now</Button>}
          </div>
        </div>
      ) : (
        <div className="redirect-card"><span className="spin spin-lg" /><p className="dim">Finding your workspace…</p></div>
      )}
    </div>
  );
}
