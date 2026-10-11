-- ════════════════════════════════════════════════════════════════════════
-- WSSO ⇄ OmniForce integration — run in the WSSO Supabase project
-- ════════════════════════════════════════════════════════════════════════
-- ASSUMED WSSO TABLES (adjust names before running):
--   public.companies (id uuid, name text, ...)                  ← one row per workspace
--   public.users     (id uuid = auth.users.id, company_id uuid,
--                     role_id uuid, full_name text, email text,
--                     is_active boolean, is_company_admin boolean)
--   public.roles     (id uuid, company_id uuid, name text)       ← admin / director / manager / employee
-- If your tables are named differently (e.g. profiles, workspaces), rename below.
-- Nothing here deletes or rewrites existing data. Existing local logins keep working.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Identity mapping on WSSO users ────────────────────────────────────────
alter table public.users
  add column if not exists omniforce_user_id   text unique,          -- e.g. OF-0009821 (permanent key, never email)
  add column if not exists auth_source         text not null default 'local'
                                               check (auth_source in ('local', 'omniforce')),
  add column if not exists omniforce_linked_at timestamptz;

-- 2) Billing comes from OmniForce for linked workspaces ─────────────────────
alter table public.companies
  add column if not exists omniforce_owner_id     text,               -- OmniForce ID of the paying owner
  add column if not exists billing_source         text not null default 'wsso'
                                                  check (billing_source in ('wsso', 'omniforce')),
  add column if not exists omniforce_plan_code    text,               -- starter | growth | business | enterprise
  add column if not exists omniforce_seat_limit   int,
  add column if not exists omniforce_status       text                -- active | trialing | past_due | canceled
                                                  check (omniforce_status in ('active', 'trialing', 'past_due', 'canceled')),
  add column if not exists omniforce_valid_until  timestamptz;

create index if not exists companies_omniforce_owner_idx on public.companies (omniforce_owner_id);

-- 3) SSO replay protection: each ticket (jti) can be used once ──────────────
create table if not exists public.omniforce_sso_nonces (
  jti        uuid primary key,
  of_id      text not null,
  used_at    timestamptz not null default now(),
  expires_at timestamptz not null
);

-- 4) Idempotency for provisioning calls from OmniForce ─────────────────────
create table if not exists public.omniforce_inbox (
  idempotency_key text primary key,
  action          text not null,
  response        jsonb,
  created_at      timestamptz not null default now()
);

-- 5) Outbox: WSSO → OmniForce events (sent by the omniforce-events function) ─
create table if not exists public.omniforce_outbox (
  id              bigint generated always as identity primary key,
  event           text not null,          -- member.created | member.updated | member.role_changed | member.deleted | seats.changed | company.deleted
  omniforce_user_id text,
  payload         jsonb not null default '{}',
  status          text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'dead')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now()
);
create index if not exists omniforce_outbox_queue_idx on public.omniforce_outbox (status, next_attempt_at) where status in ('queued', 'failed');

-- New tables are server-only: RLS on, no policies → only the service role can touch them
alter table public.omniforce_sso_nonces enable row level security;
alter table public.omniforce_inbox      enable row level security;
alter table public.omniforce_outbox     enable row level security;

-- 6) Users can't edit the OmniForce columns themselves ─────────────────────
create or replace function public.protect_omniforce_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then  -- end users only; service role and SQL editor may change
    if new.omniforce_user_id is distinct from old.omniforce_user_id
       or new.auth_source is distinct from old.auth_source then
      raise exception 'OmniForce identity fields are managed by OmniForce';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists users_protect_omniforce on public.users;
create trigger users_protect_omniforce before update on public.users
  for each row execute function public.protect_omniforce_columns();

create or replace function public.protect_company_billing()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then  -- end users only; service role and SQL editor may change
    if (new.billing_source, new.omniforce_owner_id, new.omniforce_plan_code, new.omniforce_seat_limit, new.omniforce_status, new.omniforce_valid_until)
       is distinct from
       (old.billing_source, old.omniforce_owner_id, old.omniforce_plan_code, old.omniforce_seat_limit, old.omniforce_status, old.omniforce_valid_until) then
      raise exception 'Billing for this workspace is managed in OmniForce';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists companies_protect_billing on public.companies;
create trigger companies_protect_billing before update on public.companies
  for each row execute function public.protect_company_billing();

-- 7) One access check for the whole app (use it in RLS / route guards) ──────
-- OmniForce-billed workspaces: active, trialing, or past_due (grace) = allowed.
-- WSSO-billed workspaces: fall through to your existing Stripe check.
create or replace function public.company_has_access(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case c.billing_source
    when 'omniforce' then coalesce(c.omniforce_status in ('active', 'trialing', 'past_due'), false)
                          and (c.omniforce_valid_until is null or c.omniforce_valid_until > now() - interval '3 days')
    else true  -- TODO: replace with your existing WSSO subscription check
  end
  from public.companies c where c.id = p_company
$$;

-- Seat limit for OmniForce-billed workspaces
create or replace function public.enforce_omniforce_seats()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit int; v_used int;
begin
  select omniforce_seat_limit into v_limit from public.companies
   where id = new.company_id and billing_source = 'omniforce';
  if v_limit is null then return new; end if;
  select count(*) into v_used from public.users where company_id = new.company_id and is_active and id <> new.id;
  if new.is_active and v_used >= v_limit then
    raise exception 'Seat limit reached (% of %). Add seats from your OmniForce plan.', v_used, v_limit;
  end if;
  return new;
end $$;

drop trigger if exists users_enforce_seats on public.users;
create trigger users_enforce_seats before insert or update of is_active, company_id on public.users
  for each row execute function public.enforce_omniforce_seats();

-- 8) Queue events for OmniForce ───────────────────────────────────────────
create or replace function public.omniforce_enqueue_user_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner text; v_event text; v_row public.users;
begin
  v_row := coalesce(new, old);
  select omniforce_owner_id into v_owner from public.companies where id = v_row.company_id;
  if v_owner is null and v_row.omniforce_user_id is null then return null; end if;  -- workspace not linked

  v_event := case
    when tg_op = 'INSERT' then 'member.created'
    when tg_op = 'DELETE' then 'member.deleted'
    when new.role_id is distinct from old.role_id or new.is_company_admin is distinct from old.is_company_admin then 'member.role_changed'
    else 'member.updated'
  end;

  insert into public.omniforce_outbox (event, omniforce_user_id, payload)
  values (v_event, v_row.omniforce_user_id, jsonb_build_object(
    'wsso_user_id', v_row.id, 'company_id', v_row.company_id, 'owner_omniforce_id', v_owner,
    'email', v_row.email, 'role_id', v_row.role_id, 'is_active', v_row.is_active));

  -- seat usage for the owner's account
  insert into public.omniforce_outbox (event, omniforce_user_id, payload)
  select 'seats.changed', v_owner, jsonb_build_object(
    'company_id', v_row.company_id,
    'used', (select count(*) from public.users where company_id = v_row.company_id and is_active),
    'limit', (select omniforce_seat_limit from public.companies where id = v_row.company_id))
  where v_owner is not null and (tg_op <> 'UPDATE' or new.is_active is distinct from old.is_active);
  return null;
end $$;

drop trigger if exists users_omniforce_events on public.users;
create trigger users_omniforce_events after insert or update or delete on public.users
  for each row execute function public.omniforce_enqueue_user_event();

-- 9) Housekeeping: drop expired nonces daily; send outbox every minute ─────
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('omniforce-nonce-cleanup', '17 3 * * *',
  $$ delete from public.omniforce_sso_nonces where expires_at < now() - interval '1 day' $$);

-- Store the secret first:  select vault.create_secret('<CRON_SECRET>', 'omniforce_cron_secret');
select cron.schedule('omniforce-outbox', '* * * * *', $$
  select net.http_post(
    url     := 'https://<wsso-ref>.supabase.co/functions/v1/omniforce-events',
    headers := jsonb_build_object('Content-Type', 'application/json',
               'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'omniforce_cron_secret')),
    body    := '{}'::jsonb)
$$);
