import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Icon, Wordmark, type IconName } from "../components/ui";
import { DEMO } from "../lib/supabase";
import { getTheme, setTheme, type Theme } from "../lib/theme";

export type NavItem = { to: string; label: string; icon?: IconName; end?: boolean; dotClass?: string };
export type NavSection = { label?: string; items: NavItem[] };

/**
 * App frame shared by the account area and the admin console: sticky sidebar on
 * desktop, off-canvas drawer below 1024px, sticky top bar with page-level tools.
 */
export function Shell({ sections, topCenter, home, tag, sideFoot, children }: {
  sections: NavSection[]; topCenter?: ReactNode; home: string; tag?: string; sideFoot?: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  return (
    <div className={`app-shell ${DEMO ? "has-demo" : ""} ${open ? "nav-open" : ""}`}>
      {DEMO && <div className="demo-bar">Demo mode · sample data, nothing is saved</div>}
      <aside className="sidebar" id="app-nav" aria-label="Main navigation">
        <NavLink to={home} className="side-brand"><Wordmark size={30} />{tag && <span className="admin-tag">{tag}</span>}</NavLink>
        {sections.map((s, i) => (
          <nav key={i} aria-label={s.label ?? "Primary"} className="stack-xs">
            {s.label && <p className="side-label">{s.label}</p>}
            {s.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className={`side-link ${it.dotClass ?? ""}`}>
                {it.icon ? <Icon name={it.icon} /> : <span className="dot" aria-hidden="true" />}
                <span>{it.label}</span>
              </NavLink>
            ))}
          </nav>
        ))}
        {sideFoot && <div className="side-foot">{sideFoot}</div>}
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="app-nav" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? "close" : "menu"} size={20} />
        </button>
        <NavLink to={home} className="topbar-brand" aria-label="Omni Force Vector home"><Wordmark size={26} /></NavLink>
        {topCenter}
        <span className="topbar-spacer" />
        <UserMenu />
      </header>
      <main className="content" id="main"><Breadcrumbs />{children}</main>
    </div>
  );
}

const CRUMB: Record<string, string> = {
  app: "Dashboard", admin: "Admin", orgs: "Organizations", billing: "Plans and billing", settings: "Profile",
  users: "Users", plans: "Plans", organizations: "Organizations", apps: "Applications", links: "Account links",
  integrations: "Integrations", installations: "Installations", audit: "Audit log", m: "Modules",
  directory: "Drone Directory", wsso: "WSSO", workforce: "Workforce 2.0",
};

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const crumbs = parts.map((part, i) => ({
    href: `/${parts.slice(0, i + 1).join("/")}`,
    label: CRUMB[part] ?? "Details",
    last: i === parts.length - 1,
  }));
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <span key={c.href} className="crumbs-item">
          {i > 0 && <span className="crumbs-sep" aria-hidden="true">/</span>}
          {c.last ? <span aria-current="page">{c.label}</span> : <Link to={c.href}>{c.label}</Link>}
        </span>
      ))}
    </nav>
  );
}

export function UserMenu() {
  const { profile, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setT] = useState<Theme>(getTheme());
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!profile) return null;
  const initials = `${profile.first_name[0] ?? ""}${profile.last_name[0] ?? ""}`.toUpperCase() || "?";
  const go = (to: string) => { setOpen(false); nav(to); };
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div className="umenu" ref={ref}>
      <button type="button" className="umenu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar" aria-hidden="true">{initials}</span>
        <span className="umenu-id">
          <strong>{profile.first_name} {profile.last_name}</strong>
          <span className="mono dim">{profile.omniforce_id}</span>
        </span>
        <Icon name="chevronDown" size={16} className="dim" />
      </button>
      {open && (
        <div className="umenu-pop" role="menu" aria-label="Account" onKeyDown={onMenuKey}>
          <div className="umenu-head"><strong>{profile.first_name} {profile.last_name}</strong><span className="dim small">{profile.email}</span></div>
          <button role="menuitem" onClick={() => go("/app")}><Icon name="home" />Dashboard</button>
          <button role="menuitem" onClick={() => go("/app/settings")}><Icon name="user" />Profile and preferences</button>
          <button role="menuitem" onClick={() => go("/app/orgs")}><Icon name="building" />Organizations</button>
          <button role="menuitem" onClick={() => go("/app/billing")}><Icon name="card" />Plans and billing</button>
          {isAdmin && <button role="menuitem" onClick={() => go("/admin")}><Icon name="shield" />Admin console</button>}
          <hr />
          <button role="menuitem" onClick={() => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); setT(t); }}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />{theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          </button>
          <button role="menuitem" onClick={async () => { setOpen(false); await signOut(); nav("/login"); }}><Icon name="logout" />Sign out</button>
        </div>
      )}
    </div>
  );
}
