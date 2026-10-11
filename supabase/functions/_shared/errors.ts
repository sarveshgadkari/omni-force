// No imports on purpose: safe to load in unit tests without any environment.
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/**
 * A shared secret that must be configured. Fails closed: a missing or short
 * value makes the endpoint refuse every request instead of accepting a guessable default.
 */
export function requireSecret(name: string, minLength = 32): string {
  const v = Deno.env.get(name) ?? "";
  if (v.length < minLength) {
    console.error(`${name} is missing or shorter than ${minLength} characters`);
    throw new HttpError(503, "This endpoint is not configured.", "not_configured");
  }
  return v;
}

/** Constant-time string compare for shared secrets. */
export function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let r = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) r |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return r === 0;
}

export const sha256Hex = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
