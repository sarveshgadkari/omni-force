import { useState } from "react";
import { admin } from "../../lib/api";
import { date, rel } from "../../lib/format";
import type { Installation } from "../../lib/types";
import { Button, ConfirmDialog, Empty, LoadError, PageHeader, SkeletonRows, StatusPill, useLoad } from "../../components/ui";

export function AdminInstallations() {
  const list = useLoad(() => admin.installations());
  const [confirm, setConfirm] = useState<Installation | null>(null);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations"
        title="Workforce installations"
        description="Workforce 2.0 licence keys issued from Omni Force Vector. Revoking a key stops its connection to Omni Force Vector."
      />
      {list.error && <LoadError message={list.error} onRetry={list.reload} />}
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Installation</th><th>Customer</th><th>Device</th><th>Licence</th><th>Version</th><th>Last check-in</th><th>Created</th><th>Status</th><th className="actions"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {list.loading && <SkeletonRows cols={9} rows={3} />}
              {(list.data ?? []).map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.name}</strong></td>
                  <td>{i.owner_label ?? i.user_id.slice(0, 8)}</td>
                  <td className="mono">{i.hostname ?? "—"}</td>
                  <td className="mono">{i.license_key_prefix}…</td>
                  <td className="mono">{i.version ?? "—"}</td>
                  <td>{rel(i.last_seen_at)}</td>
                  <td>{date(i.created_at)}</td>
                  <td><StatusPill s={i.status} /></td>
                  <td className="actions">{i.status !== "revoked" && <Button variant="ghost" className="btn-sm" onClick={() => setConfirm(i)}>Revoke…</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data?.length === 0 && <Empty icon="server" title="No installations">Licence keys customers create appear here.</Empty>}
      </section>
      {confirm && (
        <ConfirmDialog
          title={`Revoke ${confirm.name}?`}
          body={`The licence key ${confirm.license_key_prefix}… stops working and the installation can no longer sync with Omni Force Vector. This can't be undone; the customer would need a new key.`}
          confirmLabel="Revoke licence"
          onClose={() => setConfirm(null)}
          onConfirm={async () => { await admin.revokeInstallation(confirm.id); list.reload(); }}
        />
      )}
    </div>
  );
}
