import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { moduleLabel } from "../../lib/format";
import { Button, ModuleIcon, StatusPill, Wordmark } from "../../components/ui";

// Stripe redirects here. The webhook may land a few seconds after the redirect,
// so we poll entitlements briefly before showing the result.
export function CheckoutSuccess() {
  const { refresh, access } = useAuth();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (tries >= 6) return;
    const t = setTimeout(async () => { await refresh(); setTries((n) => n + 1); }, tries === 0 ? 0 : 2000);
    return () => clearTimeout(t);
  }, [tries, refresh]);

  const active = access;

  return (
    <div className="onboard">
      <header className="onboard-top"><Wordmark /></header>
      <div className="success">
        <div className="success-mark" aria-hidden="true">✓</div>
        <p className="step-tag">Step 4 of 4 · Account ready</p>
        <h2>Payment received. Your products are ready.</h2>
        <p className="dim">A receipt is on its way to your inbox and in Plans and billing.</p>
        <ul className="success-list">
          {active.map((e) => (
            <li key={`${e.entitlement_id}`} className={`m-${e.module_key}`}>
              <ModuleIcon m={e.module_key} />
              <span className="grow"><strong>{moduleLabel[e.module_key]}</strong> <span className="dim">{e.plan_name}{e.organization_name ? ` · ${e.organization_name}` : ""}</span></span>
              <StatusPill s={e.status} />
            </li>
          ))}
        </ul>
        <div className="row gap">
          <Link to="/go"><Button>Open my workspace</Button></Link>
          <Link to="/app/billing"><Button variant="ghost">View billing</Button></Link>
        </div>
      </div>
    </div>
  );
}
