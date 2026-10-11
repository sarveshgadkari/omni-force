import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { admin } from "../../lib/api";
import { date, moduleLabel, rel } from "../../lib/format";
import type { AdminUserRow, ModuleKey, Plan } from "../../lib/types";
import { Alert, Button, ConfirmDialog, Empty, Icon, LoadError, Modal, PageHeader, Pill, SkeletonRows, StatusPill, useLoad } from "../../components/ui";

export function AdminUsers() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const users = useLoad(() => admin.users(debounced), [debounced]);
  const plans = useLoad(() => admin.plans());
  const [sel, setSel] = useState<AdminUserRow | null>(null);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Platform"
        title="Users and access"
        description="Every OmniForce account, their personal product access and linked product accounts."
        actions={<input id="admin-user-search" type="search" className="search" aria-label="Search users" placeholder="Search name, email, company or OF-ID" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      {users.error && <LoadError message={users.error} onRetry={users.reload} />}
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>User</th><th>OmniForce ID</th><th>Directory</th><th>WSSO</th><th>Workforce</th><th>Last product</th><th>Status</th><th className="actions"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {users.loading && <SkeletonRows cols={8} rows={5} />}
              {(users.data ?? []).map((u) => (
                <tr key={u.id} className="click" onClick={() => setSel(u)}>
                  <td>
                    <span className="cell-person">
                      <span className="avatar" aria-hidden="true">{`${u.first_name[0] ?? ""}${u.last_name[0] ?? ""}`.toUpperCase() || "?"}</span>
                      <span className="grow"><strong>{u.first_name} {u.last_name}</strong><span className="dim small">{u.email}</span></span>
                    </span>
                  </td>
                  <td className="mono">{u.omniforce_id}</td>
                  {(["directory", "wsso", "workforce"] as ModuleKey[]).map((m) => {
                    const e = u.entitlements.find((x) => x.module_key === m && x.status !== "canceled");
                    return <td key={m}>{e ? <span className={`ent m-${m}`} title={e.status}><span className="dot" />{e.plan?.name}{e.status !== "active" && <span className="dim"> · {e.status.replace("_", " ")}</span>}</span> : <span className="faint">—</span>}</td>;
                  })}
                  <td>{u.last_module ? moduleLabel[u.last_module] : "—"}</td>
                  <td><StatusPill s={u.status} /></td>
                  <td className="actions"><button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setSel(u); }}>Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.data?.length === 0 && <Empty icon="search" title="No users match">Try an email address or an OF- number.</Empty>}
      </section>
      {sel && <UserDrawer user={sel} plans={plans.data ?? []} onClose={() => setSel(null)} onChanged={() => { users.reload(); setSel(null); }} />}
    </div>
  );
}

function UserDrawer({ user, plans, onClose, onChanged }: { user: AdminUserRow; plans: Plan[]; onClose: () => void; onChanged: () => void }) {
  const [module, setModule] = useState<ModuleKey>("wsso");
  const options = plans.filter((p) => p.module_key === module && p.audience !== "organization");
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; tone?: "danger" | "primary"; run: () => Promise<unknown> }>(null);

  const act = async (k: string, fn: () => Promise<unknown>) => { setBusy(k); setErr(null); try { await fn(); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); } finally { setBusy(null); } };

  if (confirm) {
    return <ConfirmDialog title={confirm.title} body={confirm.body} confirmLabel={confirm.label} tone={confirm.tone} onClose={() => setConfirm(null)} onConfirm={async () => { await confirm.run(); onChanged(); }} />;
  }

  return (
    <Modal title={`${user.first_name} ${user.last_name}`} description={user.email} onClose={onClose} size="lg">
      <div className="stack">
        {err && <Alert>{err}</Alert>}
        <dl className="kv-list">
          <div><dt>OmniForce ID</dt><dd className="mono">{user.omniforce_id}</dd></div>
          <div><dt>Company</dt><dd>{user.company_name ?? "—"}</dd></div>
          <div><dt>Joined</dt><dd>{date(user.created_at)}</dd></div>
          <div><dt>Status</dt><dd><StatusPill s={user.status} /></dd></div>
        </dl>

        <div>
          <h4>Personal access</h4>
          <ul className="ent-list">
            {user.entitlements.map((e) => (
              <li key={e.id}>
                <span className={`ent m-${e.module_key}`}><span className="dot" />{moduleLabel[e.module_key]}</span>
                <span className="grow">{e.plan?.name} <span className="dim small">· {e.source}</span></span>
                <StatusPill s={e.status} />
                {e.status !== "canceled" && e.source !== "free" && (
                  <Button variant="text" className="btn-sm" onClick={() => setConfirm({
                    title: `Revoke ${moduleLabel[e.module_key]}?`, body: `${user.first_name} loses ${moduleLabel[e.module_key]} access from their personal plan. Stripe billing is not changed.`,
                    label: "Revoke access", run: () => admin.revoke({ user_id: user.id }, e.module_key),
                  })}>Revoke</Button>
                )}
              </li>
            ))}
            {user.entitlements.length === 0 && <li className="dim small">No personal access.</li>}
          </ul>
          <div className="grant">
            <select id="grant-module" aria-label="Product" value={module} onChange={(e) => { setModule(e.target.value as ModuleKey); setPlanId(""); }}>
              {(Object.keys(moduleLabel) as ModuleKey[]).map((m) => <option key={m} value={m}>{moduleLabel[m]}</option>)}
            </select>
            <select id="grant-plan" aria-label="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Choose plan…</option>
              {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.interval})</option>)}
            </select>
            <Button className="btn-sm" disabled={!planId} loading={busy === "g"} onClick={() => act("g", () => admin.grant({ user_id: user.id }, module, planId))}>Grant</Button>
          </div>
          <p className="dim small">Grants made here don't charge the customer and stay until you revoke them.</p>
        </div>

        <div>
          <h4>Linked product accounts</h4>
          <div className="table-wrap">
            <table className="table compact">
              <tbody>
                {user.links.map((l) => (
                  <tr key={l.id}>
                    <td>{moduleLabel[l.module_key]}</td>
                    <td className="mono">{l.external_id ?? "—"}</td>
                    <td><StatusPill s={l.status} /></td>
                    <td className="dim small">{l.last_error ?? rel(l.last_synced_at)}</td>
                  </tr>
                ))}
                {user.links.length === 0 && <tr><td className="dim">Not linked to any product yet.</td></tr>}
                {user.links.some((l) => l.status === "pending_review") && <tr><td colSpan={4} className="small">An email match is waiting in <Link to="/admin/links">Identity links</Link>.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="danger-zone">
          {user.status === "active" ? (
            <>
              <span className="stack-xs"><strong>Disable account</strong><span className="dim small">Blocks sign-in and deactivates every linked product account.</span></span>
              <Button variant="danger" className="btn-sm" onClick={() => setConfirm({
                title: `Disable ${user.first_name}'s account?`, body: "They won't be able to sign in to OmniForce, and linked product accounts are deactivated where provisioning is enabled. You can re-enable it later.",
                label: "Disable account", run: () => admin.setUserStatus(user.id, "disabled"),
              })}><Icon name="lock" size={15} />Disable</Button>
            </>
          ) : (
            <>
              <span className="row gap"><Pill tone="bad" dot>Disabled</Pill><span className="dim small">Sign-in is blocked.</span></span>
              <Button variant="ghost" className="btn-sm" loading={busy === "e"} onClick={() => act("e", () => admin.setUserStatus(user.id, "active"))}>Re-enable</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
