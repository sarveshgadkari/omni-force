import { SiteFrame } from "@/components/SiteFrame";

export default function NotFound() {
  return (
    <SiteFrame>
      <header className="page-hero">
        <div className="wrap">
          <img className="hero-logo" src="/omniforce-vector-logo.png" alt="Omni Force Vector" />
          <p className="eyebrow">404</p>
          <h1>That page is not on this site</h1>
          <p className="lede">The address does not match a public Omni Force Vector page.</p>
          <p style={{ marginTop: 20 }}><a className="btn btn-primary" href="/">Back to the homepage</a></p>
        </div>
      </header>
    </SiteFrame>
  );
}
