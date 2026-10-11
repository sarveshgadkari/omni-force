import { useState } from "react";
import { admin } from "../../lib/api";
import { moduleLabel, rel } from "../../lib/format";
import { Alert, Button, ConfirmDialog, Empty, LoadError, PageHeader, SkeletonRows, useLoad } from "../../components/ui";

/**
 * Identity-link review. OmniForce never links a module account to an OmniForce
 * user just because the email matches: such matches wait here until an admin
 * has confirmed (outside OmniForce) that both accounts belong to the same person.
 */
export function AdminLinks() {
  const list = useLoad(() => admin.linksToReview());
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const decide = async (id: string, approve: boolean) => {
    setBusy(`${id}-${approve}`); setMsg(null);
    try {
      await admin.reviewLink(id, approve, reason[id] ?? "");
      setMsg({ tone: "ok", text: approve ? "Linked." : "Candidate rejected and removed." });
      list.reload();
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Failed." });
    } finally { setBusy(null); }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Platform" title="Identity links to review" description="Product accounts that match an OmniForce user only by email. Nothing is shared with the product until you approve." />
      <Alert tone="info">
        Approve only after confirming the person controls both accounts, for example they wrote in from the module account's address
        or proved it on a call. Linked accounts are used for sign-in, so a wrong approval gives one person another's account.
      </Alert>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {list.error && <LoadError message={list.error} onRetry={list.reload} />}
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>OmniForce user</th><th>Module</th><th>Module account</th><th>Found</th><th>Note for audit</th><th className="actions"><span className="visually-hidden">Decision</span></th></tr></thead>
            <tbody>
              {list.loading && <SkeletonRows cols={6} rows={2} />}
              {(list.data ?? []).map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.profile ? `${l.profile.first_name} ${l.profile.last_name}` : "—"}</strong><div className="dim small">{l.profile?.email} · <span className="mono">{l.profile?.omniforce_id}</span></div></td>
                  <td>{moduleLabel[l.module_key]}</td>
                  <td className="mono">{l.external_id}<div className="dim small">matched by {l.link_method === "verified_email" ? "email" : l.link_method}</div></td>
                  <td>{rel(l.created_at)}</td>
                  <td><input id={`reason-${l.id}`} className="cell-input" aria-label={`How you verified ${l.profile?.email ?? "this match"}`} placeholder="How you verified" value={reason[l.id] ?? ""} onChange={(e) => setReason((r) => ({ ...r, [l.id]: e.target.value }))} /></td>
                  <td className="actions"><span className="row gap">
                    <Button className="btn-sm" disabled={!(reason[l.id] ?? "").trim()} loading={busy === `${l.id}-true`} onClick={() => decide(l.id, true)}>Approve</Button>
                    <Button variant="ghost" className="btn-sm" loading={busy === `${l.id}-false`} onClick={() => setRejecting(l.id)}>Reject</Button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data?.length === 0 && <Empty icon="ok" title="Nothing to review">Email matches found during provisioning appear here.</Empty>}
      </section>
      {rejecting && <ConfirmDialog title="Reject this match?" body="The candidate is removed and nothing is linked. If provisioning finds the same account again it will come back here for review." confirmLabel="Reject match"
        onClose={() => setRejecting(null)} onConfirm={() => decide(rejecting, false)} />}
    </div>
  );
}
