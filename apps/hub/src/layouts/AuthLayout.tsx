import { Link, Outlet } from "react-router-dom";
import { ModuleIcon, Wordmark } from "../components/ui";
import { DEMO, LANDING_URL } from "../lib/supabase";

export function AuthLayout() {
  return (
    <div className="auth-shell">
      <aside className="auth-side">
        <a href={LANDING_URL} className="auth-brand" aria-label="OmniForce home"><Wordmark size={32} /></a>
        <div className="auth-pitch">
          <p className="eyebrow">One account · three products</p>
          <h1>The drone industry, your operations and your AI workforce.</h1>
          <p className="lede">Your OmniForce account holds your identity, organizations, plans and billing for every product.</p>
          <ul className="auth-mods">
            <li className="m-directory">
              <span className="mod-ico"><ModuleIcon m="directory" /></span>
              <span><strong>Drone Directory</strong><span className="dim">Pilots, trainers, providers and vendors</span></span>
              <span className="pill pill-neutral">SSO not configured</span>
            </li>
            <li className="m-wsso">
              <span className="mod-ico"><ModuleIcon m="wsso" /></span>
              <span><strong>WSSO</strong><span className="dim">Run the company in one workspace</span></span>
              <span className="pill pill-neutral">SSO not configured</span>
            </li>
            <li className="m-workforce">
              <span className="mod-ico"><ModuleIcon m="workforce" /></span>
              <span><strong>Workforce 2.0</strong><span className="dim">AI workers on your own computer</span></span>
              <span className="pill pill-neutral">Desktop app</span>
            </li>
          </ul>
        </div>
        <p className="auth-note">Until single sign-on is switched on for a product, keep using that product's own login. Payments are handled by Stripe.</p>
      </aside>
      <main className="auth-main" id="main">
        {DEMO && <div className="demo-flag">Demo mode · sample data · any 6-digit code works</div>}
        <div className="auth-card">
          <Outlet />
        </div>
        <nav className="auth-foot small" aria-label="Account">
          <Link to="/login">Sign in</Link>
          <Link to="/signup">Create account</Link>
          <Link to="/forgot">Reset password</Link>
          <a href={LANDING_URL}>omniforce.app</a>
        </nav>
      </main>
    </div>
  );
}
