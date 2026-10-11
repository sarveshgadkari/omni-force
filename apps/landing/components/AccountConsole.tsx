// Static preview of the OmniForce account dashboard. Statuses mirror reality:
// Directory and WSSO sign-in are not configured; Workforce 2.0 is a desktop app.
import { ProductIcon } from "./Icons";
import type { ModuleKey } from "@/lib/site";

const rows: { key: ModuleKey; name: string; plan: string; via: string; status: string }[] = [
  { key: "directory", name: "Drone Directory", plan: "Service Provider", via: "Personal", status: "SSO not configured" },
  { key: "wsso", name: "WSSO", plan: "Growth · 50 seats", via: "Skyline Aerial Survey", status: "SSO not configured" },
  { key: "workforce", name: "Workforce 2.0", plan: "Licence", via: "Personal", status: "Desktop app" },
];

export function AccountConsole() {
  return (
    <figure className="console" aria-label="Preview of the OmniForce account dashboard">
      <div className="console-chrome" aria-hidden="true"><span /><span /><span /><em>account.omniforce.app</em></div>
      <div className="console-body">
        <div className="console-head">
          <div className="console-id">
            <span className="avatar" aria-hidden="true">AC</span>
            <div><strong>Good to see you, Avery</strong><span className="mono dim">OF-0009821</span></div>
          </div>
          <span className="pill pill-ok"><span className="pill-dot" />Subscription active</span>
        </div>
        <ul className="console-rows">
          {rows.map((r) => (
            <li key={r.key} className={`m-${r.key}`}>
              <span className="console-ico"><ProductIcon m={r.key} size={18} /></span>
              <span className="console-main"><strong>{r.name}</strong><span className="dim">{r.plan} · {r.via}</span></span>
              <span className="pill">{r.status}</span>
            </li>
          ))}
        </ul>
        <div className="console-org">
          <div><span className="dim">Organization</span><strong>Skyline Aerial Survey</strong></div>
          <div><span className="dim">Members</span><strong className="mono">4</strong></div>
          <div><span className="dim">WSSO seats</span><strong className="mono">3 / 50</strong></div>
        </div>
      </div>
      <figcaption className="console-cap">Illustrative preview with sample data.</figcaption>
    </figure>
  );
}
