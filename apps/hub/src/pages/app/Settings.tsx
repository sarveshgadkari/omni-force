import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { account, auth } from "../../lib/api";
import { moduleLabel } from "../../lib/format";
import type { ModuleKey } from "../../lib/types";
import { Alert, Button, Field, Icon, PageHeader } from "../../components/ui";

export function Settings() {
  const { profile, refresh } = useAuth();
  const [f, setF] = useState({
    first_name: profile?.first_name ?? "", last_name: profile?.last_name ?? "",
    company_name: profile?.company_name ?? "", phone: profile?.phone ?? "",
    default_module: profile?.default_module ?? "directory",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [resetState, setResetState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  if (!profile) return null;
  const dirty = f.first_name !== profile.first_name || f.last_name !== profile.last_name || f.company_name !== (profile.company_name ?? "")
    || f.phone !== (profile.phone ?? "") || f.default_module !== profile.default_module;

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Account" title="Profile and preferences" description="How you appear across OmniForce and where you land after signing in." />
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setMsg(null);
          try { await account.updateProfile(f); await refresh(); setMsg({ tone: "ok", text: "Saved." }); }
          catch (x) { setMsg({ tone: "bad", text: x instanceof Error ? x.message : "Couldn't save your profile." }); }
          finally { setBusy(false); }
        }}
      >
        <div className="panel-head"><h3><Icon name="user" size={17} />Profile</h3></div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="grid-2">
          <Field label="First name" required><input id="st-first" required value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} autoComplete="given-name" /></Field>
          <Field label="Last name" required><input id="st-last" required value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} autoComplete="family-name" /></Field>
        </div>
        <Field label="Email" hint="Your sign-in email. Contact support to change it."><input id="st-email" value={profile.email} disabled /></Field>
        <div className="grid-2">
          <Field label="Company"><input id="st-company" value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} autoComplete="organization" /></Field>
          <Field label="Phone"><input id="st-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
        </div>
        <Field label="Open after sign-in" hint="Used when you haven't opened a product recently.">
          <select id="st-default" value={f.default_module} onChange={(e) => setF({ ...f, default_module: e.target.value as ModuleKey })}>
            {(Object.keys(moduleLabel) as ModuleKey[]).map((m) => <option key={m} value={m}>{moduleLabel[m]}</option>)}
          </select>
        </Field>
        <div className="row-between wrap-gap">
          <span className="dim small">OmniForce ID <span className="mono fg">{profile.omniforce_id}</span></span>
          <Button type="submit" loading={busy} disabled={!dirty}>Save changes</Button>
        </div>
      </form>

      <section className="panel stack">
        <div className="panel-head"><h3><Icon name="lock" size={17} />Security</h3></div>
        <div className="row-between wrap-gap">
          <div className="stack-xs"><strong>Password</strong><span className="dim small">We'll email a secure link to {profile.email} to choose a new password.</span></div>
          <Button variant="ghost" loading={resetState === "busy"} disabled={resetState === "sent"} onClick={async () => {
            setResetState("busy");
            try { await auth.sendReset(profile.email); setResetState("sent"); } catch { setResetState("error"); }
          }}>{resetState === "sent" ? "Link sent" : "Send reset link"}</Button>
        </div>
        {resetState === "sent" && <Alert tone="ok">Check your inbox for the reset link. It expires in one hour.</Alert>}
        {resetState === "error" && <Alert>Couldn't send the link. Wait a minute and try again.</Alert>}
      </section>
    </div>
  );
}
