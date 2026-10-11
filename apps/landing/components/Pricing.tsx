"use client";

import { useState } from "react";
import { HUB_URL, plans, type Plan } from "@/lib/site";
import { External } from "./Icons";

const groups: { key: Plan["module"]; label: string; note: string }[] = [
  { key: "directory", label: "Drone Directory", note: "Every OmniForce account starts on the free Scout plan." },
  { key: "wsso", label: "WSSO", note: "Monthly or yearly through Stripe. The company admin pays for every seat." },
  { key: "workforce", label: "Workforce 2.0", note: "Sold on workforce.trackmystartup.com. Plans count tasks; extra tasks are $0.03 each." },
  { key: "bundle", label: "Bundles", note: "Save when you combine products." },
];

function price(p: Plan, yearly: boolean) {
  if (p.priceLabel) return { big: p.priceLabel, small: "" };
  if (p.monthly === null) return { big: "Quote", small: p.seats ?? "" };
  if (p.monthly === 0) return { big: "Free", small: "forever" };
  // Yearly = 10 months billed (2 months free). Change in one place if pricing differs.
  const v = yearly && !p.noYearly ? p.monthly * 10 : p.monthly;
  return { big: `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, small: yearly && !p.noYearly ? "per year" : "per month" };
}

export function Pricing() {
  const [group, setGroup] = useState<Plan["module"]>("wsso");
  const [yearly, setYearly] = useState(false);
  const list = plans.filter((p) => p.module === group);
  const g = groups.find((x) => x.key === group)!;
  const yearlyApplies = list.some((p) => !p.noYearly && (p.monthly ?? 0) > 0);

  return (
    <div className="pricing">
      <div className="pricing-controls">
        <div className="seg" role="tablist" aria-label="Choose a product">
          {groups.map((x) => (
            <button key={x.key} id={`tab-${x.key}`} role="tab" aria-selected={group === x.key} aria-controls="plan-panel" className={`seg-btn m-${x.key}`} onClick={() => setGroup(x.key)}>
              {x.key !== "bundle" && <span className="dot" aria-hidden="true" />}{x.label}
            </button>
          ))}
        </div>
        <label className={`toggle ${yearlyApplies ? "" : "is-off"}`}>
          <input id="billing-yearly" type="checkbox" checked={yearly && yearlyApplies} disabled={!yearlyApplies} onChange={(e) => setYearly(e.target.checked)} />
          <span className="track" aria-hidden="true" />
          Yearly billing <span className="dim">· 2 months free</span>
        </label>
      </div>
      <p className="dim pricing-note">{g.note}</p>

      <div id="plan-panel" role="tabpanel" aria-labelledby={`tab-${group}`} className={`plan-grid count-${list.length}`}>
        {list.map((p) => {
          const pr = price(p, yearly);
          return (
            <article key={p.name} className={`plan ${p.featured ? "plan-featured" : ""} m-${p.module}`}>
              <header>
                <h3>{p.name}</h3>
                {p.featured && <span className="pill pill-brand">Popular</span>}
              </header>
              <p className="plan-price"><span className="big">{pr.big}</span>{pr.small && <span className="dim">{pr.small}</span>}</p>
              <p className="plan-note">{p.seats && p.monthly !== null ? <strong className="fg">{p.seats} · </strong> : null}{p.note}</p>
              {p.placeholder && <p className="placeholder">Draft price</p>}
              {p.external ? (
                <a className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`} href={p.external.href} target="_blank" rel="noopener noreferrer">
                  {p.external.label} <External /><span className="visually-hidden"> (opens workforce.trackmystartup.com)</span>
                </a>
              ) : (
                <a className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`} href={`${HUB_URL}/signup?plan=${encodeURIComponent(p.module + ":" + p.name)}`}>
                  {p.monthly === null ? "Talk to us" : p.monthly === 0 ? "Create free account" : "Choose plan"}
                </a>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
