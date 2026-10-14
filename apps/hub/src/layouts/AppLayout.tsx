import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { hasAccess, useAuth } from "../auth/AuthProvider";
import { ModuleIcon } from "../components/ui";
import { moduleLabel } from "../lib/format";
import type { ModuleKey } from "../lib/types";
import { Shell, UserMenu, type NavSection } from "./Shell";
import { selfServeBilling } from "../lib/supabase";

export { UserMenu };

const order: ModuleKey[] = ["directory", "wsso", "workforce"];

export function ModuleSwitcher() {
  const { access } = useAuth();
  const nav = useNavigate();
  return (
    <nav className="mswitch" aria-label="Switch module">
      {order.map((m) => {
        const ok = hasAccess(access, m);
        return (
          <NavLink
            key={m}
            to={`/app/m/${m}`}
            className={({ isActive }) => `mswitch-item m-${m} ${isActive ? "is-active" : ""} ${ok ? "" : "is-locked"}`}
            onClick={(e) => { if (!ok && selfServeBilling()) { e.preventDefault(); nav(`/plans?module=${m}`); } }}
            title={ok ? `${moduleLabel[m]} overview` : selfServeBilling() ? `Add ${moduleLabel[m]} to your plan` : `No access to ${moduleLabel[m]} yet`}
          >
            <ModuleIcon m={m} size={16} />
            <span>{moduleLabel[m]}</span>
            {!ok && selfServeBilling() && <span className="lock" aria-label="Not in your plan">+</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppLayout() {
  const { isAdmin, profile } = useAuth();
  const sections: NavSection[] = [
    { label: "Account", items: [
      { to: "/app", label: "Dashboard", icon: "home", end: true },
      { to: "/app/orgs", label: "Organizations", icon: "building" },
      { to: "/app/billing", label: selfServeBilling() ? "Plans and billing" : "Billing", icon: "card" },
      { to: "/app/settings", label: "Profile", icon: "user" },
    ] },
    { label: "Modules", items: order.map((m) => ({ to: `/app/m/${m}`, label: moduleLabel[m], dotClass: `m-${m}` })) },
    ...(isAdmin ? [{ label: "Platform", items: [{ to: "/admin", label: "Admin console", icon: "shield" as const }] }] : []),
  ];
  return (
    <Shell
      sections={sections}
      home="/app"
      topCenter={<ModuleSwitcher />}
      sideFoot={profile && (
        <div className="side-card">
          <span className="dim">Omni Force Vector ID</span>
          <strong className="mono">{profile.omniforce_id}</strong>
        </div>
      )}
    >
      <Outlet />
    </Shell>
  );
}
