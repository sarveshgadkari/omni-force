import type { Metadata } from "next";
import { Check, ProductIcon } from "@/components/Icons";
import { PageHero, SiteFrame } from "@/components/SiteFrame";
import { howItWorks, products } from "@/lib/site";

export const metadata: Metadata = {
  title: "How it works · Omni Force Vector",
  description: "Create an Omni Force Vector account, join an organization, choose a configured plan, and open the modules that plan enables.",
};

export default function HowItWorksPage() {
  return (
    <SiteFrame>
      <PageHero
        eyebrow="How it works"
        title="The path from an account to a module"
        lede="Omni Force Vector authenticates the central account. WSSO and the Drone Directory still use their own logins. Subscribing does not provision those applications."
      />
      <section className="section">
        <div className="wrap">
          <ol className="journey">
            {howItWorks.map((s) => (
              <li key={s.n}>
                <span className="step-n">{s.n}</span>
                <div>
                  <h2>{s.title}</h2>
                  <p className="dim">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="section section-band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How they fit</p>
            <h2>Three products, one hub</h2>
            <p className="dim">Each product keeps its job. Omni Force Vector is where the account, the organization and the entitlement live.</p>
          </div>
          <div className="cards cards-3">
            {products.map((p) => (
              <article key={p.key} className={`card m-${p.key}`}>
                <span className="strip-ico"><ProductIcon m={p.key} /></span>
                <h3>{p.name}</h3>
                <p className="dim">{p.position}</p>
                <p className="dim">{p.value}</p>
                <a className="text-link" href={`/products/${p.key}`}>Product details</a>
              </article>
            ))}
          </div>
          <ul className="features">
            <li><Check /><span><strong>Central authentication</strong><span className="dim">Email, password and the verification code belong to Omni Force Vector.</span></span></li>
            <li><Check /><span><strong>Application login</strong><span className="dim">WSSO and the Drone Directory are not configured for single sign-on. Workforce licence activation from the app is not live.</span></span></li>
            <li><Check /><span><strong>No automatic provisioning</strong><span className="dim">A subscription does not create an account in WSSO, DirectoryUp or Workforce while provisioning is disabled.</span></span></li>
          </ul>
        </div>
      </section>
    </SiteFrame>
  );
}
