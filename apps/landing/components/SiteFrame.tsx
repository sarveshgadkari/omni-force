import { HUB_URL, legalLinks, navLinks, products } from "@/lib/site";
import { External } from "./Icons";
import { Nav } from "./Nav";
import { Wordmark } from "./Logo";

export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Nav />
      <main id="main">{children}</main>
      <footer className="footer">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <Wordmark />
            <p className="dim">The central account for WSSO, the Drone Directory and Workforce 2.0.</p>
          </div>
          <nav aria-label="Products" className="footer-col">
            <h4>Products</h4>
            {products.map((p) => (
              <a key={p.key} href={`/products/${p.key}`}>{p.name}</a>
            ))}
          </nav>
          <nav aria-label="Omni Force Vector" className="footer-col">
            <h4>Omni Force Vector</h4>
            {navLinks.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
            <a href={`${HUB_URL}/login`}>Sign in</a>
            <a href={`${HUB_URL}/signup`}>Create account</a>
            {legalLinks.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
          </nav>
          <nav aria-label="Product sites" className="footer-col">
            <h4>Product sites</h4>
            {products.map((p) => (
              <a key={p.key} href={p.site} target="_blank" rel="noopener noreferrer">{p.name} <External /></a>
            ))}
          </nav>
        </div>
        <div className="wrap footer-base dim">
          <span>© {new Date().getFullYear()} Omni Force Vector.</span>
          <span>WSSO keeps its own login. Directory sign-in through OmniForce uses a DirectoryUp login token once an administrator switches it on.</span>
        </div>
      </footer>
    </>
  );
}

export function PageHero({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: string }) {
  return (
    <header className="page-hero">
      <div className="wrap">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </div>
    </header>
  );
}
