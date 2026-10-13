import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { billing, orgs } from "../../lib/api";
import { DEMO } from "../../lib/supabase";
import { date, moduleLabel } from "../../lib/format";
import type { ModuleKey, OrgInvitation, OrgMember, OrgRole } from "../../lib/types";
import {
  Alert, Button, ConfirmDialog, CopyButton, Empty, Field, Icon, LoadError, Meter, Modal, ModuleIcon, PageHeader, Pill, SkeletonRows, Spinner, StatusPill, useLoad,
} from "../../components/ui";
import { roleHelp, roleLabel } from "./Organizations";

const ROLES: OrgRole[] = ["owner", "admin", "billing", "member"];

type Confirm = { title: string; body: string; label: string; run: () => Promise<unknown>; ok: string };

export function OrganizationDetail() {
  const { id = "" } = useParams();
  const { profile, refresh } = useAuth();
  const list = useLoad(() => orgs.list(), [id]);
  const members = useLoad(() => orgs.members(id), [id]);
  const mods = useLoad(() => orgs.modules(id), [id]);
  const org = list.data?.find((o) => o.id === id);
  const myRole = org?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const canBill = myRole === "owner" || myRole === "billing";
  const invites = useLoad(() => (canManage ? orgs.invitations(id) : Promise.resolve([] as OrgInvitation[])), [id, canManage]);

  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const reloadAll = async () => { members.reload(); mods.reload(); invites.reload(); list.reload(); await refresh(); };
  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ tone: "ok", text: ok });
      await reloadAll();
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  }

  if (list.error) return <div className="page"><LoadError message={list.error} onRetry={list.reload} /></div>;
  if (list.data && !org) return <div className="page"><Empty icon="building" title="Organization not found" action={<Link to="/app/orgs" className="btn btn-ghost">Back to organizations</Link>}>It may have been removed, or you're no longer a member.</Empty></div>;
  if (!org) return <Spinner label="Loading organization" />;

  return (
    <div className="page">
      <PageHeader
        eyebrow={<Link to="/app/orgs">Organizations</Link>}
        title={org.name}
        description={<>You're {myRole === "owner" || myRole === "admin" ? "an" : "a"} <strong className="fg">{roleLabel[myRole!].toLowerCase()}</strong> · <span className="mono">{org.slug}</span></>}
        actions={<>
          {canBill && <Link to={`/plans?org=${org.id}`} className="btn btn-ghost"><Icon name="plus" size={15} />Buy products</Link>}
          {canBill && (
            <Button variant="ghost" loading={busy === "portal"} onClick={() => act("portal", async () => {
              const url = await billing.portal(org.id);
              if (DEMO) throw new Error("Demo: this opens the organization's Stripe billing portal.");
              window.location.assign(url);
            })}><Icon name="card" size={15} />Billing portal</Button>
          )}
          {canManage && <Button onClick={() => setInviteOpen(true)}><Icon name="mail" size={15} />Invite people</Button>}
        </>}
      />
      {org.status !== "active" && <Alert title="This organization is disabled">Its products are unavailable to members until a platform admin re-enables it.</Alert>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <section className="panel">
        <div className="panel-head"><h3><Icon name="layers" size={17} />Products</h3></div>
        {mods.loading ? <Spinner label="Loading products" /> : mods.data?.length === 0 ? (
          <Empty icon="layers" title="No products yet" action={canBill ? <Link to={`/plans?org=${org.id}`} className="btn btn-soft btn-sm">Buy a plan for the organization</Link> : undefined}>
            {canBill ? "Buy a plan billed to the organization, then give members seats." : "An owner or billing member can buy them."}
          </Empty>
        ) : (
          <div className="status-grid">
            {(mods.data ?? []).map((m) => (
              <div key={m.module_key} className={`status-card m-${m.module_key}`}>
                <div className="row-between">
                  <span className="ent"><ModuleIcon m={m.module_key} size={18} /><strong>{moduleLabel[m.module_key]}</strong></span>
                  <StatusPill s={m.live ? m.status : "canceled"} />
                </div>
                <span className="dim small">{m.plan_name}{m.valid_until ? ` · until ${date(m.valid_until)}` : ""}</span>
                <Meter value={m.seats_used} max={m.seats} label={`${moduleLabel[m.module_key]} seats used`} />
                <span className="small">{m.seats ? `${m.seats_used} of ${m.seats} seats used` : `${m.seats_used} seats used`}</span>
                {m.seats !== null && m.seats_used > m.seats && <Pill tone="warn">Over seat limit</Pill>}
              </div>
            ))}
          </div>
        )}
        <p className="dim small note">A seat lets a member open that product through Omni Force Vector. What they can do inside the product is still managed in the product.</p>
      </section>

      <section className="panel flush">
        <div className="panel-head"><h3><Icon name="users" size={17} />Members</h3><span className="panel-sub">{members.data?.length ?? "—"} people</span></div>
        {members.error && <LoadError message={members.error} onRetry={members.reload} />}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Person</th><th>Role</th>{(mods.data ?? []).map((m) => <th key={m.module_key}>{moduleLabel[m.module_key]} seat</th>)}<th className="actions"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {members.loading && <SkeletonRows cols={3 + (mods.data?.length ?? 0)} rows={3} />}
              {(members.data ?? []).map((mem) => (
                <MemberRow key={mem.user_id} mem={mem} me={profile?.id} myRole={myRole!} modules={(mods.data ?? []).filter((m) => m.live).map((m) => m.module_key)}
                  allModules={(mods.data ?? []).map((m) => m.module_key)} busy={busy}
                  onRole={(r) => act(`role-${mem.user_id}`, () => orgs.setRole(id, mem.user_id, r), `${mem.first_name} is now ${roleLabel[r].toLowerCase()}.`)}
                  onSeat={(m, on) => act(`seat-${mem.user_id}-${m}`, () => (on ? orgs.assignSeat(id, mem.user_id, m) : orgs.unassignSeat(id, mem.user_id, m)))}
                  onRemove={() => {
                    const self = mem.user_id === profile?.id;
                    setConfirm({
                      title: self ? `Leave ${org.name}?` : `Remove ${mem.first_name} ${mem.last_name}?`,
                      body: self ? "You'll lose access to the organization's products and seats. You'll need a new invitation to come back."
                        : `They'll lose access to ${org.name}'s products immediately. Their own account and personal plans are not affected.`,
                      label: self ? "Leave organization" : "Remove member",
                      run: () => orgs.remove(id, mem.user_id),
                      ok: self ? "You left the organization." : `${mem.first_name} was removed.`,
                    });
                  }} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && (
        <section className="panel flush">
          <div className="panel-head"><h3><Icon name="mail" size={17} />Pending invitations</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Email</th><th>Role</th><th>Invited by</th><th>Expires</th><th className="actions"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {invites.loading && <SkeletonRows cols={5} rows={1} />}
                {(invites.data ?? []).map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.email}</strong></td>
                    <td><Pill>{roleLabel[i.role]}</Pill></td>
                    <td>{i.invited_by_name || "—"}</td>
                    <td>{date(i.expires_at)}</td>
                    <td className="actions">
                      <Button variant="text" className="btn-sm" onClick={() => setConfirm({
                        title: "Revoke this invitation?", body: `The link sent to ${i.email} will stop working.`, label: "Revoke invitation",
                        run: () => orgs.revokeInvitation(id, i.id), ok: "Invitation revoked.",
                      })}>Revoke</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invites.data?.length === 0 && <Empty icon="mail" title="No open invitations" action={<Button variant="soft" className="btn-sm" onClick={() => setInviteOpen(true)}>Invite people</Button>} />}
        </section>
      )}

      {inviteOpen && <InviteModal orgId={id} myRole={myRole!} onClose={() => { setInviteOpen(false); invites.reload(); }} />}
      {confirm && (
        <ConfirmDialog title={confirm.title} body={confirm.body} confirmLabel={confirm.label} onClose={() => setConfirm(null)}
          onConfirm={async () => { await confirm.run(); setMsg({ tone: "ok", text: confirm.ok }); await reloadAll(); }} />
      )}
    </div>
  );
}

function MemberRow({ mem, me, myRole, modules, allModules, busy, onRole, onSeat, onRemove }: {
  mem: OrgMember; me?: string; myRole: OrgRole; modules: ModuleKey[]; allModules: ModuleKey[]; busy: string | null;
  onRole: (r: OrgRole) => void; onSeat: (m: ModuleKey, on: boolean) => void; onRemove: () => void;
}) {
  const isMe = mem.user_id === me;
  const canManage = myRole === "owner" || myRole === "admin";
  const canEditRole = canManage && (myRole === "owner" || mem.role !== "owner");
  const canRemove = isMe || (canManage && (myRole === "owner" || mem.role !== "owner"));
  const initials = `${mem.first_name[0] ?? ""}${mem.last_name[0] ?? ""}`.toUpperCase();
  return (
    <tr>
      <td>
        <span className="cell-person">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span className="grow"><strong>{mem.first_name} {mem.last_name}{isMe && <span className="dim small"> (you)</span>}</strong><span className="dim small">{mem.email ?? <span className="mono">{mem.omniforce_id}</span>}</span></span>
        </span>
      </td>
      <td>
        {canEditRole ? (
          <select id={`role-${mem.user_id}`} className="cell-input" aria-label={`Role for ${mem.first_name}`} value={mem.role} disabled={busy === `role-${mem.user_id}`} onChange={(e) => onRole(e.target.value as OrgRole)} title={roleHelp[mem.role]}>
            {ROLES.filter((r) => myRole === "owner" || r !== "owner").map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
          </select>
        ) : <Pill tone={mem.role === "owner" ? "brand" : "neutral"}>{roleLabel[mem.role]}</Pill>}
      </td>
      {allModules.map((m) => {
        const on = mem.modules.includes(m);
        const can = (canManage && modules.includes(m)) || (isMe && on);
        return (
          <td key={m}>
            <input id={`seat-${mem.user_id}-${m}`} type="checkbox" checked={on} disabled={!can || busy === `seat-${mem.user_id}-${m}`}
              aria-label={`${moduleLabel[m]} seat for ${mem.first_name}`} onChange={(e) => onSeat(m, e.target.checked)} />
          </td>
        );
      })}
      <td className="actions">
        {canRemove && <Button variant="text" className="btn-sm" onClick={onRemove}>{isMe ? "Leave" : "Remove"}</Button>}
      </td>
    </tr>
  );
}

function InviteModal({ orgId, myRole, onClose }: { orgId: string; myRole: OrgRole; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ link: string; email: string } | null>(null);

  return (
    <Modal title={made ? "Invitation created" : "Invite someone"} description={made ? undefined : "We'll create a one-time link for you to send."} onClose={onClose}>
      {!made ? (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { setMade(await orgs.invite(orgId, email.trim(), role)); } catch (x) { setErr(x instanceof Error ? x.message : "Could not invite."); } finally { setBusy(false); }
        }}>
          {err && <Alert>{err}</Alert>}
          <Field label="Email" hint="They must sign in to Omni Force Vector with this exact, verified address to accept.">
            <input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </Field>
          <Field label="Role" hint={roleHelp[role]}>
            <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
              {ROLES.filter((r) => myRole === "owner" || r !== "owner").map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
          </Field>
          <div className="modal-actions"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Create invitation link</Button></div>
        </form>
      ) : (
        <div className="stack">
          <Alert tone="ok">Send this link to {made.email}. It works once, for that email address only, and expires in 7 days. We only show it now.</Alert>
          <div className="keybox">{made.link}</div>
          <div className="modal-actions"><CopyButton text={made.link} label="Copy link" /><Button onClick={onClose}>Done</Button></div>
          <p className="dim small">After they join, give them a seat for each product they should open.</p>
        </div>
      )}
    </Modal>
  );
}
