import { Link } from "react-router-dom";
import { hasAccess, useAuth } from "../../auth/AuthProvider";
import { account, orgs } from "../../lib/api";
import { date, moduleLabel, rel } from "../../lib/format";
import type { ModuleKey } from "../../lib/types";
import { Button, Empty, Icon, ModuleIcon, Pill, Skeleton, SsoPill, StatusPill, useLoad } from "../../components/ui";
import { roleLabel } from "./Organizations";

export const blurb: Record<ModuleKey, string> = {
  directory: "Find and get found: drone trainers, pilots, service providers and vendors, with reviews, events and jobs.",
  wsso: "Run the company in one workspace: time and attendance, work orders, people, CRM and training.",
  workforce: "An AI workforce on your own computer for sales, marketing and inbox work. It asks before anything is sent.",
};

export function Overview() {
  const { profile, access, modules } = useAuth();
  const links = useLoad(() => account.links());
  const subs = useLoad(() => account.subscriptions());
  const myOrgs = useLoad(() => orgs.list());
  if (!profile) return null;
  const next = subs.data?.[0];

  return (
    <div className="page">
      <section className="hero-card">
        <div className="stack-sm">
          <p className="eyebrow">Dashboard</p>
          <h1>Good to see you, {profile.first_name}</h1>
          <p className="dim">Your products, organizations and billing in one place. Each product keeps its own data; Omni Force Vector holds your identity and access.</p>
        </div>
        <div className="stack-sm hero-side">
          <div className="idcard"><span className="dim small">Omni Force Vector ID</span><strong>{profile.omniforce_id}</strong></div>
          <div className="quick">
            <Link to="/app/orgs" className="btn btn-ghost btn-sm"><Icon name="building" size={15} />Organizations</Link>
            <Link to="/plans" className="btn btn-soft btn-sm"><Icon name="plus" size={15} />Add a product</Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="products-h" className="stack">
        <div className="row-between"><h2 id="products-h" className="h-section">Your products</h2><Link to="/app/billing" className="small">Plans and billing</Link></div>
        <div className="tiles">
          {(["directory", "wsso", "workforce"] as ModuleKey[]).map((m) => {
            const all = access.filter((x) => x.module_key === m);
            const e = all.find((x) => x.via === "individual") ?? all[0];
            const mod = modules.find((x) => x.key === m);
            return (
              <article key={m} className={`tile m-${m} ${e ? "" : "tile-off"}`} aria-label={moduleLabel[m]}>
                <header>
                  <span className="tile-icon"><ModuleIcon m={m} size={22} /></span>
                  {e ? <StatusPill s={e.status} /> : <Pill>Not in plan</Pill>}
                </header>
                <div className="stack-xs">
                  <h3>{moduleLabel[m]}</h3>
                  <p className="dim small">{blurb[m]}</p>
                </div>
                <dl className="mini-kv">
                  <div><dt>Plan</dt><dd>{e?.plan_name ?? "—"}</dd></div>
                  <div><dt>Access</dt><dd>{!e ? "—" : e.via === "organization" ? e.organization_name : "Personal"}</dd></div>
                  <div><dt>Sign-in</dt><dd>{m === "workforce" ? <Pill>Desktop app</Pill> : <SsoPill status={mod?.sso_status} />}</dd></div>
                </dl>
                <div className="tile-actions">
                  {e ? (
                    <Link to={`/app/m/${m}`} className="btn btn-primary">{m === "workforce" ? "Manage" : `Open ${moduleLabel[m]}`}</Link>
                  ) : (
                    <Link to={`/plans?module=${m}`} className="btn btn-ghost">Add to plan</Link>
                  )}
                  {mod?.app_url && <a className="btn btn-ghost" href={mod.app_url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${moduleLabel[m]} site (opens in a new tab)`}>Visit site <Icon name="external" size={14} /></a>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><h3><Icon name="building" size={17} />Organizations</h3><Link to="/app/orgs" className="small">Manage</Link></div>
          {myOrgs.loading ? <div className="stack-sm"><Skeleton h={16} w="60%" /><Skeleton h={16} w="40%" /></div>
            : (myOrgs.data ?? []).length === 0 ? (
              <Empty icon="building" title="No organizations yet" action={<Link to="/app/orgs" className="btn btn-soft btn-sm">Create an organization</Link>}>Share products and seats with your team.</Empty>
            ) : (
              <ul className="list-rows">
                {myOrgs.data!.slice(0, 4).map((o) => (
                  <li key={o.id}>
                    <span className="list-ico"><Icon name="building" size={16} /></span>
                    <span className="grow"><Link to={`/app/orgs/${o.id}`}><strong>{o.name}</strong></Link><span className="dim small">{o.member_count} members</span></span>
                    <Pill tone={o.role === "owner" ? "brand" : "neutral"}>{roleLabel[o.role]}</Pill>
                  </li>
                ))}
              </ul>
            )}
        </section>
        <section className="panel">
          <div className="panel-head"><h3><Icon name="card" size={17} />Subscription</h3><Link to="/app/billing" className="small">Manage</Link></div>
          {subs.loading ? <div className="stack-sm"><Skeleton h={16} w="70%" /><Skeleton h={16} w="50%" /></div> : next ? (
            <dl className="kv-list">
              <div><dt>Status</dt><dd><StatusPill s={next.status} /></dd></div>
              <div><dt>{next.cancel_at_period_end ? "Ends" : "Renews"}</dt><dd className="mono">{date(next.current_period_end)}</dd></div>
              <div><dt>Includes</dt><dd>{next.items.map((i) => i.plan.name).join(", ")}</dd></div>
            </dl>
          ) : <Empty icon="card" title="No paid plan" action={<Link to="/plans" className="btn btn-soft btn-sm">See plans</Link>}>You're on the free Directory plan.</Empty>}
        </section>
      </div>

      <section className="panel flush">
        <div className="panel-head"><h3><Icon name="link" size={17} />Linked product accounts</h3><span className="panel-sub">Used for single sign-on once it's switched on</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Product</th><th>Account</th><th>Status</th><th>Last sync</th></tr></thead>
            <tbody>
              {(links.data ?? []).map((l) => (
                <tr key={l.id}>
                  <td><span className={`ent m-${l.module_key}`}><span className="dot" />{moduleLabel[l.module_key]}</span></td>
                  <td className="mono">{l.module_key === "directory" ? `Member #${l.external_id}` : l.external_account_id ?? l.external_id}</td>
                  <td><StatusPill s={l.status} /></td>
                  <td className="dim">{rel(l.last_synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {links.data?.length === 0 && <Empty icon="link" title="Nothing linked yet">Your Directory and WSSO accounts are linked when their single sign-on goes live. Until then, keep using their own logins.</Empty>}
      </section>

      {!hasAccess(access, "wsso") && (
        <section className="upsell">
          <div className="stack-xs"><strong>Run your team in WSSO</strong><span className="dim small">From $99/mo for 10 seats, with a 14-day trial.</span></div>
          <Link to="/plans?module=wsso"><Button variant="ghost">See WSSO plans</Button></Link>
        </section>
      )}
    </div>
  );
}
