import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, External } from "@/components/Icons";
import { PageHero, SiteFrame } from "@/components/SiteFrame";
import { Screenshot } from "@/components/Screenshot";
import { ProductShot } from "@/components/ProductShot";
import { productByKey, products, type ModuleKey } from "@/lib/site";

const keys = new Set(products.map((p) => p.key));

export function generateStaticParams() {
  return products.map((p) => ({ key: p.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const product = keys.has(key as ModuleKey) ? productByKey[key as ModuleKey] : null;
  if (!product) return { title: "Product · Omni Force Vector" };
  return { title: `${product.name} · Omni Force Vector`, description: product.summary };
}

export default async function ProductPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!keys.has(key as ModuleKey)) notFound();
  const p = productByKey[key as ModuleKey];

  return (
    <SiteFrame>
      <div className={`m-${p.key}`}>
        <PageHero eyebrow={p.eyebrow} title={p.position} lede={p.summary} />
        <div className="wrap product-hero-shot"><ProductShot m={p.key} /></div>
        <section className="section">
          <div className="wrap">
            <p className="dim lede-sm">{p.value}</p>
            <h2 className="block-title">Verified capabilities</h2>
            <ul className="features">
              {p.features.map((f) => (
                <li key={f.title}><Check /><span><strong>{f.title}</strong><span className="dim">{f.body}</span></span></li>
              ))}
            </ul>
          </div>
        </section>
        <section className="section section-band" aria-labelledby="in-hub-h">
          <div className="wrap tour-row">
            <div className="tour-copy">
              <p className="eyebrow">In your account</p>
              <h2 id="in-hub-h">{p.name}, right next to everything else</h2>
              <p className="dim">
                Your {p.name} plan and access live in the same Omni Force Vector account as the rest of your tools, alongside your team and billing.
              </p>
              <p className="fine-print">
                {p.key === "workforce"
                  ? "Workforce 2.0 is downloaded from its own site; your plan and licence keys stay in your account."
                  : `${p.name} keeps its own login for now.`}
              </p>
            </div>
            <Screenshot
              name={`module-${p.key}`}
              alt={`The ${p.name} page in the Omni Force Vector hub with plan and access details`}
              caption="Sample data shown."
              sizes="(max-width: 1080px) 100vw, 680px"
            />
          </div>
        </section>
        <section className="section">
          <div className="wrap split">
            <div>
              <h2>Where it is used</h2>
              <ul className="plain">
                {p.uses.map((u) => <li key={u}>{u}</li>)}
              </ul>
            </div>
            <div>
              <h2>How you use it</h2>
              <ol className="workflow">
                {p.workflow.map((w, i) => (
                  <li key={w.title}><span className="step-n">{String(i + 1).padStart(2, "0")}</span><div><strong>{w.title}</strong><p className="dim">{w.body}</p></div></li>
                ))}
              </ol>
            </div>
          </div>
        </section>
        <section className="section section-band">
          <div className="wrap narrow">
            <h2>Omni Force Vector access</h2>
            <p className="dim">{p.access}</p>
            <p className="product-of dim">{p.operator}</p>
            <div className="hero-cta">
              <a className="btn btn-primary" href={p.site} target="_blank" rel="noopener noreferrer">{p.cta} <External /></a>
              <a className="btn btn-ghost" href="/pricing">See configured plans</a>
            </div>
            <div className="faq">
              {p.faqs.map((f) => (
                <details key={f.q}><summary>{f.q}</summary><p className="dim">{f.a}</p></details>
              ))}
            </div>
          </div>
        </section>
      </div>
    </SiteFrame>
  );
}
