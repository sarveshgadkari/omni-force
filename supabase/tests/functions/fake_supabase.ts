// Minimal stand-in for the service-role supabase-js client used by the edge
// functions, backed by the real migrations running in PGlite. Covers only the
// calls the tested handlers make: rpc(), from().select/eq/single/maybeSingle/update,
// and auth.getUser(token).
// deno-lint-ignore-file no-explicit-any

type Db = { q: (sql: string, params?: unknown[]) => Promise<any[]> };

// functions returning a set of rows (PostgREST returns an array for these)
const SETOF = new Set(["module_access_for", "my_module_access", "org_members", "my_organizations", "org_modules", "paid_grants", "org_module_access"]);

export function fakeClient(db: Db, tokens: Map<string, string>) {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const names = Object.keys(args);
    const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`;
    try {
      const rows = await db.q(SETOF.has(fn) ? `select * from ${call}` : `select ${call} as r`, names.map((n) => args[n]));
      return { data: SETOF.has(fn) ? rows : rows[0]?.r ?? null, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  };

  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let cols = "*";
    let patch: Record<string, unknown> | null = null;
    const where = () => filters.length ? ` where ${filters.map(([c], i) => `${c} = $${i + 1}`).join(" and ")}` : "";
    const run = async () => {
      if (patch) {
        const keys = Object.keys(patch);
        await db.q(`update public.${table} set ${keys.map((k, i) => `${k} = $${filters.length + i + 1}`).join(", ")}${where()}`,
          [...filters.map(([, v]) => v), ...keys.map((k) => patch![k])]);
        return [];
      }
      return await db.q(`select ${cols} from public.${table}${where()}`, filters.map(([, v]) => v));
    };
    const b: any = {
      select(c = "*") { cols = c; return b; },
      update(p: Record<string, unknown>) { patch = p; return b; },
      eq(c: string, v: unknown) { filters.push([c, v]); return b; },
      async single() { const r = await run(); return r.length === 1 ? { data: r[0], error: null } : { data: null, error: { message: "not single" } }; },
      async maybeSingle() { const r = await run(); return { data: r[0] ?? null, error: null }; },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) { return run().then((data) => ({ data, error: null })).then(res, rej); },
    };
    return b;
  };

  return {
    rpc,
    from,
    getUser: async (token: string) => {
      const id = tokens.get(token);
      return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: "invalid" } };
    },
  };
}
