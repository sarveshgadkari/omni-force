-- OmniForce hub — core schema
-- Central identity, plans, subscriptions (Stripe), entitlements, identity mapping
-- to DirectoryUp / WSSO / Workforce 2.0, integration event queue and admin.
-- Run in a NEW Supabase project (the OmniForce hub). Not in WSSO.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────── enums
create type public.module_key as enum ('directory', 'wsso', 'workforce');
create type public.account_status as enum ('active', 'disabled');
create type public.entitlement_status as enum ('active', 'trialing', 'past_due', 'canceled');
create type public.event_status as enum ('queued', 'sent', 'failed', 'dead', 'received', 'processed');

-- ─────────────────────────────────────────────── modules
create table public.modules (
  key            public.module_key primary key,
  name           text not null,
  deployment     text not null check (deployment in ('cloud', 'onprem')),
  launch_url     text,              -- where the SSO ticket is sent (e.g. https://wsso.../sso/omniforce)
  sso_audience   text not null,     -- JWT "aud" the module expects
  is_active      boolean not null default true,
  sort           int not null default 0
);

insert into public.modules (key, name, deployment, launch_url, sso_audience, sort) values
  ('directory', 'Drone Directory', 'cloud',  'https://drones-drones-drones.directoryup.com/omniforce/sso', 'directoryup', 1),
  ('wsso',      'WSSO',            'cloud',  'https://wsso.tlbisbig.world/sso/omniforce',                 'wsso',        2),
  ('workforce', 'Workforce 2.0',   'onprem', null,                                                        'workforce',   3);

-- ─────────────────────────────────────────────── profiles
create sequence public.omniforce_id_seq start 1000;

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  omniforce_id       text not null unique default ('OF-' || lpad(nextval('public.omniforce_id_seq')::text, 7, '0')),
  email              text not null,
  first_name         text not null default '',
  last_name          text not null default '',
  company_name       text,
  phone              text,
  status             public.account_status not null default 'active',
  last_module        public.module_key,
  default_module     public.module_key not null default 'directory',
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

-- ─────────────────────────────────────────────── plans
create table public.plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,                 -- e.g. dir_service_provider_month
  name             text not null,
  module_key       public.module_key,                    -- null = bundle
  bundle_modules   public.module_key[] not null default '{}',
  interval         text not null check (interval in ('month', 'year', 'free', 'license')),
  price_cents      int not null default 0,
  currency         text not null default 'usd',
  stripe_price_id  text unique,
  external_ref     text,                                 -- DirectoryUp subscription_id / WSSO plan code / seats tier
  seats            int,
  trial_days       int not null default 0,
  is_public        boolean not null default true,
  is_active        boolean not null default true,
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  check (module_key is not null or cardinality(bundle_modules) > 0)
);

-- Which modules a plan grants
create or replace function public.plan_modules(p public.plans)
returns public.module_key[] language sql immutable as $$
  select case when p.module_key is not null then array[p.module_key] else p.bundle_modules end
$$;

-- ─────────────────────────────────────────────── subscriptions (mirror of Stripe)
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  status                 text not null,          -- Stripe status: trialing, active, past_due, canceled, unpaid, incomplete
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

create table public.subscription_items (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  plan_id         uuid not null references public.plans (id),
  stripe_item_id  text unique,
  quantity        int not null default 1
);

create table public.invoices (
  id                 text primary key,           -- Stripe invoice id
  user_id            uuid not null references public.profiles (id) on delete cascade,
  number             text,
  amount_paid_cents  int not null default 0,
  currency           text not null default 'usd',
  status             text not null,
  hosted_invoice_url text,
  pdf_url            text,
  created_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────── entitlements (what each user may open)
create table public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  module_key  public.module_key not null,
  plan_id     uuid references public.plans (id),
  status      public.entitlement_status not null default 'active',
  source      text not null check (source in ('stripe', 'free', 'admin', 'license')),
  valid_until timestamptz,
  updated_at  timestamptz not null default now(),
  unique (user_id, module_key)
);

-- ─────────────────────────────────────────────── identity mapping (OmniForce ID ↔ module IDs)
create table public.identity_links (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  module_key          public.module_key not null,
  external_id         text,                 -- DirectoryUp member id (e.g. 183) / WSSO auth user id
  external_account_id text,                 -- WSSO company/workspace id, Directory listing id
  status              text not null default 'pending' check (status in ('pending', 'linked', 'error', 'disabled')),
  last_error          text,
  linked_at           timestamptz,
  last_synced_at      timestamptz,
  unique (user_id, module_key),
  unique (module_key, external_id)
);

-- ─────────────────────────────────────────────── SSO ticket issuance log
create table public.sso_tickets (
  jti         uuid primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  module_key  public.module_key not null,
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  ip          inet,
  user_agent  text
);
create index sso_tickets_user_idx on public.sso_tickets (user_id, issued_at desc);

-- ─────────────────────────────────────────────── integration queue + log (outbound & inbound)
create table public.integration_events (
  id              bigint generated always as identity primary key,
  direction       text not null check (direction in ('outbound', 'inbound')),
  module_key      public.module_key not null,
  event_type      text not null,             -- member.create, member.update, member.disable, plan.change, webhook:<bd event>
  user_id         uuid references public.profiles (id) on delete set null,
  payload         jsonb not null default '{}',
  status          public.event_status not null default 'queued',
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  response        jsonb,
  idempotency_key text unique,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);
create index integration_events_queue_idx on public.integration_events (status, next_attempt_at)
  where status in ('queued', 'failed');

create table public.stripe_events (
  id           text primary key,
  type         text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

-- ─────────────────────────────────────────────── Workforce 2.0 on-prem installations
create table public.workforce_installations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  name               text not null,
  hostname           text,
  license_key_prefix text not null,          -- first 8 chars shown in UI
  license_key_hash   text not null unique,   -- sha256 of full key
  mcp_token_hash     text unique,            -- issued at activation
  status             text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  version            text,
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────── platform admins (Henry, Trence) + audit
create table public.platform_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       text not null default 'super_admin' check (role in ('super_admin', 'support')),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────── helpers
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();

-- New auth user → profile + free Directory entitlement
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_free uuid;
begin
  insert into public.profiles (id, email, first_name, last_name, company_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.raw_user_meta_data ->> 'company_name'
  );

  select id into v_free from public.plans where code = 'dir_scout' limit 1;
  if v_free is not null then
    insert into public.entitlements (user_id, module_key, plan_id, status, source)
    values (new.id, 'directory', v_free, 'active', 'free');
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync when the user changes it in Auth
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Rebuild a user's entitlements from their Stripe subscriptions (+ keep free/admin/license grants)
create or replace function public.recompute_entitlements(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- best paid grant per module from live subscriptions
  with paid as (
    select distinct on (m.module_key)
      m.module_key, pl.id as plan_id,
      case s.status when 'trialing' then 'trialing' when 'past_due' then 'past_due' else 'active' end::public.entitlement_status as status,
      s.current_period_end
    from public.subscriptions s
    join public.subscription_items si on si.subscription_id = s.id
    join public.plans pl on pl.id = si.plan_id
    cross join lateral unnest(public.plan_modules(pl)) as m(module_key)
    where s.user_id = p_user and s.status in ('active', 'trialing', 'past_due')
    order by m.module_key, pl.price_cents desc
  )
  insert into public.entitlements (user_id, module_key, plan_id, status, source, valid_until, updated_at)
  select p_user, module_key, plan_id, status, 'stripe', current_period_end, now() from paid
  on conflict (user_id, module_key) do update
    set plan_id = excluded.plan_id, status = excluded.status, source = 'stripe',
        valid_until = excluded.valid_until, updated_at = now()
    where public.entitlements.source in ('stripe', 'free')
      and (public.entitlements.plan_id, public.entitlements.status, public.entitlements.valid_until)
          is distinct from (excluded.plan_id, excluded.status, excluded.valid_until);

  -- stripe grants that no longer have a live subscription
  update public.entitlements e
     set status = 'canceled', updated_at = now()
   where e.user_id = p_user and e.source = 'stripe' and e.status <> 'canceled'
     and not exists (
       select 1 from public.subscriptions s
       join public.subscription_items si on si.subscription_id = s.id
       join public.plans pl on pl.id = si.plan_id
       where s.user_id = p_user and s.status in ('active', 'trialing', 'past_due')
         and e.module_key = any (public.plan_modules(pl))
     );

  -- a canceled paid Directory plan falls back to the free Scout plan
  update public.entitlements e
     set status = 'active', source = 'free', valid_until = null, updated_at = now(),
         plan_id = (select id from public.plans where code = 'dir_scout')
   where e.user_id = p_user and e.module_key = 'directory' and e.status = 'canceled';
end $$;

-- Any entitlement change → queue provisioning for the matching cloud module
create or replace function public.enqueue_entitlement_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text;
begin
  if new.module_key = 'workforce' then return new; end if;   -- on-prem pulls via MCP
  v_type := case
    when tg_op = 'INSERT' then 'member.provision'
    when new.status = 'canceled' then 'member.entitlement_revoked'
    else 'member.plan_changed'
  end;
  insert into public.integration_events (direction, module_key, event_type, user_id, payload)
  values ('outbound', new.module_key, v_type, new.user_id,
          jsonb_build_object('plan_id', new.plan_id, 'status', new.status, 'valid_until', new.valid_until));
  return new;
end $$;

create trigger entitlements_sync after insert or update on public.entitlements
  for each row execute function public.enqueue_entitlement_sync();

-- Profile identity changes / disable → queue update for every linked module
create or replace function public.enqueue_profile_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.email, new.first_name, new.last_name, new.status, new.company_name)
     is distinct from (old.email, old.first_name, old.last_name, old.status, old.company_name) then
    insert into public.integration_events (direction, module_key, event_type, user_id, payload)
    select 'outbound', l.module_key,
           case when new.status = 'disabled' then 'member.disable' else 'member.update' end,
           new.id, '{}'::jsonb
    from public.identity_links l
    where l.user_id = new.id and l.module_key <> 'workforce';
  end if;
  return new;
end $$;

create trigger profiles_sync after update on public.profiles
  for each row execute function public.enqueue_profile_sync();

-- Users can only change these profile fields themselves
create or replace function public.update_my_profile(
  p_first_name text default null, p_last_name text default null,
  p_company_name text default null, p_phone text default null,
  p_default_module public.module_key default null)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  update public.profiles set
    first_name     = coalesce(p_first_name, first_name),
    last_name      = coalesce(p_last_name, last_name),
    company_name   = coalesce(p_company_name, company_name),
    phone          = coalesce(p_phone, phone),
    default_module = coalesce(p_default_module, default_module)
  where id = auth.uid()
  returning * into r;
  return r;
end $$;

-- Remember the module the user opened last (smart redirect)
create or replace function public.set_last_module(p_module public.module_key)
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_module = p_module where id = auth.uid();
$$;

-- Smart redirect: last used module if still entitled, else default, else directory
create or replace function public.resolve_landing_module()
returns public.module_key language sql stable security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid()),
  ok as (select module_key from public.entitlements
         where user_id = auth.uid() and status in ('active', 'trialing', 'past_due'))
  select coalesce(
    (select last_module from me where last_module in (select module_key from ok)),
    (select default_module from me where default_module in (select module_key from ok)),
    (select module_key from ok order by module_key limit 1),
    'directory'::public.module_key)
$$;

-- Admin dashboard numbers
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users',          (select count(*) from public.profiles),
    'active_users',   (select count(*) from public.profiles where status = 'active'),
    'paying_users',   (select count(distinct user_id) from public.subscriptions where status in ('active', 'trialing', 'past_due')),
    'mrr_cents',      (select coalesce(sum(case pl.interval when 'year' then pl.price_cents / 12 else pl.price_cents end * si.quantity), 0)
                         from public.subscriptions s join public.subscription_items si on si.subscription_id = s.id
                         join public.plans pl on pl.id = si.plan_id where s.status in ('active', 'past_due')),
    'by_module',      (select jsonb_object_agg(module_key, n) from (
                         select module_key, count(*) n from public.entitlements
                         where status in ('active', 'trialing', 'past_due') group by module_key) t),
    'queue_failed',   (select count(*) from public.integration_events where status in ('failed', 'dead')),
    'queue_pending',  (select count(*) from public.integration_events where status = 'queued'),
    'installations',  (select count(*) from public.workforce_installations where status = 'active')
  );
end $$;

-- ─────────────────────────────────────────────── RLS
alter table public.modules                 enable row level security;
alter table public.profiles                enable row level security;
alter table public.plans                   enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.subscription_items      enable row level security;
alter table public.invoices                enable row level security;
alter table public.entitlements            enable row level security;
alter table public.identity_links          enable row level security;
alter table public.sso_tickets             enable row level security;
alter table public.integration_events      enable row level security;
alter table public.stripe_events           enable row level security;
alter table public.workforce_installations enable row level security;
alter table public.platform_admins         enable row level security;
alter table public.audit_log               enable row level security;

-- public catalogue
create policy "modules readable" on public.modules for select using (true);
create policy "public plans readable" on public.plans for select using ((is_public and is_active) or public.is_platform_admin());
create policy "admins manage plans" on public.plans for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage modules" on public.modules for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- self + admin read
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_platform_admin());
create policy "admins update profiles" on public.profiles for update using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "own subscriptions" on public.subscriptions for select using (user_id = auth.uid() or public.is_platform_admin());
create policy "own subscription items" on public.subscription_items for select using (
  exists (select 1 from public.subscriptions s where s.id = subscription_id and (s.user_id = auth.uid() or public.is_platform_admin())));
create policy "own invoices" on public.invoices for select using (user_id = auth.uid() or public.is_platform_admin());
create policy "own entitlements" on public.entitlements for select using (user_id = auth.uid() or public.is_platform_admin());
create policy "admins grant entitlements" on public.entitlements for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "own links" on public.identity_links for select using (user_id = auth.uid() or public.is_platform_admin());
create policy "own tickets" on public.sso_tickets for select using (user_id = auth.uid() or public.is_platform_admin());
create policy "own installations" on public.workforce_installations for select using (user_id = auth.uid() or public.is_platform_admin());
create policy "admins manage installations" on public.workforce_installations for update using (public.is_platform_admin());

-- admin only
create policy "admins read events" on public.integration_events for select using (public.is_platform_admin());
create policy "admins retry events" on public.integration_events for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins read stripe events" on public.stripe_events for select using (public.is_platform_admin());
create policy "admins read admins" on public.platform_admins for select using (public.is_platform_admin());
create policy "admins read audit" on public.audit_log for select using (public.is_platform_admin());

-- functions callable by signed-in users
revoke all on function public.recompute_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.update_my_profile(text, text, text, text, public.module_key) to authenticated;
grant execute on function public.set_last_module(public.module_key) to authenticated;
grant execute on function public.resolve_landing_module() to authenticated;
grant execute on function public.admin_stats() to authenticated;
