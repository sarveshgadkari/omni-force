import { useState } from "react";
import { admin } from "../../lib/api";
import { date, moduleLabel } from "../../lib/format";
import type { Module, ModuleKey, OAuthClient } from "../../lib/types";
import {
  Alert, Button, ConfirmDialog, CopyButton, Empty, Field, Icon, LoadError, Modal, ModuleIcon, PageHeader, Pill, SkeletonRows, SsoPill, useLoad,
} from "../../components/ui";

const clientTone = { disabled: "neutral", testing: "info", enabled: "ok" } as const;
const ssoLabel = { not_configured: "not configured", testing: "testing (platform admins only)", enabled: "enabled for everyone" } as const;

type Pending = { title: string; body: string; label: string; tone?: "danger" | "primary"; run: () => Promise<unknown>; ok?: string };

/**
 * Applications that sign in with OmniForce (OAuth/OIDC clients) and the per-module
 * switches for SSO and provisioning. Everything starts off. Switch a module on
 * only after its team has built and tested their side (docs/INTEGRATION_AUTH.md).
 */
export function AdminApps() {
  const mods = useLoad(() => admin.modules());
  const clients = useLoad(() => admin.clients());
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OAuthClient | null>(null);
  const [secret, setSecret] = useState<{ client_id: string; client_secret: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const reload = () => { mods.reload(); clients.reload(); };

  function changeSso(m: Module, next: Module["sso_status"]) {
    const enabling = next === "enabled";
    setPending({
      title: `Set ${m.name} sign-in to ${ssoLabel[next]}?`,
      body: enabling
        ? `Everyone with ${m.name} access will be sent through "Sign in with OmniForce". Only do this after the ${m.name} team has built and tested their side.`
        : next === "testing" ? "Only platform admins will be able to sign in through OmniForce. Use this to test against a staging client."
        : "OmniForce sign-in stops. Users go back to the product's own login.",
      label: enabling ? "Enable for everyone" : "Change sign-in",
      tone: enabling ? "danger" : "primary",
      run: () => admin.setModuleIntegration(m.key, next, null),
      ok: `${m.name} sign-in: ${ssoLabel[next]}.`,
    });
  }
  function changeProvisioning(m: Module, next: Module["provisioning_status"]) {
    setPending({
      title: next === "enabled" ? `Enable provisioning to ${m.name}?` : `Disable provisioning to ${m.name}?`,
      body: next === "enabled"
        ? `OmniForce will start creating and updating accounts in ${m.name} through its API. The ${m.name} API contract must be verified first.`
        : "OmniForce stops sending account changes. Queued events are dead-lettered.",
      label: next === "enabled" ? "Enable provisioning" : "Disable provisioning",
      tone: next === "enabled" ? "danger" : "primary",
      run: () => admin.setModuleIntegration(m.key, null, next),
      ok: `${m.name} provisioning ${next}.`,
    });
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Configuration"
        title="Applications and SSO"
        description="Which products can sign people in with OmniForce, and which receive account provisioning. Everything starts switched off."
        actions={<Button onClick={() => setCreating(true)}><Icon name="plus" size={15} />Register application</Button>}
      />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {mods.error && <LoadError message={mods.error} onRetry={mods.reload} />}

      <section className="panel flush">
        <div className="panel-head"><h3><Icon name="layers" size={17} />Products</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Product</th><th>OmniForce sign-in</th><th>Provisioning</th><th>Notes</th></tr></thead>
            <tbody>
              {mods.loading && <SkeletonRows cols={4} rows={2} />}
              {(mods.data ?? []).filter((m) => m.deployment === "cloud").map((m) => (
                <tr key={m.key} className={`m-${m.key}`}>
                  <td><span className="cell-person"><span className="list-ico"><ModuleIcon m={m.key} size={16} /></span><span className="grow"><strong>{m.name}</strong>{m.app_url && <span className="dim small">{new URL(m.app_url).host}</span>}</span></span></td>
                  <td>
                    <div className="stack-xs">
                      <SsoPill status={m.sso_status} />
                      <select id={`sso-${m.key}`} className="cell-input" aria-label={`${m.name} sign-in`} value={m.sso_status}
                        onChange={(e) => changeSso(m, e.target.value as Module["sso_status"])}>
                        <option value="not_configured">Not configured</option>
                        <option value="testing">Testing (platform admins only)</option>
                        <option value="enabled">Enabled for everyone</option>
                      </select>
                    </div>
                  </td>
                  <td>
                    <select id={`prov-${m.key}`} className="cell-input" aria-label={`${m.name} provisioning`} value={m.provisioning_status}
                      onChange={(e) => changeProvisioning(m, e.target.value as Module["provisioning_status"])}>
                      <option value="disabled">Disabled</option>
                      <option value="enabled">Enabled</option>
                    </select>
                  </td>
                  <td className="dim small">{m.integration_notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel flush">
        <div className="panel-head"><h3><Icon name="key" size={17} />Registered applications</h3><span className="panel-sub">OAuth / OIDC clients</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Application</th><th>Product</th><th>Client ID</th><th>Redirect URIs</th><th>Status</th><th className="actions"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {clients.loading && <SkeletonRows cols={6} rows={1} />}
              {(clients.data ?? []).map((c) => (
                <tr key={c.client_id}>
                  <td><strong>{c.name}</strong><div className="dim small">{c.environment} · since {date(c.created_at)}</div></td>
                  <td>{moduleLabel[c.module_key]}</td>
                  <td className="mono small">{c.client_id}<div className="dim">secret …{c.secret_hint}</div></td>
                  <td className="mono small">{c.redirect_uris.map((u) => <div key={u}>{u}</div>)}</td>
                  <td><Pill tone={clientTone[c.status]} dot>{c.status.charAt(0).toUpperCase() + c.status.slice(1)}</Pill></td>
                  <td className="actions">
                    <span className="row gap">
                      <Button variant="ghost" className="btn-sm" onClick={() => setEditing(c)}>Edit</Button>
                      <Button variant="text" className="btn-sm" onClick={() => setPending({
                        title: `Rotate the secret for ${c.name}?`,
                        body: "A new secret is shown once. The current secret keeps working for 24 hours so the application can switch over.",
                        label: "Rotate secret", tone: "primary",
                        run: async () => setSecret({ client_id: c.client_id, ...(await admin.rotateClientSecret(c.client_id)) }),
                      })}>Rotate secret</Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {clients.data?.length === 0 && <Empty icon="key" title="No applications registered">Register one when a product team is ready to build “Sign in with OmniForce”.</Empty>}
      </section>

      {creating && <ClientForm onClose={() => setCreating(false)} onSaved={(s) => { setCreating(false); setSecret(s); clients.reload(); }} />}
      {editing && <ClientForm client={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); clients.reload(); }} />}
      {pending && (
        <ConfirmDialog title={pending.title} body={pending.body} confirmLabel={pending.label} tone={pending.tone}
          onClose={() => { setPending(null); reload(); }}
          onConfirm={async () => { await pending.run(); if (pending.ok) setMsg({ tone: "ok", text: pending.ok }); }} />
      )}
      {secret && (
        <Modal title="Client secret" description="Shown once. Stored only as a hash." onClose={() => setSecret(null)}>
          <div className="stack">
            <Alert tone="ok">Give this to the product's back end over a secure channel. After a rotation the previous secret keeps working for 24 hours.</Alert>
            <dl className="kv-list"><div><dt>Client ID</dt><dd className="mono">{secret.client_id}</dd></div></dl>
            <div className="keybox">{secret.client_secret}</div>
            <div className="modal-actions"><CopyButton text={secret.client_secret} label="Copy secret" /><Button onClick={() => setSecret(null)}>Done</Button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ClientForm({ client, onClose, onSaved }: { client?: OAuthClient; onClose: () => void; onSaved: (s: { client_id: string; client_secret: string }) => void }) {
  const [module, setModule] = useState<ModuleKey>(client?.module_key ?? "wsso");
  const [name, setName] = useState(client?.name ?? "");
  const [env, setEnv] = useState<OAuthClient["environment"]>(client?.environment ?? "staging");
  const [redirects, setRedirects] = useState((client?.redirect_uris ?? []).join("\n"));
  const [initiate, setInitiate] = useState(client?.initiate_login_uri ?? "");
  const [status, setStatus] = useState<OAuthClient["status"]>(client?.status ?? "disabled");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uris = redirects.split(/\s+/).map((s) => s.trim()).filter(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (client) {
        await admin.updateClient({ client_id: client.client_id, name, redirect_uris: uris, initiate_login_uri: initiate.trim() || null, status });
        onSaved({ client_id: client.client_id, client_secret: "" });
      } else {
        onSaved(await admin.createClient({ module, name, environment: env, redirect_uris: uris, initiate_login_uri: initiate.trim() || null }));
      }
    } catch (x) {
      setErr(x instanceof Error ? (/check constraint|violates/.test(x.message) ? "Redirect URIs must be https:// (or http://localhost) with no #fragment." : x.message) : "Failed.");
    } finally { setBusy(false); }
  }

  return (
    <Modal title={client ? `Edit ${client.name}` : "Register an application"} description={client ? client.client_id : "The client starts disabled. You'll see its secret once."} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {err && <Alert>{err}</Alert>}
        {!client && (
          <div className="grid-2">
            <Field label="Module"><select id="cl-module" value={module} onChange={(e) => setModule(e.target.value as ModuleKey)}><option value="wsso">WSSO</option><option value="directory">Drone Directory</option></select></Field>
            <Field label="Environment"><select id="cl-env" value={env} onChange={(e) => setEnv(e.target.value as OAuthClient["environment"])}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></Field>
          </div>
        )}
        <Field label="Name"><input id="cl-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="WSSO staging" /></Field>
        <Field label="Redirect URIs" hint="One per line. Exact match; https only (http allowed for localhost)."><textarea id="cl-redirects" rows={3} className="mono" value={redirects} onChange={(e) => setRedirects(e.target.value)} placeholder="https://wsso.example.com/auth/omniforce/callback" /></Field>
        <Field label="Initiate-login URI" hint="Where “Open module” in OmniForce sends people. The application then starts the sign-in itself."><input id="cl-initiate" className="mono" value={initiate} onChange={(e) => setInitiate(e.target.value)} placeholder="https://wsso.example.com/auth/omniforce/start" /></Field>
        {client && (
          <Field label="Status" hint="Testing lets only platform admins sign in through this client.">
            <select id="cl-status" value={status} onChange={(e) => setStatus(e.target.value as OAuthClient["status"])}><option value="disabled">Disabled</option><option value="testing">Testing</option><option value="enabled">Enabled</option></select>
          </Field>
        )}
        <div className="modal-actions"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>{client ? "Save" : "Register and show secret"}</Button></div>
      </form>
    </Modal>
  );
}
