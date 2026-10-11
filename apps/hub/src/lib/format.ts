import type { ModuleKey, Plan } from "./types";

export const moduleLabel: Record<ModuleKey, string> = {
  directory: "Drone Directory",
  wsso: "WSSO",
  workforce: "Workforce 2.0",
};

export const money = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export const planPrice = (p: Plan) => {
  if (p.interval === "free") return "Free";
  if (p.interval === "license") return "Licence";
  return `${money(p.price_cents, p.currency)}/${p.interval === "year" ? "yr" : "mo"}`;
};

export const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export const rel = (iso: string | null) => {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const planModules = (p: Plan): ModuleKey[] => (p.module_key ? [p.module_key] : p.bundle_modules);
