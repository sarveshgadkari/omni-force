import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { account, launch } from "../../lib/api";
import { date, moduleLabel, rel } from "../../lib/format";
import type { Installation, ModuleKey } from "../../lib/types";
import { Alert, Button, CopyButton, Empty, Field, Icon, Modal, ModuleIcon, Pill, SkeletonRows, SsoPill, StatusPill, useLoad } from "../../components/ui";
import { SsoUnavailable } from "../../components/SsoUnavailable";
import { blurb } from "./Overview";
import { selfServeBilling } from "../../lib/supabase";

export function ModuleHome() {
  const { module = "directory" } = useParams();
  const m = module as ModuleKey;
  const { access, modules } = useAuth();
  const links = useLoad(() => account.links(), [m]);
  const mine = access.filter((x) => x.module_key === m);
  const a = mine.find((x) => x.via === "individual") ?? mine[0];
  const mod = modules.find((x) => x.key === m);
  const link = links.data?.find((l) => l.module_key === m);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<{ app_url: string | null; message: string } | null>(null);

  async function open() {
    setBusy(true);
    setErr(null);
    try {
      const r = await launch.module(m);
      if ("url" in r) window.location.assign(r.url);
      else setUnavailable(r);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not open the module.");
    } finally {
      setBusy(false);
    }
  }

  if (!moduleLabel[m]) return <Alert>Unknown module.</Alert>;

  return (
    <div className={`page m-${m}`}>
      <section className="module-hero">
        <span className="module-hero-icon"><ModuleIcon m={m} size={28} /></span>
        <div className="grow stack-xs">
          <p className="eyebrow">{m === "workforce" ? "Desktop app · Windows, Linux, Android" : "Cloud product"}</p>
          <h1>{moduleLabel[m]}</h1>
          <p className="dim small">{blurb[m]}</p>
          <div className="row wrap-gap">{m !== "workforce" ? <SsoPill status={mod?.sso_status} /> : <Pill>Desktop app</Pill>}{a && <StatusPill s={a.status} />}</div>
        </div>
        <div className="module-hero-actions">
          {mod?.app_url && <a className="btn btn-ghost" href={mod.app_url} target="_blank" rel="noopener noreferrer">Visit site <Icon name="external" size={14} /><span className="visually-hidden"> (opens in a new tab)</span></a>}
          {a && m !== "workforce" && <Button onClick={open} loading={busy}>Open {moduleLabel[m]} <Icon name="arrowRight" size={16} /></Button>}
        </div>
      </section>

      {unavailable && <SsoUnavailable name={moduleLabel[m]} appUrl={unavailable.app_url} message={unavailable.message} />}
      {err && <Alert>{err}</Alert>}

      {!a ? (
        selfServeBilling() ? (
          <section className="panel locked">
            <h3>{moduleLabel[m]} isn't in your plan yet</h3>
            <p className="dim">Add it to your own subscription, or ask an organization you belong to for a seat.</p>
            <Link to={`/plans?module=${m}`}><Button>See {moduleLabel[m]} plans</Button></Link>
          </section>
        ) : (
          <section className="panel locked">
            <h3>You don't have access to {moduleLabel[m]} yet</h3>
            <p className="dim">An Omni Force Vector administrator gives access. If you work in an organization, its owner or an admin can give you a seat. Once you have access, {moduleLabel[m]} opens from here.</p>
          </section>
        )
      ) : (
        <div className="two-col">
          <section className="panel">
            <div className="panel-head"><h3><Icon name="shield" size={17} />Your access</h3></div>
            <dl className="kv-list">
              <div><dt>Plan</dt><dd>{a.plan_name}{a.seats ? <span className="dim"> · {a.seats} seats</span> : null}</dd></div>
              <div><dt>Status</dt><dd><StatusPill s={a.status} /></dd></div>
              <div><dt>Through</dt><dd>{a.via === "organization"
                ? <>Seat in <Link to={`/app/orgs/${a.organization_id}`}>{a.organization_name}</Link></>
                : { stripe: "Your subscription", free: "Free plan", admin: "Omni Force Vector admin", license: "Licence" }[a.source]}</dd></div>
              <div><dt>Paid through</dt><dd className="mono">{date(a.valid_until)}</dd></div>
            </dl>
            {mine.length > 1 && <p className="dim small note">You also have access through {mine.filter((x) => x !== a).map((x) => x.organization_name ?? "your own plan").join(", ")}.</p>}
          </section>
          {m !== "workforce" ? (
            <section className="panel">
              <div className="panel-head"><h3><Icon name="key" size={17} />{moduleLabel[m]} sign-in</h3></div>
              <dl className="kv-list">
                <div><dt>Omni Force Vector sign-in</dt><dd><SsoPill status={mod?.sso_status} /></dd></div>
                {link && <div><dt>{m === "directory" ? "Member ID" : "Account ID"}</dt><dd className="mono">{link.external_id ?? "—"}</dd></div>}
                {link && <div><dt>Link</dt><dd><StatusPill s={link.status} /> <span className="dim small">{rel(link.last_synced_at)}</span></dd></div>}
              </dl>
              {mod?.sso_status !== "enabled" && (
                <p className="dim small note">
                  Until single sign-on is switched on, keep using your existing {moduleLabel[m]} login
                  {mod?.app_url && <> at <a href={mod.app_url} target="_blank" rel="noopener noreferrer">{new URL(mod.app_url).host}</a></>}.
                  Your Omni Force Vector plan already records your access.
                </p>
              )}
              {m === "directory" && <p className="dim small note">Your listing, reviews, categories and verification are managed inside the Directory.</p>}
            </section>
          ) : (
            <section className="panel"><WorkforceIntro /></section>
          )}
        </div>
      )}

      {a && m === "workforce" && <Installations />}
    </div>
  );
}

function WorkforceIntro() {
  return (
    <>
      <div className="panel-head"><h3><Icon name="sparkles" size={17} />How Workforce 2.0 works</h3></div>
      <ol className="mini-steps">
        <li><strong>Download</strong><span className="dim small">Install the free desktop app on Windows, Linux or Android from workforce.trackmystartup.com.</span></li>
        <li><strong>Ask</strong><span className="dim small">Tell the assistant what you need by voice or typing. AI workers do the job with real tools.</span></li>
        <li><strong>Approve</strong><span className="dim small">Nothing is sent, published or paid for without your approval. Files and memory stay on your computer.</span></li>
      </ol>
      <a className="btn btn-ghost btn-sm" href="https://workforce.trackmystartup.com/" target="_blank" rel="noopener noreferrer">Get Workforce 2.0 <Icon name="external" size={14} /></a>
    </>
  );
}

function Installations() {
  const list = useLoad(() => account.installations());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ installation: Installation; license_key: string } | null>(null);

  return (
    <section className="panel flush">
      <div className="panel-head">
        <div className="stack-xs"><h3><Icon name="server" size={17} />Licence keys</h3><span className="panel-sub">One key per computer or site that will connect to Omni Force Vector</span></div>
        <Button variant="soft" className="btn-sm" onClick={() => { setOpen(true); setIssued(null); setName(""); setErr(null); }}><Icon name="plus" size={15} />New licence key</Button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Device</th><th>Licence</th><th>Version</th><th>Last seen</th><th>Status</th></tr></thead>
          <tbody>
            {list.loading && <SkeletonRows cols={6} rows={2} />}
            {(list.data ?? []).map((i) => (
              <tr key={i.id}>
                <td><strong>{i.name}</strong></td>
                <td className="mono">{i.hostname ?? "—"}</td>
                <td className="mono">{i.license_key_prefix}…</td>
                <td className="mono">{i.version ?? "—"}</td>
                <td>{rel(i.last_seen_at)}</td>
                <td><StatusPill s={i.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data?.length === 0 && <Empty icon="key" title="No licence keys yet">Create one when you're ready to connect Workforce 2.0 to your Omni Force Vector account.</Empty>}
      {list.error && <Alert>{list.error}</Alert>}

      {open && (
        <Modal title={issued ? "Licence key created" : "New Workforce 2.0 licence key"} onClose={() => setOpen(false)}>
          {!issued ? (
            <form className="stack" onSubmit={async (ev) => {
              ev.preventDefault(); setBusy(true); setErr(null);
              try { setIssued(await launch.createInstallation(name)); list.reload(); }
              catch (x) { setErr(x instanceof Error ? x.message : "Could not create the key."); }
              finally { setBusy(false); }
            }}>
              {err && <Alert>{err}</Alert>}
              <Field label="Name" required hint="For example the person, office or computer it's for."><input id="wf-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Denver office" /></Field>
              <div className="modal-actions"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Create licence key</Button></div>
            </form>
          ) : (
            <div className="stack">
              <Alert tone="ok" title="Copy this key now">For security it's shown only once and stored as a hash.</Alert>
              <div className="keybox">{issued.license_key}</div>
              <CopyButton text={issued.license_key} label="Copy key" />
              <Alert tone="info">Licence activation from the Workforce 2.0 app isn't live yet. Keep this key; its status changes to <Pill tone="ok">Active</Pill> once a connected app checks in.</Alert>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
