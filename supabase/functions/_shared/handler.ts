import { fail, json, preflight } from "./cors.ts";
import { HttpError } from "./errors.ts";

/** Wraps a handler with CORS preflight and consistent JSON errors. */
export const serve = (fn: (req: Request) => Promise<Response>) =>
  Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) {
        return e.code || e.extra ? json({ error: e.message, code: e.code, ...e.extra }, e.status) : fail(e.message, e.status);
      }
      console.error(e);
      return fail("Something went wrong on our side. Try again in a minute.", 500);
    }
  });
