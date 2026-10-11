import { Link } from "react-router-dom";
import { admin } from "../../lib/api";
import { money, moduleLabel, rel } from "../../lib/format";
import type { ModuleKey } from "../../lib/types";
import { Empty, Icon, LoadError, ModuleIcon, PageHeader, Skeleton, SsoPill, StatusPill, useLoad } from "../../components/ui";

export function AdminOverview() {
  const stats = useLoad(() => admin.stats());
  const problems = useLoad(() => admin.events({ status: "problems" }));
  const mods = useLoad(() => admin.modules());
  const s = stats.data;
  const order: ModuleKey[] = ["directory", "wsso", "workforce"];
  const max = Math.max(1, ...order.map((m) => s?.by_module[m] ?? 0));
  const n = (v: number | undefined) => (s ? v ?? 0 : <Skeleton h={28} w={60} />);

  return (
    <div className="page">
      <PageHeader eyebrow="Platform" title="Overview" description="Accounts, revenue and the health of every product connection." />
      {stats.error && <LoadError message={stats.error} onRetry={stats.reload} />}

      <section className="stats" aria-label="Key numbers">
        <div className="stat"><span className="stat-label"><Icon name="users" size={16} />Accounts</span><strong>{n(s?.users)}</strong><span className="dim small">{s ? `${s.active_users} active` : " "}</span></div>
        <div className="stat"><span className="stat-label"><Icon name="building" size={16} />Organizations</span><strong>{n(s?.organizations)}</strong><span className="dim small">active</span></div>
        <div className="stat"><span className="stat-label"><Icon name="card" size={16} />Paying customers</span><strong>{n(s?.paying_users)}</strong><span className="dim small">{s ? `${Math.round((s.paying_users / Math.max(1, s.users)) * 100)}% of accounts` : " "}</span></div>
        <div className="stat"><span className="stat-label"><Icon name="activity" size={16} />Monthly recurring revenue</span><strong className="mono">{s ? money(s.mrr_cents) : <Skeleton h={28} w={100} />}</strong><span className="dim small">yearly plans counted ÷12</span></div>
        <div className={`stat ${s?.links_to_review ? "stat-warn" : ""}`}><span className="stat-label"><Icon name="link" size={16} />Links to review</span><strong>{n(s?.links_to_review)}</strong><span className="dim small">{s?.links_to_review ? <Link to="/admin/links">Review now</Link> : "nothing waiting"}</span></div>
        <div className={`stat ${s?.queue_failed ? "stat-warn" : ""}`}><span className="stat-label"><Icon name="alert" size={16} />Sync problems</span><strong>{n(s?.queue_failed)}</strong><span className="dim small">{s ? `${s.queue_pending} waiting to send` : " "}</span></div>
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><h3>Access by product</h3></div>
          <div className="bars">
            {order.map((m) => (
              <div key={m} className={`bar-row m-${m}`}>
                <span className="bar-label"><ModuleIcon m={m} size={16} /> {moduleLabel[m]}</span>
                <span className="bar"><span style={{ width: `${((s?.by_module[m] ?? 0) / max) * 100}%` }} /></span>
                <span className="mono">{s?.by_module[m] ?? 0}</span>
              </div>
            ))}
          </div>
          <p className="dim small">Live entitlements, individual and organization.</p>
        </section>
        <section className="panel">
          <div className="panel-head"><h3>Product connections</h3><Link className="small" to="/admin/apps">Applications and SSO</Link></div>
          <ul className="list-rows">
            {(mods.data ?? []).filter((m) => m.deployment === "cloud").map((m) => (
              <li key={m.key} className={`m-${m.key}`}>
                <span className="list-ico"><ModuleIcon m={m.key} size={16} /></span>
                <span className="grow"><strong>{m.name}</strong><span className="dim small">Provisioning {m.provisioning_status}</span></span>
                <SsoPill status={m.sso_status} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h3>Needs attention</h3><Link className="small" to="/admin/integrations">Sync log</Link></div>
        {problems.loading ? <Skeleton h={18} w="50%" /> : (problems.data ?? []).length === 0 ? <Empty icon="ok" title="Nothing needs attention">No failed or dead-lettered sync events.</Empty> : (
          <ul className="attn">
            {problems.data!.map((e) => (
              <li key={e.id}>
                <StatusPill s={e.status} />
                <span className="grow">
                  <strong>{moduleLabel[e.module_key]} · {e.event_type}</strong>
                  <span className="dim small">{e.user_label} · {e.last_error}</span>
                </span>
                <span className="dim small">{rel(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
