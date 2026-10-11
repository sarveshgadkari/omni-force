import { useState } from "react";
import { admin } from "../../lib/api";
import { moduleLabel, planModules } from "../../lib/format";
import type { Plan } from "../../lib/types";
import { Alert, Button, Pill, useLoad } from "../../components/ui";

export function AdminPlans() {
  const plans = useLoad(() => admin.plans());
  const [edit, setEdit] = useState<Record<string, Partial<Plan>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const val = <K extends keyof Plan>(p: Plan, k: K) => (edit[p.id]?.[k] ?? p[k]) as Plan[K];
  const set = (p: Plan, k: keyof Plan, v: unknown) => setEdit((e) => ({ ...e, [p.id]: { ...e[p.id], [k]: v } }));

  return (
    <div className="page">
      <div className="page-head"><div><p className="eyebrow">Configuration</p><h1>Plans and modules</h1><p className="dim page-desc">Prices, Stripe price IDs and the plan code each product receives.</p></div></div>
      <Alert tone="info">
        <strong>Module mapping</strong> is the value sent to each module when a plan is active: the DirectoryUp <span className="mono">subscription_id</span>, or the WSSO plan code. Prices must match the Stripe price.
      </Alert>
      {msg && <Alert tone="ok">{msg}</Alert>}
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Plan</th><th>Grants</th><th>Billing</th><th className="num">Price (USD)</th><th>Stripe price</th><th>Module mapping</th><th>Visible</th><th className="actions"><span className="visually-hidden">Save</span></th></tr></thead>
            <tbody>
              {(plans.data ?? []).map((p) => {
                const dirty = !!edit[p.id];
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><div className="mono dim small">{p.code}</div></td>
                    <td>{planModules(p).map((m) => <Pill key={m} tone={m}>{moduleLabel[m]}</Pill>)}</td>
                    <td>{p.interval}</td>
                    <td className="num">
                      {p.interval === "month" || p.interval === "year" ? (
                        <input id={`price-${p.id}`} aria-label={`Price for ${p.name}`} className="cell-input num mono" type="number" min={0} step={1} value={val(p, "price_cents") / 100} onChange={(e) => set(p, "price_cents", Math.round(Number(e.target.value) * 100))} />
                      ) : <span className="dim">—</span>}
                    </td>
                    <td><input id={`stripe-${p.id}`} aria-label={`Stripe price for ${p.name}`} className="cell-input mono" placeholder="price_…" value={val(p, "stripe_price_id") ?? ""} onChange={(e) => set(p, "stripe_price_id", e.target.value || null)} /></td>
                    <td><input id={`ext-${p.id}`} aria-label={`Module mapping for ${p.name}`} className="cell-input mono" value={val(p, "external_ref") ?? ""} onChange={(e) => set(p, "external_ref", e.target.value || null)} /></td>
                    <td><input id={`pub-${p.id}`} type="checkbox" checked={val(p, "is_public")} onChange={(e) => set(p, "is_public", e.target.checked)} aria-label="Visible on pricing" /></td>
                    <td>
                      <Button className="btn-sm" variant={dirty ? "primary" : "ghost"} disabled={!dirty} loading={saving === p.id}
                        onClick={async () => { setSaving(p.id); try { await admin.savePlan({ id: p.id, ...edit[p.id] }); setEdit((e) => { const n = { ...e }; delete n[p.id]; return n; }); setMsg(`Saved ${p.name}.`); plans.reload(); } finally { setSaving(null); } }}>
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
