import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { account, billing } from "../../lib/api";
import { DEMO, selfServeBilling } from "../../lib/supabase";
import { date, money, moduleLabel, planModules, planPrice } from "../../lib/format";
import { Alert, Button, Empty, Icon, LoadError, PageHeader, Pill, Skeleton, SkeletonRows, StatusPill, useLoad } from "../../components/ui";

export function Billing() {
  const nav = useNavigate();
  const { access } = useAuth();
  const subs = useLoad(() => account.subscriptions());
  const inv = useLoad(() => account.invoices());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function portal() {
    setBusy(true);
    setErr(null);
    try {
      const url = await billing.portal();
      if (DEMO) setErr("Demo: this opens the Stripe customer portal to change cards, plans and cancel.");
      else window.location.assign(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open billing.");
    } finally {
      setBusy(false);
    }
  }

  const active = (subs.data ?? []).filter((s) => ["active", "trialing", "past_due"].includes(s.status));
  const monthly = active.reduce((t, s) => t + s.items.reduce((u, i) => u + (i.plan.interval === "year" ? i.plan.price_cents / 12 : i.plan.price_cents) * i.quantity, 0), 0);
  const renew = active.map((s) => s.current_period_end).filter(Boolean).sort()[0] ?? null;
  const orgAccess = access.filter((a) => a.via === "organization");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Billing"
        title={selfServeBilling() ? "Plans and billing" : "Billing"}
        description={selfServeBilling() ? "Your personal subscription. Organization plans are billed to the organization." : "Products are given to you by an Omni Force Vector administrator. Any invoices for your account appear here."}
        actions={<>
          {selfServeBilling() && <Button variant="ghost" onClick={() => nav("/plans")}><Icon name="layers" size={15} />Add or change products</Button>}
          <Button onClick={portal} loading={busy}><Icon name="card" size={15} />Payment method and invoices</Button>
        </>}
      />
      {err && <Alert tone={DEMO ? "info" : "bad"}>{err}</Alert>}

      <section className="summary" aria-label="Billing summary">
        <div className="stat"><span className="stat-label"><Icon name="layers" size={16} />Active plans</span>{subs.loading ? <Skeleton h={30} w={60} /> : <strong>{active.reduce((n, s) => n + s.items.length, 0)}</strong>}<span className="dim small">personal subscription items</span></div>
        <div className="stat"><span className="stat-label"><Icon name="card" size={16} />Monthly spend</span>{subs.loading ? <Skeleton h={30} w={100} /> : <strong className="mono">{money(Math.round(monthly))}</strong>}<span className="dim small">yearly plans counted ÷12</span></div>
        <div className="stat"><span className="stat-label"><Icon name="clock" size={16} />Next renewal</span>{subs.loading ? <Skeleton h={30} w={120} /> : <strong className="mono">{date(renew)}</strong>}<span className="dim small">charged by Stripe</span></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>Subscriptions</h3></div>
        {subs.error && <LoadError message={subs.error} onRetry={subs.reload} />}
        {subs.loading && <div className="stack-sm"><Skeleton h={18} w="40%" /><Skeleton h={60} /></div>}
        {subs.data?.length === 0 && (selfServeBilling()
          ? <Empty icon="card" title="No paid subscription" action={<Link to="/plans" className="btn btn-soft btn-sm">See plans</Link>}>You're on the free Directory Scout plan.</Empty>
          : <Empty icon="card" title="No subscription to pay">Your access is managed by your Omni Force Vector administrator.</Empty>)}
        {subs.data?.map((s) => (
          <div key={s.id} className="sub">
            <div className="row-between wrap-gap">
              <div className="row gap"><StatusPill s={s.status} /><span className="dim small">{s.cancel_at_period_end ? "Ends" : "Renews"} {date(s.current_period_end)}</span></div>
              <strong className="mono">{money(s.items.reduce((t, i) => t + i.plan.price_cents * i.quantity, 0))}/{s.items[0]?.plan.interval === "year" ? "yr" : "mo"}</strong>
            </div>
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Plan</th><th>Products</th><th>Seats</th><th className="num">Price</th></tr></thead>
                <tbody>
                  {s.items.map((i) => (
                    <tr key={i.plan.id}>
                      <td><strong>{i.plan.name}</strong></td>
                      <td>{planModules(i.plan).map((m) => <Pill key={m} tone={m}>{moduleLabel[m]}</Pill>)}</td>
                      <td className="mono">{i.plan.seats ?? "—"}</td>
                      <td className="num mono">{planPrice(i.plan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {orgAccess.length > 0 && (
          <p className="dim small note">
            You also use {orgAccess.map((a) => `${moduleLabel[a.module_key]} through ${a.organization_name}`).join(", ")}. Those plans are billed to the organization.
          </p>
        )}
      </section>

      <section className="panel flush">
        <div className="panel-head"><h3>Invoices</h3><span className="panel-sub">Last 24</span></div>
        {inv.error && <LoadError message={inv.error} onRetry={inv.reload} />}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Number</th><th>Status</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {inv.loading && <SkeletonRows cols={4} rows={2} />}
              {(inv.data ?? []).map((i) => (
                <tr key={i.id}>
                  <td>{date(i.created_at)}</td>
                  <td className="mono">{i.hosted_invoice_url ? <a href={i.hosted_invoice_url} target="_blank" rel="noopener noreferrer">{i.number}</a> : i.number}</td>
                  <td><StatusPill s={i.status} /></td>
                  <td className="num mono">{money(i.amount_paid_cents, i.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {inv.data?.length === 0 && <Empty icon="receipt" title="No invoices yet">Invoices appear here after your first payment.</Empty>}
      </section>
    </div>
  );
}
