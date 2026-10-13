import { useEffect, useState } from "react";
import { admin } from "../../lib/api";
import { date, moduleLabel } from "../../lib/format";
import type { AdminOrgRow, ModuleKey, Plan } from "../../lib/types";
import { Alert, Button, ConfirmDialog, Empty, Field, Icon, LoadError, Modal, PageHeader, Pill, SkeletonRows, StatusPill, useLoad } from "../../components/ui";

const MODULES: ModuleKey[] = ["directory", "wsso", "workforce"];

export function AdminOrganizations() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useLoad(() => admin.organizations(debounced), [debounced]);
  const plans = useLoad(() => admin.plans());
  const [sel, setSel] = useState<AdminOrgRow | null>(null);

  return (
    <div className="page">
      <PageHeader eyebrow="Platform" title="Organizations" description="Customer organizations, their products and links to the products' own organizations."
        actions={<input id="admin-org-search" type="search" className="search" aria-label="Search organizations" placeholder="Search name or short name" value={q} onChange={(e) => setQ(e.target.value)} />} />
      {list.error && <LoadError message={list.error} onRetry={list.reload} />}
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Organization</th><th>Members</th>{MODULES.map((m) => <th key={m}>{moduleLabel[m]}</th>)}<th>Created</th><th>Status</th></tr></thead>
            <tbody>
              {list.loading && <SkeletonRows cols={7} rows={3} />}
              {(list.data ?? []).map((o) => (
                <tr key={o.id} className="click" onClick={() => setSel(o)}>
                  <td><span className="cell-person"><span className="list-ico"><Icon name="building" size={16} /></span><span className="grow"><strong>{o.name}</strong><span className="mono faint small">{o.slug}</span></span></span></td>
                  <td className="mono">{o.members[0]?.count ?? 0}</td>
                  {MODULES.map((m) => {
                    const e = o.entitlements.find((x) => x.module_key === m && x.status !== "canceled");
                    return <td key={m}>{e ? <span className={`ent m-${m}`}><span className="dot" />{e.plan?.name}</span> : <span className="dim">—</span>}</td>;
                  })}
                  <td>{date(o.created_at)}</td>
                  <td><StatusPill s={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data?.length === 0 && <Empty icon="building" title="No organizations">Customers create organizations from their account.</Empty>}
      </section>
      {sel && <OrgDrawer org={sel} plans={plans.data ?? []} onClose={() => setSel(null)} onChanged={() => { list.reload(); setSel(null); }} />}
    </div>
  );
}

function OrgDrawer({ org, plans, onClose, onChanged }: { org: AdminOrgRow; plans: Plan[]; onClose: () => void; onChanged: () => void }) {
  const [module, setModule] = useState<ModuleKey>("wsso");
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ext, setExt] = useState("");
  const [reason, setReason] = useState("");
  const [confirmDisable, setConfirmDisable] = useState(false);
  const options = plans.filter((p) => (p.module_key === module || p.bundle_modules.includes(module)) && p.audience !== "individual");
  const act = async (k: string, fn: () => Promise<unknown>) => { setBusy(k); setErr(null); try { await fn(); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); } finally { setBusy(null); } };

  if (confirmDisable) {
    return <ConfirmDialog title={`Disable ${org.name}?`} body="Members lose access to every product the organization pays for until you re-enable it. Billing in Stripe is not changed." confirmLabel="Disable organization"
      onClose={() => setConfirmDisable(false)} onConfirm={async () => { await admin.setOrgStatus(org.id, "disabled"); onChanged(); }} />;
  }
  return (
    <Modal title={org.name} description={org.slug} onClose={onClose} size="lg">
      <div className="stack">
        {err && <Alert>{err}</Alert>}
        <div>
          <h4>Organization access</h4>
          <ul className="ent-list">
            {org.entitlements.map((e) => (
              <li key={e.id}>
                <span className={`ent m-${e.module_key}`}><span className="dot" />{moduleLabel[e.module_key]}</span>
                <span className="grow">{e.plan?.name} <span className="dim small">· {e.source}{e.plan?.seats ? ` · ${e.plan.seats} seats` : ""}</span></span>
                <StatusPill s={e.status} />
                {e.status !== "canceled" && e.source !== "stripe" && (
                  <Button variant="text" className="btn-sm" loading={busy === `r-${e.module_key}`} onClick={() => act(`r-${e.module_key}`, () => admin.revoke({ organization_id: org.id }, e.module_key))}>Revoke</Button>
                )}
              </li>
            ))}
            {org.entitlements.length === 0 && <li className="dim small">No modules.</li>}
          </ul>
          <div className="grant">
            <select id="org-grant-module" value={module} onChange={(e) => { setModule(e.target.value as ModuleKey); setPlanId(""); }}>
              {MODULES.map((m) => <option key={m} value={m}>{moduleLabel[m]}</option>)}
            </select>
            <select id="org-grant-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Choose plan…</option>
              {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.interval})</option>)}
            </select>
            <Button className="btn-sm" disabled={!planId} loading={busy === "g"} onClick={() => act("g", () => admin.grant({ organization_id: org.id }, module, planId))}>Grant</Button>
          </div>
          <p className="dim small">Owners get a seat automatically; other members are seated by the organization's owners or admins.</p>
        </div>

        <div>
          <h4>Linked module organizations</h4>
          <table className="table compact">
            <tbody>
              {org.links.map((l) => (
                <tr key={l.id}><td>{moduleLabel[l.module_key]}</td><td className="mono">{l.external_org_id}</td><td><StatusPill s={l.status} /></td><td className="dim small">{l.link_method}</td></tr>
              ))}
              {org.links.length === 0 && <tr><td className="dim">Not linked. Links are normally created when an organization admin signs in to the module through Omni Force Vector.</td></tr>}
            </tbody>
          </table>
          <details>
            <summary className="small">Link manually (verified out of band)</summary>
            <div className="stack-sm">
              <Field label="WSSO organization id"><input id="org-ext" value={ext} onChange={(e) => setExt(e.target.value)} className="mono" /></Field>
              <Field label="Reason" hint="Recorded in the audit trail, e.g. the support ticket."><input id="org-ext-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <Button className="btn-sm" variant="ghost" disabled={!ext.trim()} loading={busy === "link"} onClick={() => act("link", () => admin.linkOrganization(org.id, "wsso", ext.trim(), reason))}>Link to WSSO organization</Button>
            </div>
          </details>
        </div>

        <div className="danger-zone">
          {org.status === "active"
            ? <><span className="stack-xs"><strong>Disable organization</strong><span className="dim small">Members lose access to its products.</span></span><Button variant="danger" className="btn-sm" onClick={() => setConfirmDisable(true)}>Disable</Button></>
            : <><span className="row gap"><Pill tone="bad" dot>Disabled</Pill></span><Button variant="ghost" className="btn-sm" loading={busy === "e"} onClick={() => act("e", () => admin.setOrgStatus(org.id, "active"))}>Re-enable</Button></>}
        </div>
      </div>
    </Modal>
  );
}
