import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { billing, orgs } from "../../lib/api";
import { DEMO } from "../../lib/supabase";
import { money, moduleLabel, planPrice } from "../../lib/format";
import type { ModuleKey, Plan } from "../../lib/types";
import { Alert, Button, Icon, ModuleIcon, Pill, Spinner, Wordmark, useLoad } from "../../components/ui";
import { StepsBar } from "../auth/Signup";

type Group = ModuleKey | "bundle";
const groups: Group[] = ["directory", "wsso", "workforce", "bundle"];
const groupLabel: Record<Group, string> = { ...moduleLabel, bundle: "Bundles" };

export function ChoosePlan() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const orgId = params.get("org");
  const orgList = useLoad(() => (orgId ? orgs.list() : Promise.resolve([])), [orgId]);
  const buyingFor = orgId ? orgList.data?.find((o) => o.id === orgId) : null;
  const audience = orgId ? "organization" : "individual";
  const { data: allPlans, error } = useLoad(() => billing.plans());
  const plans = useMemo(() => allPlans?.filter((p) => p.audience === "any" || p.audience === audience) ?? null, [allPlans, audience]);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [tab, setTab] = useState<Group>((params.get("module") as Group) || "directory");
  const [picked, setPicked] = useState<Partial<Record<Group, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!plans) return [];
    return plans.filter((p) => (tab === "bundle" ? !p.module_key : p.module_key === tab))
      .filter((p) => p.interval === "free" || p.interval === "license" || p.interval === interval);
  }, [plans, tab, interval]);

  const chosen: Plan[] = useMemo(() => {
    if (!plans) return [];
    const ids = Object.values(picked).filter(Boolean) as string[];
    return plans.filter((p) => ids.includes(p.id));
  }, [plans, picked]);

  const paid = chosen.filter((p) => p.interval === "month" || p.interval === "year");
  const total = paid.reduce((s, p) => s + p.price_cents, 0);
  const bundlePicked = !!picked.bundle;

  function pick(p: Plan) {
    const g: Group = p.module_key ?? "bundle";
    setPicked((cur) => {
      const next = { ...cur, [g]: cur[g] === p.id ? undefined : p.id };
      // a bundle replaces the single-module picks it covers
      if (g === "bundle" && next.bundle) p.bundle_modules.forEach((m) => delete next[m]);
      if (g !== "bundle" && next.bundle) {
        const b = plans?.find((x) => x.id === next.bundle);
        if (b?.bundle_modules.includes(g)) delete next.bundle;
      }
      return next;
    });
  }

  async function pay() {
    setErr(null);
    if (chosen.some((p) => p.interval === "license")) {
      // Workforce licences are issued after a sales call
      if (!paid.length) return nav("/app/m/workforce");
    }
    if (!paid.length) return nav(orgId ? `/app/orgs/${orgId}` : "/go");
    setBusy(true);
    try {
      const url = await billing.checkout(paid.map((p) => p.id), orgId ?? undefined);
      if (DEMO) nav("/checkout/success?demo=1");
      else window.location.assign(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Checkout could not start. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="onboard">
      <header className="onboard-top">
        <Wordmark />
        <Link to="/app" className="btn btn-text btn-sm">Skip for now <Icon name="arrowRight" size={14} /></Link>
      </header>
      <div className="onboard-grid">
        <section className="stack">
          <div className="stack-sm">
            {!buyingFor && <StepsBar step={3} />}
            <p className="step-tag">{buyingFor ? "Organization plan" : "Step 3 of 4 · Choose plan"}</p>
            <h2>{buyingFor ? `Pick products for ${buyingFor.name}` : "Pick the products you need"}</h2>
            {buyingFor && <p className="dim small">Billed to the organization. Owners get a seat automatically; give other members seats on the organization page.</p>}
            <p className="dim">Choose one plan per product, or a bundle. Change or cancel any product later.</p>
          </div>

          <div className="row-between wrap-gap">
            <div className="seg" role="tablist" aria-label="Products">
              {groups.map((g) => (
                <button key={g} role="tab" aria-selected={tab === g} className={`seg-btn m-${g}`} onClick={() => setTab(g)}>
                  {g !== "bundle" && <ModuleIcon m={g} size={15} />}
                  {groupLabel[g]}
                  {picked[g] && <span className="seg-dot" aria-label="selected" />}
                </button>
              ))}
            </div>
            <div className="seg seg-sm" role="group" aria-label="Billing interval">
              <button className="seg-btn" aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Monthly</button>
              <button className="seg-btn" aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Yearly · 2 months free</button>
            </div>
          </div>

          {error && <Alert>{error}</Alert>}
          {tab === "workforce" && (
            <Alert tone="info" title="Workforce 2.0 is a desktop app">
              Its task-based plans (Free, Basic, Pro, Enterprise) are on{" "}
              <a href="https://workforce.trackmystartup.com/" target="_blank" rel="noopener noreferrer">workforce.trackmystartup.com</a>.
              Omni Force Vector licences below are arranged with our team.
            </Alert>
          )}
          {!plans ? <Spinner label="Loading plans" /> : (
            <div className="plan-list">
              {visible.map((p) => {
                const on = Object.values(picked).includes(p.id);
                const coveredByBundle = bundlePicked && p.module_key && plans.find((b) => b.id === picked.bundle)?.bundle_modules.includes(p.module_key);
                return (
                  <button key={p.id} className={`plan-opt m-${p.module_key ?? "bundle"} ${on ? "is-on" : ""}`} onClick={() => pick(p)} aria-pressed={on} disabled={!!coveredByBundle}>
                    <span className="radio" aria-hidden="true" />
                    <span className="plan-opt-main">
                      <strong>{p.name}</strong>
                      <span className="dim small">
                        {p.seats ? `${p.seats} seats · ` : ""}
                        {p.trial_days ? `${p.trial_days}-day trial · ` : ""}
                        {p.module_key ? (p.interval === "license" ? "Installed on your server" : "") : p.bundle_modules.map((m) => moduleLabel[m]).join(" + ")}
                        {coveredByBundle ? "Included in your bundle" : ""}
                      </span>
                    </span>
                    <span className="plan-opt-price mono">{planPrice(p)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="cart">
          <h3>Your selection</h3>
          {chosen.length === 0 ? (
            <p className="dim small">Nothing picked yet. Every account includes the free Directory Scout plan.</p>
          ) : (
            <ul className="cart-list">
              {chosen.map((p) => (
                <li key={p.id}>
                  <span className={`dot m-${p.module_key ?? "bundle"}`} />
                  <span className="grow">
                    <strong>{p.name}</strong>
                    <span className="dim small">{p.module_key ? moduleLabel[p.module_key] : "Bundle"}</span>
                  </span>
                  <span className="mono">{planPrice(p)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="cart-total">
            <span>Due today</span>
            <strong className="mono">{money(paid.some((p) => p.trial_days) ? paid.filter((p) => !p.trial_days).reduce((s, p) => s + p.price_cents, 0) : total)}</strong>
          </div>
          {paid.some((p) => p.trial_days) && <p className="dim small">Trial plans are charged when the trial ends.</p>}
          {err && <Alert>{err}</Alert>}
          <Button onClick={pay} loading={busy} className="btn-block">
            {paid.length ? "Continue to secure payment" : "Continue with free plan"}
          </Button>
          <p className="dim small center"><Pill>Stripe</Pill> Card details are handled by Stripe, never stored by Omni Force Vector.</p>
        </aside>
      </div>
    </div>
  );
}
