import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { orgs } from "../../lib/api";
import { date } from "../../lib/format";
import { Alert, Button, Empty, Field, Icon, LoadError, Modal, PageHeader, Pill, SkeletonRows, StatusPill, useLoad } from "../../components/ui";

export const roleLabel = { owner: "Owner", admin: "Admin", billing: "Billing", member: "Member" } as const;
export const roleHelp = {
  owner: "Everything, including billing and other owners.",
  admin: "Members, invitations and module seats.",
  billing: "Subscriptions, payment method and invoices.",
  member: "Uses the modules they have a seat for.",
} as const;

export function Organizations() {
  const list = useLoad(() => orgs.list());
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const o = await orgs.create(name.trim());
      nav(`/app/orgs/${o.id}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not create the organization.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Account"
        title="Organizations"
        description="Share products with your team. Your personal account and plans stay yours."
        actions={<Button onClick={() => { setOpen(true); setName(""); setErr(null); }}><Icon name="plus" size={16} />New organization</Button>}
      />

      <section className="status-grid" aria-label="Roles">
        {(Object.keys(roleLabel) as (keyof typeof roleLabel)[]).map((r) => (
          <div key={r} className="status-card"><Pill tone={r === "owner" ? "brand" : "neutral"}>{roleLabel[r]}</Pill><span className="dim small">{roleHelp[r]}</span></div>
        ))}
      </section>

      {list.error && <LoadError message={list.error} onRetry={list.reload} />}
      <section className="panel flush">
        <div className="panel-head"><h3>Your organizations</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Organization</th><th>Your role</th><th className="num">Members</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>
              {list.loading && <SkeletonRows cols={5} rows={2} />}
              {(list.data ?? []).map((o) => (
                <tr key={o.id} className="click" onClick={() => nav(`/app/orgs/${o.id}`)}>
                  <td>
                    <span className="cell-person">
                      <span className="list-ico"><Icon name="building" size={16} /></span>
                      <span className="grow"><Link to={`/app/orgs/${o.id}`} onClick={(e) => e.stopPropagation()}><strong>{o.name}</strong></Link><span className="mono faint small">{o.slug}</span></span>
                    </span>
                  </td>
                  <td><Pill tone={o.role === "owner" ? "brand" : "neutral"}>{roleLabel[o.role]}</Pill></td>
                  <td className="num mono">{o.member_count}</td>
                  <td>{date(o.created_at)}</td>
                  <td><StatusPill s={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data?.length === 0 && (
          <Empty icon="building" title="You're not in any organization" action={<Button variant="soft" onClick={() => setOpen(true)}>Create an organization</Button>}>
            Create one to buy products for your team, or open an invitation link someone sent you.
          </Empty>
        )}
      </section>

      {open && (
        <Modal title="New organization" description="You'll be its owner. You can invite people and buy products for it next." onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={create}>
            {err && <Alert>{err}</Alert>}
            <Field label="Organization name" required hint="Usually your company or team name.">
              <input id="org-name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Skyline Aerial Survey" />
            </Field>
            <div className="modal-actions">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={busy} disabled={name.trim().length < 2}>Create organization</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
