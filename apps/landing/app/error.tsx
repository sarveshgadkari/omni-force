"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="page-hero">
      <div className="wrap">
        <img className="hero-logo" src="/omniforce-vector-logo.png" alt="Omni Force Vector" />
        <p className="eyebrow">Something went wrong</p>
        <h1>This page could not be shown</h1>
        <p className="lede">The public site hit an error while rendering. Your account and subscriptions are unchanged.</p>
        <div className="hero-cta" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-primary" onClick={() => reset()}>Try again</button>
          <a className="btn btn-ghost" href="/">Homepage</a>
        </div>
      </div>
    </main>
  );
}
