import { AccountConsole } from "@/components/AccountConsole";
import { Arrow, Check, External, ProductIcon } from "@/components/Icons";
import { Wordmark } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { Pricing } from "@/components/Pricing";
import { ProductVisual } from "@/components/ProductVisual";
import { faqs, HUB_URL, platform, products, signupSteps, status } from "@/lib/site";

const stateLabel = { available: "Available", not_configured: "Not configured", not_live: "Not live yet" } as const;

export default function Home() {
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Nav />

      <main id="main">
        {/* HERO */}
        <section className="hero" id="top">
          <div className="hero-glow" aria-hidden="true" />
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Drone Directory · WSSO · Workforce 2.0</p>
              <h1>One account for the drone industry, your operations and your <span className="hl">AI workforce</span>.</h1>
              <p className="lede">
                OmniForce brings the Drone Directory, the WSSO business workspace and the Workforce 2.0 desktop app together
                under one account, with organizations, team seats and billing in one place.
              </p>
              <div className="hero-cta">
                <a className="btn btn-primary btn-lg" href={`${HUB_URL}/signup`}>Create free account <Arrow /></a>
                <a className="btn btn-ghost btn-lg" href="#products">Explore the products</a>
              </div>
              <ul className="hero-facts">
                <li><Check />Free Directory Scout plan</li>
                <li><Check />14-day WSSO trial</li>
                <li><Check />Payments by Stripe</li>
              </ul>
            </div>
            <AccountConsole />
          </div>
        </section>

        {/* PRODUCT STRIP */}
        <section id="products" className="section section-tight" aria-labelledby="products-h">
          <div className="wrap">
            <div className="section-head center">
              <p className="eyebrow">Three products</p>
              <h2 id="products-h">Each product does one job well</h2>
              <p className="dim">They keep their own data and their own logins today. OmniForce holds your identity, your organizations and your plans.</p>
            </div>
            <div className="strip">
              {products.map((p) => (
                <a key={p.key} href={`#${p.key}`} className={`strip-card m-${p.key}`}>
                  <span className="strip-ico"><ProductIcon m={p.key} /></span>
                  <span className="strip-main"><strong>{p.name}</strong><span className="dim">{p.headline}</span></span>
                  <Arrow />
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* PRODUCT SECTIONS */}
        {products.map((p, i) => (
          <section key={p.key} id={p.key} className={`section product m-${p.key} ${i % 2 ? "is-flipped" : ""}`} aria-labelledby={`${p.key}-h`}>
            <div className="wrap product-grid">
              <div className="product-copy">
                <p className="eyebrow eyebrow-m"><span className="dot" aria-hidden="true" />{p.eyebrow}</p>
                <h2 id={`${p.key}-h`}>{p.headline}</h2>
                {p.subhead && <p className="subhead">{p.subhead}</p>}
                <p className="dim lede-sm">{p.summary}</p>
                <ul className="chips" aria-label={p.chips[0]?.title}>
                  {p.chips.map((c) => <li key={c.label}>{c.label}</li>)}
                </ul>
                <div className="product-cta">
                  <a className="btn btn-primary" href={p.primary.href} target={p.primary.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                    {p.primary.label} {p.primary.href.startsWith("http") && <External />}
                  </a>
                  <a className="btn btn-ghost" href={p.secondary.href} target={p.secondary.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                    {p.secondary.label} {p.secondary.href.startsWith("http") && <External />}
                  </a>
                </div>
                <p className="product-of"><strong>With OmniForce:</strong> {p.omniforce}</p>
              </div>
              <div className="product-side">
                <ProductVisual m={p.key} />
              </div>
            </div>
            <div className="wrap">
              <ul className="features">
                {p.features.map((f) => (
                  <li key={f.title}><Check /><span><strong>{f.title}</strong><span className="dim">{f.body}</span></span></li>
                ))}
              </ul>
              <p className="product-foot dim">{p.operator} <a href={p.site} target="_blank" rel="noopener noreferrer">{p.siteLabel} <External /></a></p>
            </div>
          </section>
        ))}

        {/* PLATFORM */}
        <section id="platform" className="section section-band" aria-labelledby="platform-h">
          <div className="wrap">
            <div className="section-head">
              <p className="eyebrow">The OmniForce account</p>
              <h2 id="platform-h">One account that ties the products together</h2>
              <p className="dim">Products keep their own data and decide what you can do inside them. OmniForce decides who gets in, and handles your team and your bills.</p>
            </div>
            <div className="cards">
              {platform.map((c) => (
                <article key={c.title} className="card"><h3>{c.title}</h3><p className="dim">{c.body}</p></article>
              ))}
            </div>
            <ol className="steps">
              {signupSteps.map((s, i) => (
                <li key={s.title}><span className="step-n">{String(i + 1).padStart(2, "0")}</span><h3>{s.title}</h3><p className="dim">{s.body}</p></li>
              ))}
            </ol>
          </div>
        </section>

        {/* STATUS */}
        <section id="status" className="section" aria-labelledby="status-h">
          <div className="wrap status-grid">
            <div className="section-head">
              <p className="eyebrow">Integration status</p>
              <h2 id="status-h">What works today</h2>
              <p className="dim">We switch single sign-on on one product at a time, after that product's team has built and tested it. Until then, use each product's own login.</p>
            </div>
            <div className="status-table" role="table" aria-label="Integration status">
              {status.map((s) => (
                <div key={s.item} role="row" className="status-row">
                  <span role="cell" className="status-item"><strong>{s.item}</strong><span className="dim">{s.note}</span></span>
                  <span role="cell"><span className={`pill ${s.state === "available" ? "pill-ok" : "pill-muted"}`}><span className="pill-dot" />{stateLabel[s.state]}</span></span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="section section-band" aria-labelledby="pricing-h">
          <div className="wrap">
            <div className="section-head center">
              <p className="eyebrow">Pricing</p>
              <h2 id="pricing-h">Pay for the products you use</h2>
              <p className="dim">Prices in USD. Upgrade, downgrade or cancel any product from your account.</p>
            </div>
            <Pricing />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="section" aria-labelledby="faq-h">
          <div className="wrap faq-grid">
            <div className="section-head">
              <p className="eyebrow">FAQ</p>
              <h2 id="faq-h">Questions people ask first</h2>
              <p className="dim">Something else? Ask through any product's support page.</p>
            </div>
            <div className="faq">
              {faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p className="dim">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="cta" aria-labelledby="cta-h">
          <div className="wrap">
            <div className="cta-inner">
              <div>
                <h2 id="cta-h">Start with the Directory for free</h2>
                <p className="dim">Add WSSO for your team or Workforce 2.0 for yourself when you're ready.</p>
              </div>
              <div className="hero-cta">
                <a className="btn btn-primary btn-lg" href={`${HUB_URL}/signup`}>Create free account <Arrow /></a>
                <a className="btn btn-ghost btn-lg" href={`${HUB_URL}/login`}>Sign in</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <Wordmark />
            <p className="dim">One account for the Drone Directory, WSSO and Workforce 2.0.</p>
          </div>
          <nav aria-label="Products" className="footer-col">
            <h4>Products</h4>
            {products.map((p) => <a key={p.key} href={p.site} target="_blank" rel="noopener noreferrer">{p.name} <External /></a>)}
          </nav>
          <nav aria-label="OmniForce" className="footer-col">
            <h4>OmniForce</h4>
            <a href="#platform">Platform</a>
            <a href="#status">Integration status</a>
            <a href="#pricing">Pricing</a>
            <a href={`${HUB_URL}/login`}>Sign in</a>
            <a href={`${HUB_URL}/signup`}>Create account</a>
          </nav>
          <nav aria-label="Legal" className="footer-col">
            <h4>Legal</h4>
            <a href="#">Terms of Service</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Refunds and cancellation</a>
          </nav>
        </div>
        <div className="wrap footer-base dim">
          <span>© {new Date().getFullYear()} OmniForce.</span>
          <span>Drone Directory is operated by HG Consulting Services, LLC with My Drone Force and TLB Enterprises. WSSO is by TLBISBIG Consulting Group, LLC.</span>
        </div>
      </footer>
    </>
  );
}
