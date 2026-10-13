import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthProvider";
import { Spinner } from "./components/ui";
import { AuthLayout } from "./layouts/AuthLayout";
import { AppLayout } from "./layouts/AppLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { Signup } from "./pages/auth/Signup";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { Login } from "./pages/auth/Login";
import { Forgot } from "./pages/auth/Forgot";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { ChoosePlan } from "./pages/app/ChoosePlan";
import { CheckoutSuccess } from "./pages/app/CheckoutSuccess";
import { SmartRedirect } from "./pages/app/SmartRedirect";
import { Launch } from "./pages/app/Launch";
import { Overview } from "./pages/app/Overview";
import { ModuleHome } from "./pages/app/ModuleHome";
import { Billing } from "./pages/app/Billing";
import { Settings } from "./pages/app/Settings";
import { Organizations } from "./pages/app/Organizations";
import { OrganizationDetail } from "./pages/app/OrganizationDetail";
import { AcceptInvite } from "./pages/app/AcceptInvite";
import { OAuthAuthorize } from "./pages/auth/OAuthAuthorize";
import { AdminOverview } from "./pages/admin/AdminOverview";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminPlans } from "./pages/admin/AdminPlans";
import { AdminIntegrations } from "./pages/admin/AdminIntegrations";
import { AdminInstallations } from "./pages/admin/AdminInstallations";
import { AdminAudit } from "./pages/admin/AdminAudit";
import { AdminOrganizations } from "./pages/admin/AdminOrganizations";
import { AdminApps } from "./pages/admin/AdminApps";
import { AdminLinks } from "./pages/admin/AdminLinks";
import { NotFound } from "./pages/NotFound";

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, profile } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Checking your session" />;
  // keep the query string: /oauth/authorize?… and invite links must survive the sign-in round trip
  if (!profile) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (profile.status === "disabled") return <Navigate to="/login?disabled=1" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/app" replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      <Route path="/plans" element={<RequireAuth><ChoosePlan /></RequireAuth>} />
      <Route path="/checkout/success" element={<RequireAuth><CheckoutSuccess /></RequireAuth>} />
      <Route path="/go" element={<RequireAuth><SmartRedirect /></RequireAuth>} />
      <Route path="/launch/:module" element={<RequireAuth><Launch /></RequireAuth>} />
      <Route path="/oauth/authorize" element={<RequireAuth><OAuthAuthorize /></RequireAuth>} />
      <Route path="/invite/:token" element={<RequireAuth><AcceptInvite /></RequireAuth>} />

      <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Overview />} />
        <Route path="m/:module" element={<ModuleHome />} />
        <Route path="orgs" element={<Organizations />} />
        <Route path="orgs/:id" element={<OrganizationDetail />} />
        <Route path="billing" element={<Billing />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="organizations" element={<AdminOrganizations />} />
        <Route path="apps" element={<AdminApps />} />
        <Route path="links" element={<AdminLinks />} />
        <Route path="integrations" element={<AdminIntegrations />} />
        <Route path="installations" element={<AdminInstallations />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
