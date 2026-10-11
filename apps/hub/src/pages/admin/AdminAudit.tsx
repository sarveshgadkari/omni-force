import { useMemo, useState } from "react";
import { admin } from "../../lib/api";
import { date, rel } from "../../lib/format";
import { Empty, LoadError, PageHeader, Pill, SkeletonRows, useLoad, type Tone } from "../../components/ui";

const groups: { key: string; label: string }[] = [
  { key: "", label: "All actions" },
  { key: "user", label: "Users" },
  { key: "org", label: "Organizations" },
  { key: "entitlement", label: "Access" },
  { key: "identity_link", label: "Identity links" },
  { key: "oauth", label: "Sign-in and clients" },
  { key: "module", label: "Product switches" },
  { key: "stripe", label: "Billing" },
];

const tone = (action: string): Tone =>
  /disable|revoke|remove|reject|replay/.test(action) ? "bad"
    : /grant|create|approve|accept|enable|linked/.test(action) ? "ok"
    : /stripe/.test(action) ? "info" : "neutral";

export function AdminAudit() {
  const log = useLoad(() => admin.audit());
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (log.data ?? []).filter((a) =>
      (!group || a.action.startsWith(group) || (group === "oauth" && a.action.startsWith("oauth_client")))
      && (!ql || `${a.actor_label} ${a.action} ${a.target_type ?? ""} ${a.target_id ?? ""}`.toLowerCase().includes(ql)));
  }, [log.data, q, group]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations"
        title="Audit trail"
        description="Every admin action, membership change, sign-in and billing change. Newest first; the latest 200 entries."
        actions={<div className="toolbar">
          <select id="audit-group" aria-label="Filter by action" value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
          <input id="audit-search" type="search" className="search" aria-label="Search the audit trail" placeholder="Search actor, action or target" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>}
      />
      {log.error && <LoadError message={log.error} onRetry={log.reload} />}
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead>
            <tbody>
              {log.loading && <SkeletonRows cols={4} rows={6} />}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td title={new Date(a.created_at).toLocaleString()}>{rel(a.created_at)}<div className="faint small">{date(a.created_at)}</div></td>
                  <td>{a.actor_label === "System" ? <Pill>System</Pill> : <strong>{a.actor_label}</strong>}</td>
                  <td><Pill tone={tone(a.action)}>{a.action}</Pill></td>
                  <td className="mono small">{a.target_type}:{a.target_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {log.data && rows.length === 0 && <Empty icon="list" title={log.data.length ? "No entries match" : "No audit entries yet"}>{log.data.length ? "Clear the search or pick another filter." : "Admin and account actions appear here."}</Empty>}
      </section>
    </div>
  );
}
