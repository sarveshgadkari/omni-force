// Public keys for OmniForce-signed tokens (same set as /oidc/jwks). Deploy with --no-verify-jwt.
import { json } from "../_shared/cors.ts";
import { HttpError } from "../_shared/errors.ts";
import { publicJwks } from "../_shared/keys.ts";

Deno.serve(() => {
  try {
    return json(publicJwks(), 200, { "Cache-Control": "public, max-age=300" });
  } catch (e) {
    return json({ error: e instanceof HttpError ? e.message : "unavailable" }, 503);
  }
});
