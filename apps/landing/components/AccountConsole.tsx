import { ProductIcon } from "./Icons";
import type { ModuleKey } from "@/lib/site";

const rows: { key: ModuleKey; name: string; note: string; status: string }[] = [
  { key: "directory", name: "Drone Directory", note: "Opens only with an entitlement", status: "SSO not configured" },
  { key: "wsso", name: "WSSO", note: "Opens only with an entitlement", status: "SSO not configured" },
  { key: "workforce", name: "Workforce 2.0", note: "Desktop app", status: "Activation not live" },
];

export function AccountConsole() {
  return (
    <figure className="console" aria-label="Diagram of the Omni Force Vector hub">
      <div className="console-chrome" aria-hidden="true"><span /><span /><span /><em>Omni Force Vector hub</em></div>
      <div className="console-body">
        <div className="console-head">
          <div className="console-id">
            <img className="console-logo" src="/omniforce-vector-logo.png" alt="" />
            <div><strong>Your account</strong><span className="mono dim">Central sign-in</span></div>
          </div>
          <span className="pill">Module launcher</span>
        </div>
        <ul className="console-rows">
          {rows.map((r) => (
            <li key={r.key} className={`m-${r.key}`}>
              <span className="console-ico"><ProductIcon m={r.key} size={18} /></span>
              <span className="console-main"><strong>{r.name}</strong><span className="dim">{r.note}</span></span>
              <span className="pill">{r.status}</span>
            </li>
          ))}
        </ul>
        <div className="console-org">
          <div><span className="dim">Account</span><strong>Email verified</strong></div>
          <div><span className="dim">Organization</span><strong>Optional</strong></div>
          <div><span className="dim">Subscription</span><strong>By entitlement</strong></div>
        </div>
      </div>
      <figcaption className="console-cap">Schematic of the hub. Not a customer account.</figcaption>
    </figure>
  );
}
