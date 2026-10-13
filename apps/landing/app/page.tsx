import { AccountConsole } from "@/components/AccountConsole";
import { Arrow, ProductIcon } from "@/components/Icons";
import { Pricing } from "@/components/Pricing";
import { SiteFrame } from "@/components/SiteFrame";
import { benefits, faqs, headline, howItWorks, HUB_URL, products, supporting } from "@/lib/site";

export default function Home() {
  return (
    <SiteFrame>
      <section className="hero" id="top">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <img className="hero-logo" src="/omniforce-vector-logo.png" alt="Omni Force Vector" />
            <h1>{headline}</h1>
            <p className="lede">{supporting}</p>
            <p className="dim">
              Omni Force Vector is the central account: registration, organizations, subscriptions and a hub for the modules your plan enables. It does not sign you into every application.
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href={`${HUB_URL}/signup`}>Create account <Arrow /></a>
              <a className="btn btn-ghost btn-lg" href="/how-it-works">How it works</a>
            </div>
          </div>
          <AccountConsole />
        </div>
      </section>

      <section id="products" className="section" aria-labelledby="products-h">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Three platforms</p>
            <h2 id="products-h">What each product is for</h2>
          </div>
          <div className="cards cards-3">
            {products.map((p) => (
              <article key={p.key} className={`card m-${p.key}`}>
                <span className="strip-ico"><ProductIcon m={p.key} /></span>
                <h3>{p.name}</h3>
                <p className="dim">{p.position}</p>
                <a className="text-link" href={`/products/${p.key}`}>View {p.name} <Arrow /></a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-band" aria-labelledby="sub-h">
        <div className="wrap narrow">
          <p className="eyebrow">One subscription</p>
          <h2 id="sub-h">Access follows the plan, not a blanket login</h2>
          <p className="dim">
            A configured plan grants the modules listed on it — one product, or the Directory + WSSO bundle. Seat limits apply when the plan has them. Workforce 2.0’s own free plan, paid plans and media credits stay inside Workforce unless an Omni Force Vector plan explicitly includes them. None does today. Subscribing does not create a WSSO workspace or a directory account while provisioning is disabled.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="how-h">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 id="how-h">From account to the module you are allowed to open</h2>
          </div>
          <ol className="steps">
            {howItWorks.map((s) => (
              <li key={s.n}><span className="step-n">{s.n}</span><h3>{s.title}</h3><p className="dim">{s.body.split(". ")[0]}.</p></li>
            ))}
          </ol>
          <p><a className="text-link" href="/how-it-works">Read the full journey <Arrow /></a></p>
        </div>
      </section>

      <section className="section section-band" aria-labelledby="benefits-h">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Central access</p>
            <h2 id="benefits-h">What the hub is responsible for</h2>
          </div>
          <div className="cards">
            {benefits.map((b) => (
              <article key={b.title} className="card"><h3>{b.title}</h3><p className="dim">{b.body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="section" aria-labelledby="pricing-h">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Pricing</p>
            <h2 id="pricing-h">Plans that are actually configured</h2>
            <p className="dim">A sample of the catalogue. Paid Omni Force Vector prices are not published yet.</p>
          </div>
          <Pricing compact />
        </div>
      </section>

      <section className="section section-band" aria-labelledby="faq-h">
        <div className="wrap faq-grid">
          <div className="section-head">
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-h">Straight answers</h2>
          </div>
          <div className="faq">
            {faqs.slice(0, 5).map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p className="dim">{f.a}</p>
              </details>
            ))}
          </div>
          <p><a className="text-link" href="/faq">All questions <Arrow /></a></p>
        </div>
      </section>

      <section className="cta" aria-labelledby="cta-h">
        <div className="wrap">
          <div className="cta-inner">
            <div>
              <h2 id="cta-h">Create the central account</h2>
              <p className="dim">Then choose a configured plan and open the modules it enables.</p>
            </div>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href={`${HUB_URL}/signup`}>Create account <Arrow /></a>
              <a className="btn btn-ghost btn-lg" href={`${HUB_URL}/login`}>Sign in</a>
            </div>
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
