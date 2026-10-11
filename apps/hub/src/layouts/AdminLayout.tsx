import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "../components/ui";
import { Shell, type NavSection } from "./Shell";

const sections: NavSection[] = [
  { label: "Platform", items: [
    { to: "/admin", label: "Overview", icon: "grid", end: true },
    { to: "/admin/users", label: "Users and access", icon: "users" },
    { to: "/admin/organizations", label: "Organizations", icon: "building" },
    { to: "/admin/links", label: "Identity links", icon: "link" },
  ] },
  { label: "Configuration", items: [
    { to: "/admin/apps", label: "Applications and SSO", icon: "key" },
    { to: "/admin/plans", label: "Plans and modules", icon: "layers" },
  ] },
  { label: "Operations", items: [
    { to: "/admin/integrations", label: "Sync log", icon: "activity" },
    { to: "/admin/installations", label: "Workforce installations", icon: "server" },
    { to: "/admin/audit", label: "Audit trail", icon: "list" },
  ] },
];

export function AdminLayout() {
  return (
    <Shell
      sections={sections}
      home="/admin"
      tag="Admin"
      sideFoot={<NavLink to="/app" className="btn btn-ghost btn-sm btn-block"><Icon name="arrowRight" size={15} />Back to my account</NavLink>}
    >
      <Outlet />
    </Shell>
  );
}
