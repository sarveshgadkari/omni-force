import { useState } from "react";
import { admin } from "../../lib/api";
import { moduleLabel, rel } from "../../lib/format";
import type { IntegrationEvent, ModuleKey } from "../../lib/types";
import { Button, Empty, LoadError, Modal, PageHeader, SkeletonRows, StatusPill, useLoad } from "../../components/ui";

export function AdminIntegrations() {
  const [module, setModule] = useState<ModuleKey | "">("");
  const [status, setStatus] = useState("");
  const ev = useLoad(() => admin.events({ module, status }), [module, status]);
  const [sel, setSel] = useState<IntegrationEvent | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">Operations</p><h1>Sync log</h1><p className="dim page-desc">Everything OmniForce sends to products, and every webhook they send back. Provisioning is off for every product until its API is verified.</p></div>
        <div className="toolbar">
          <select id="ev-module" value={module} onChange={(e) => setModule(e.target.value as ModuleKey | "")} aria-label="Module">
            <option value="">All products</option>
            <option value="directory">Drone Directory</option>
            <option value="wsso">WSSO</option>
          </select>
          <select id="ev-status" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            <option value="problems">Problems only</option>
            <option value="queued">Waiting</option>
            <option value="sent">Sent</option>
            <option value="processed">Received</option>
          </select>
        </div>
      </div>
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>When</th><th>Direction</th><th>Product</th><th>Event</th><th>User</th><th>Tries</th><th>Status</th><th className="actions"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {!ev.data && !ev.error && <SkeletonRows cols={9} rows={4} />}
              {(ev.data ?? []).map((e) => (
                <tr key={e.id} className="click" onClick={() => setSel(e)}>
                  <td className="mono dim">{e.id}</td>
                  <td>{rel(e.created_at)}</td>
                  <td><span className={`dir dir-${e.direction}`}>{e.direction === "outbound" ? "→ out" : "← in"}</span></td>
                  <td>{moduleLabel[e.module_key]}</td>
                  <td className="mono">{e.event_type}</td>
                  <td className="mono">{e.user_label ?? e.user_id?.slice(0, 8)}</td>
                  <td className="mono">{e.attempts}</td>
                  <td><StatusPill s={e.status} /></td>
                  <td onClick={(x) => x.stopPropagation()}>
                    {(e.status === "failed" || e.status === "dead") && (
                      <Button variant="ghost" className="btn-sm" loading={busy === e.id} onClick={async () => { setBusy(e.id); try { await admin.retryEvent(e.id); ev.reload(); } finally { setBusy(null); } }}>Retry</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ev.error && <LoadError message={ev.error} onRetry={ev.reload} />}
        {ev.data?.length === 0 && <Empty icon="activity" title="No sync events">Nothing matches these filters. With provisioning switched off, no outbound events are created.</Empty>}
      </section>
      {sel && (
        <Modal title={`Event #${sel.id}`} onClose={() => setSel(null)}>
          <div className="stack">
            <div className="row gap"><StatusPill s={sel.status} /><span className="mono">{sel.event_type}</span></div>
            {sel.last_error && <p className="field-error">{sel.last_error}</p>}
            <pre className="code">{JSON.stringify(sel.payload, null, 2)}</pre>
          </div>
        </Modal>
      )}
    </div>
  );
}
