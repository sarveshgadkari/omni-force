// Drop into the WSSO header so users can jump to the other modules without signing in again.
// Each link goes through the OmniForce hub, which checks the plan and issues a fresh SSO ticket.
const HUB_URL = import.meta.env.VITE_OMNIFORCE_HUB_URL ?? "https://account.omniforce.app";

const modules = [
  { key: "directory", label: "Drone Directory", color: "#16a34a" },
  { key: "wsso", label: "WSSO", color: "#2563eb", current: true },
  { key: "workforce", label: "Workforce 2.0", color: "#ea6a1f" },
] as const;

export function OmniForceSwitcher() {
  return (
    <nav aria-label="Switch module" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 10, border: "1px solid var(--border, #d9e4e2)" }}>
      {modules.map((m) => (
        <a
          key={m.key}
          href={"current" in m ? "/" : `${HUB_URL}/launch/${m.key}`}
          aria-current={"current" in m ? "page" : undefined}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontWeight: 600, fontSize: 14,
                   textDecoration: "none", color: "inherit", background: "current" in m ? "var(--muted, #eef4f3)" : "transparent" }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color }} />
          {m.label}
        </a>
      ))}
      <a href={`${HUB_URL}/app`} style={{ padding: "6px 12px", fontSize: 14, color: "inherit" }}>My OmniForce account</a>
    </nav>
  );
}
