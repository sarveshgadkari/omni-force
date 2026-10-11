// Return/redirect URL checks (pure, unit-tested).
export const hubOrigins = (env = Deno.env.get("HUB_ORIGIN") ?? "") =>
  env.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);

/** True only for URLs on one of the configured hub origins (exact origin match). Fails closed. */
export function isHubUrl(u: unknown, origins = hubOrigins()): u is string {
  if (typeof u !== "string" || origins.length === 0) return false;
  try {
    return origins.includes(new URL(u).origin);
  } catch {
    return false;
  }
}
