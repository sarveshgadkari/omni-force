// Local database test harness: runs the hub migrations in PGlite (Postgres in
// WASM) on top of a minimal stub of what Supabase provides (roles, auth schema,
// auth.uid()/auth.role()/auth.jwt()). No Docker or Supabase CLI needed.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Extensions that only exist on the hosted platform. pgcrypto is not needed:
// the schema only uses core gen_random_uuid() and sha256().
const PLATFORM_ONLY = /create extension if not exists (pgcrypto|pg_cron|pg_net)[^;]*;/gi;

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    last_sign_in_at timestamptz,
    raw_user_meta_data jsonb not null default '{}',
    banned_until timestamptz,
    created_at timestamptz not null default now()
  );
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(auth.jwt() ->> 'role', current_user) $$;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

export function migrationFiles() {
  const dir = join(root, "migrations");
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, f));
}

/** Fresh database with every migration (and optionally the seed) applied. */
export async function freshDb({ seed = true } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8").replace(PLATFORM_ONLY, "");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`${file}: ${e.message}`);
    }
  }
  if (seed) await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  return wrap(db);
}

function wrap(db) {
  const api = {
    db,
    /** Run as service role / migration owner (bypasses RLS). */
    async q(sql, params = []) {
      return (await db.query(sql, params)).rows;
    },
    async one(sql, params = []) {
      const rows = await api.q(sql, params);
      return rows[0];
    },
    /** Run as a signed-in user (role authenticated, RLS enforced). */
    async as(userId, sql, params = []) {
      return await api.asRole("authenticated", userId, sql, params);
    },
    async asAnon(sql, params = []) {
      return await api.asRole("anon", null, sql, params);
    },
    async asRole(role, userId, sql, params = []) {
      const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
      return await db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
        await tx.query(`set local role ${role}`);
        return (await tx.query(sql, params)).rows;
      });
    },
    /** Create a confirmed (or unconfirmed) auth user; triggers create the profile. */
    async user(email, { confirmed = true, first = "Test", last = "User", company = null } = {}) {
      const r = await api.one(
        `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
         values ($1, case when $2 then now() end, jsonb_build_object('first_name', $3::text, 'last_name', $4::text, 'company_name', $5::text))
         returning id`,
        [email, confirmed, first, last, company],
      );
      return r.id;
    },
    async rejects(promise, pattern) {
      try {
        await promise;
      } catch (e) {
        if (pattern && !pattern.test(e.message)) throw new Error(`expected error matching ${pattern}, got: ${e.message}`);
        return e.message;
      }
      throw new Error(`expected an error${pattern ? ` matching ${pattern}` : ""}`);
    },
  };
  return api;
}

/** Fresh DB with a test helper object, closed automatically after the file's tests. */
export async function setup(after, opts) {
  const t = await freshDb(opts);
  after(() => t.db.close());
  return t;
}

export async function makeAdmin(t, email = "admin@omniforce.test") {
  const id = await t.user(email, { first: "Plat", last: "Admin" });
  await t.q("insert into platform_admins (user_id) values ($1)", [id]);
  return id;
}

export const plan = async (t, code) => (await t.one("select id from plans where code = $1", [code])).id;
