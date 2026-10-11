import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { launch } from "../../lib/api";
import { moduleLabel } from "../../lib/format";
import type { ModuleKey } from "../../lib/types";
import { Wordmark } from "../../components/ui";
import { SsoUnavailable } from "../../components/SsoUnavailable";

/** /launch/:module — for switchers inside modules (once their SSO is live). */
export function Launch() {
  const { module = "" } = useParams();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<{ app_url: string | null; message: string } | null>(null);

  useEffect(() => {
    const m = module as ModuleKey;
    if (!moduleLabel[m]) { nav("/app", { replace: true }); return; }
    if (m === "workforce") { nav("/app/m/workforce", { replace: true }); return; }
    launch.module(m)
      .then((r) => ("url" in r ? window.location.replace(r.url) : setUnavailable(r)))
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not open the module."));
  }, [module, nav]);

  const name = moduleLabel[module as ModuleKey] ?? "that module";
  return (
    <div className="redirect-screen">
      <Wordmark />
      <div className="redirect-card">
        {unavailable ? (<><h2>{name}</h2><SsoUnavailable name={name} appUrl={unavailable.app_url} message={unavailable.message} /><Link to={`/app/m/${module}`}>Go to my account</Link></>)
          : err ? (<><h2>Can't open {name}</h2><p className="dim">{err}</p><Link to="/app">Go to my account</Link></>)
          : (<><span className="spin spin-lg" /><p className="dim">Opening {name}…</p></>)}
      </div>
    </div>
  );
}
