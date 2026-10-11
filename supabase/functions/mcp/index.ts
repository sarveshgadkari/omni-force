// Minimal MCP server (JSON-RPC 2.0 over HTTP POST) for on-prem Workforce 2.0
// installations and other trusted systems. Auth: Bearer <mcp_token> from workforce-agent.
// Deploy with --no-verify-jwt.
import { admin, sha256 } from "../_shared/db.ts";

const tools = [
  { name: "get_license", description: "Licence status and owner of this installation.", inputSchema: { type: "object", properties: {} } },
  { name: "get_owner_account", description: "OmniForce account and module entitlements of the installation owner.", inputSchema: { type: "object", properties: {} } },
  { name: "pull_changes", description: "Profile and entitlement changes for the owner since a cursor (ISO time).", inputSchema: { type: "object", properties: { since: { type: "string" } } } },
  {
    name: "push_events", description: "Report Workforce events (employee.created, shift.published, payroll.closed…) to OmniForce.",
    inputSchema: { type: "object", properties: { events: { type: "array", items: { type: "object", properties: { type: { type: "string" }, id: { type: "string" }, data: { type: "object" } }, required: ["type", "id"] } } }, required: ["events"] },
  },
];

const ok = (id: unknown, result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
const err = (id: unknown, code: number, message: string) => Response.json({ jsonrpc: "2.0", id, error: { code, message } });
const text = (v: unknown) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("MCP endpoint: POST JSON-RPC", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: inst } = await admin.from("workforce_installations").select("*").eq("mcp_token_hash", await sha256(token)).maybeSingle();
  if (!inst || inst.status !== "active") return new Response("unauthorized", { status: 401 });
  await admin.from("workforce_installations").update({ last_seen_at: new Date().toISOString() }).eq("id", inst.id);

  const msg = await req.json();
  const { id, method, params } = msg;
  if (id === undefined) return new Response(null, { status: 202 }); // notification

  switch (method) {
    case "initialize":
      return ok(id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "omniforce-hub", version: "0.1.0" } });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools });
    case "tools/call": {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (name === "get_license") {
        return ok(id, text({ installation_id: inst.id, name: inst.name, status: inst.status, owner_user_id: inst.user_id, offline_grace_hours: 72 }));
      }
      if (name === "get_owner_account") {
        const { data: p } = await admin.from("profiles").select("omniforce_id, email, first_name, last_name, company_name, status").eq("id", inst.user_id).single();
        const { data: e } = await admin.from("entitlements").select("module_key, status, valid_until, plan:plans(code, name, seats)").eq("user_id", inst.user_id);
        return ok(id, text({ profile: p, entitlements: e }));
      }
      if (name === "pull_changes") {
        const since = typeof args.since === "string" ? args.since : new Date(0).toISOString();
        const { data: p } = await admin.from("profiles").select("omniforce_id, email, first_name, last_name, status, updated_at").eq("id", inst.user_id).gt("updated_at", since).maybeSingle();
        const { data: e } = await admin.from("entitlements").select("module_key, status, valid_until, updated_at").eq("user_id", inst.user_id).gt("updated_at", since);
        return ok(id, text({ cursor: new Date().toISOString(), profile: p, entitlements: e ?? [] }));
      }
      if (name === "push_events") {
        const evs = Array.isArray(args.events) ? args.events.slice(0, 200) : [];
        const rows = evs.map((ev: { type: string; id: string; data?: unknown }) => ({
          direction: "inbound", module_key: "workforce", event_type: `mcp:${String(ev.type).slice(0, 60)}`, user_id: inst.user_id,
          payload: { installation_id: inst.id, ...(ev.data as object ?? {}) }, status: "processed", attempts: 1,
          processed_at: new Date().toISOString(), idempotency_key: `wf:${inst.id}:${String(ev.id).slice(0, 80)}`,
        }));
        const { error } = await admin.from("integration_events").upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true });
        if (error) return err(id, -32000, error.message);
        return ok(id, text({ accepted: rows.length }));
      }
      return err(id, -32601, `Unknown tool ${name}`);
    }
    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
});
