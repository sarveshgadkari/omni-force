-- OmniForce hub — central module access.
-- OmniForce decides WHO may enter a module (entitlements + seats). Each module
-- keeps deciding WHAT people can do inside it (its own roles and resource permissions).
--
-- Entitlements are owned by exactly one of: an individual (user_id) or an
-- organization (organization_id). A user's effective access to a module is
--   their own live entitlement, or
--   a live entitlement of an active organization where they are an active
--   member AND hold a seat for that module.
-- module_access_for() is the single place that rule is implemented.

-- ─────────────────────────────────────────────── module integration state
-- Nothing is assumed to work until it has been verified with the module's team.
alter table public.modules
  add column app_url             text,
  add column sso_status          text not null default 'not_configured'
                                 check (sso_status in ('not_configured', 'testing', 'enabled')),
  add column provisioning_status text not null default 'disabled'
                                 check (provisioning_status in ('disabled', 'enabled')),
  add column integration_notes   text;

comment on column public.modules.launch_url is
  'Deprecated. Launch targets now live on oauth_clients.initiate_login_uri. The original values pointed at SSO endpoints that were never built.';
comment on column public.modules.sso_status is
  'not_configured: no sign-in via OmniForce. testing: platform admins only. enabled: everyone with access.';

update public.modules set
  launch_url = null,
  app_url = case key when 'directory' then 'https://drones-drones-drones.directoryup.com'
                     when 'wsso'      then 'https://wsso.tlbisbig.world' end,
  integration_notes = case key
    when 'directory' then 'Brilliant Directories. SSO protocol support not verified; REST provisioning endpoints not confirmed with the BD team.'
    when 'wsso'      then 'Separate Supabase project (profiles, organizations). Integration contract drafted, nothing deployed on the WSSO side.'
    when 'workforce' then 'On-premise. Licence activation + MCP; no web SSO.' end;

-- Which kind of owner may hold a plan.
alter table public.plans
  add column audience text not null default 'any' check (audience in ('any', 'individual', 'organization'));

-- ─────────────────────────────────────────────── ownership
alter table public.entitlements
  add column organization_id uuid references public.organizations (id) on delete cascade,
  add column granted_by      uuid references public.profiles (id) on delete set null,
  alter column user_id drop not null,
  add constraint entitlements_one_owner check (num_nonnulls(user_id, organization_id) = 1),
  add constraint entitlements_organization_id_module_key_key unique (organization_id, module_key);

-- user_id on a subscription is whoever bought it; organization_id (if set) owns it.
alter table public.subscriptions
  add column organization_id uuid references public.organizations (id) on delete restrict;
create index subscriptions_org_idx on public.subscriptions (organization_id) where organization_id is not null;

alter table public.invoices
  add column organization_id uuid references public.organizations (id) on delete cascade,
  alter column user_id drop not null,
  add constraint invoices_one_owner check (num_nonnulls(user_id, organization_id) >= 1);

alter table public.integration_events
  add column organization_id uuid references public.organizations (id) on delete set null;

-- ─────────────────────────────────────────────── effective access

create or replace function public.entitlement_is_live(p_status public.entitlement_status, p_source text, p_valid_until timestamptz)
returns boolean language sql stable as $$
  -- Stripe grants get 7 days past the period end in case a renewal webhook is late.
  select p_status in ('active', 'trialing', 'past_due')
     and (p_valid_until is null
          or p_valid_until > now() - case when p_source = 'stripe' then interval '7 days' else interval '0' end)
$$;

-- Bundle refs look like "2|growth": first part for Directory, last part for others.
create or replace function public.plan_ref_for(p_ref text, p_module public.module_key)
returns text language sql immutable as $$
  select case when p_ref is null then null
              when p_module = 'directory' then split_part(p_ref, '|', 1)
              else (string_to_array(p_ref, '|'))[cardinality(string_to_array(p_ref, '|'))] end
$$;

create or replace function public.module_access_for(p_user uuid)
returns table (
  module_key public.module_key, via text, organization_id uuid, organization_name text, org_role public.org_role,
  entitlement_id uuid, plan_id uuid, plan_code text, plan_name text, plan_ref text, seats int,
  status public.entitlement_status, source text, valid_until timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select id from public.profiles where id = p_user and status = 'active')
  select e.module_key, 'individual', null::uuid, null::text, null::public.org_role,
         e.id, e.plan_id, pl.code, pl.name, public.plan_ref_for(pl.external_ref, e.module_key), pl.seats,
         e.status, e.source, e.valid_until
  from public.entitlements e
  join me on me.id = e.user_id
  left join public.plans pl on pl.id = e.plan_id
  where public.entitlement_is_live(e.status, e.source, e.valid_until)
  union all
  select e.module_key, 'organization', o.id, o.name, m.role,
         e.id, e.plan_id, pl.code, pl.name, public.plan_ref_for(pl.external_ref, e.module_key), pl.seats,
         e.status, e.source, e.valid_until
  from public.organization_members m
  join me on me.id = m.user_id
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  join public.organization_module_seats s on s.organization_id = m.organization_id and s.user_id = m.user_id
  join public.entitlements e on e.organization_id = o.id and e.module_key = s.module_key
  left join public.plans pl on pl.id = e.plan_id
  where m.status = 'active' and public.entitlement_is_live(e.status, e.source, e.valid_until)
$$;

create or replace function public.user_can_access_module(p_user uuid, p_module public.module_key, p_org uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.module_access_for(p_user) a
                 where a.module_key = p_module
                   and (p_org is null and a.via = 'individual' or a.organization_id = p_org))
$$;

create or replace function public.my_module_access()
returns table (
  module_key public.module_key, via text, organization_id uuid, organization_name text, org_role public.org_role,
  entitlement_id uuid, plan_id uuid, plan_code text, plan_name text, plan_ref text, seats int,
  status public.entitlement_status, source text, valid_until timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public.module_access_for(auth.uid())
$$;

create or replace function public.admin_module_access(p_user uuid)
returns table (
  module_key public.module_key, via text, organization_id uuid, organization_name text, org_role public.org_role,
  entitlement_id uuid, plan_id uuid, plan_code text, plan_name text, plan_ref text, seats int,
  status public.entitlement_status, source text, valid_until timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select * from public.module_access_for(p_user);
end $$;

-- Smart redirect now follows effective access (own or organization seat).
create or replace function public.resolve_landing_module()
returns public.module_key language sql stable security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid()),
  ok as (select distinct module_key from public.module_access_for(auth.uid()))
  select coalesce(
    (select last_module from me where last_module in (select module_key from ok)),
    (select default_module from me where default_module in (select module_key from ok)),
    (select module_key from ok order by module_key limit 1),
    'directory'::public.module_key)
$$;

-- ─────────────────────────────────────────────── seats

create or replace function public.assign_org_module_seat(p_org uuid, p_user uuid, p_module public.module_key)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ent   public.entitlements;
  v_seats int;
begin
  perform public.assert_org_role(p_org, '{owner,admin}');
  if not exists (select 1 from public.organization_members where organization_id = p_org and user_id = p_user and status = 'active') then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  -- lock the entitlement row so concurrent assignments can't exceed the seat limit
  select * into v_ent from public.entitlements where organization_id = p_org and module_key = p_module for update;
  if v_ent.id is null or not public.entitlement_is_live(v_ent.status, v_ent.source, v_ent.valid_until) then
    raise exception 'module_not_in_org_plan' using errcode = '22023';
  end if;
  if exists (select 1 from public.organization_module_seats where organization_id = p_org and user_id = p_user and module_key = p_module) then
    return;
  end if;
  select seats into v_seats from public.plans where id = v_ent.plan_id;
  if v_seats is not null and (select count(*) from public.organization_module_seats
                              where organization_id = p_org and module_key = p_module) >= v_seats then
    raise exception 'seat_limit_reached' using errcode = '22023';
  end if;
  insert into public.organization_module_seats (organization_id, user_id, module_key, assigned_by)
  values (p_org, p_user, p_module, auth.uid());
  perform public.write_audit(auth.uid(), 'org.seat.assign', 'organization', p_org::text,
    jsonb_build_object('user_id', p_user, 'module', p_module));
end $$;

create or replace function public.unassign_org_module_seat(p_org uuid, p_user uuid, p_module public.module_key)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.assert_active_caller();
begin
  if p_user <> v_uid then perform public.assert_org_role(p_org, '{owner,admin}'); end if;
  delete from public.organization_module_seats where organization_id = p_org and user_id = p_user and module_key = p_module;
  perform public.write_audit(v_uid, 'org.seat.unassign', 'organization', p_org::text,
    jsonb_build_object('user_id', p_user, 'module', p_module));
end $$;

-- Organization modules with seat usage, for the organization page.
create or replace function public.org_modules(p_org uuid)
returns table (module_key public.module_key, entitlement_id uuid, plan_name text, plan_code text, seats int, seats_used bigint,
               status public.entitlement_status, source text, valid_until timestamptz, live boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_org_member(p_org) or public.is_platform_admin()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select e.module_key, e.id, pl.name, pl.code, pl.seats,
           (select count(*) from public.organization_module_seats s where s.organization_id = p_org and s.module_key = e.module_key),
           e.status, e.source, e.valid_until, public.entitlement_is_live(e.status, e.source, e.valid_until)
    from public.entitlements e left join public.plans pl on pl.id = e.plan_id
    where e.organization_id = p_org
    order by e.module_key;
end $$;

-- When an organization first gets a module, its owners get seats (within the limit),
-- so the person who bought it can use it. Everyone else is assigned explicitly.
create or replace function public.seed_owner_seats()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_free bigint;
begin
  if new.organization_id is null or not public.entitlement_is_live(new.status, new.source, new.valid_until) then return new; end if;
  if tg_op = 'UPDATE' and public.entitlement_is_live(old.status, old.source, old.valid_until) then return new; end if;
  v_free := coalesce((select seats from public.plans where id = new.plan_id), 1000000)
            - (select count(*) from public.organization_module_seats where organization_id = new.organization_id and module_key = new.module_key);
  insert into public.organization_module_seats (organization_id, user_id, module_key)
  select m.organization_id, m.user_id, new.module_key
  from public.organization_members m
  where m.organization_id = new.organization_id and m.role = 'owner' and m.status = 'active'
    and not exists (select 1 from public.organization_module_seats s
                    where s.organization_id = m.organization_id and s.user_id = m.user_id and s.module_key = new.module_key)
  order by m.created_at
  limit greatest(v_free, 0);
  return new;
end $$;

create trigger entitlements_seed_owner_seats after insert or update on public.entitlements
  for each row execute function public.seed_owner_seats();

-- ─────────────────────────────────────────────── recompute from Stripe

create or replace function public.paid_grants(p_user uuid, p_org uuid)
returns table (module_key public.module_key, plan_id uuid, status public.entitlement_status, current_period_end timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (m.module_key)
    m.module_key, pl.id,
    case s.status when 'trialing' then 'trialing' when 'past_due' then 'past_due' else 'active' end::public.entitlement_status,
    s.current_period_end
  from public.subscriptions s
  join public.subscription_items si on si.subscription_id = s.id
  join public.plans pl on pl.id = si.plan_id
  cross join lateral unnest(public.plan_modules(pl)) as m(module_key)
  where s.status in ('active', 'trialing', 'past_due')
    and case when p_org is null then s.user_id = p_user and s.organization_id is null
             else s.organization_id = p_org end
  order by m.module_key, pl.price_cents desc
$$;

create or replace function public.recompute_owner_entitlements(p_user uuid, p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if num_nonnulls(p_user, p_org) <> 1 then raise exception 'exactly one of user or organization'; end if;

  if p_org is null then
    insert into public.entitlements (user_id, module_key, plan_id, status, source, valid_until, updated_at)
    select p_user, g.module_key, g.plan_id, g.status, 'stripe', g.current_period_end, now() from public.paid_grants(p_user, null) g
    on conflict (user_id, module_key) do update
      set plan_id = excluded.plan_id, status = excluded.status, source = 'stripe', valid_until = excluded.valid_until, updated_at = now()
      where public.entitlements.source in ('stripe', 'free')
        and (public.entitlements.plan_id, public.entitlements.status, public.entitlements.valid_until, public.entitlements.source)
            is distinct from (excluded.plan_id, excluded.status, excluded.valid_until, 'stripe');
  else
    insert into public.entitlements (organization_id, module_key, plan_id, status, source, valid_until, updated_at)
    select p_org, g.module_key, g.plan_id, g.status, 'stripe', g.current_period_end, now() from public.paid_grants(null, p_org) g
    on conflict (organization_id, module_key) do update
      set plan_id = excluded.plan_id, status = excluded.status, source = 'stripe', valid_until = excluded.valid_until, updated_at = now()
      where public.entitlements.source = 'stripe'
        and (public.entitlements.plan_id, public.entitlements.status, public.entitlements.valid_until)
            is distinct from (excluded.plan_id, excluded.status, excluded.valid_until);
  end if;

  -- Stripe grants without a live subscription anymore
  update public.entitlements e set status = 'canceled', updated_at = now()
   where (case when p_org is null then e.user_id = p_user else e.organization_id = p_org end)
     and e.source = 'stripe' and e.status <> 'canceled'
     and not exists (select 1 from public.paid_grants(p_user, p_org) g where g.module_key = e.module_key);

  -- An individual's canceled PAID Directory plan falls back to free Scout.
  -- (Only Stripe grants: an admin revoke must stay revoked.)
  if p_org is null then
    update public.entitlements e
       set status = 'active', source = 'free', valid_until = null, updated_at = now(),
           plan_id = (select id from public.plans where code = 'dir_scout')
     where e.user_id = p_user and e.module_key = 'directory' and e.status = 'canceled' and e.source = 'stripe'
       and exists (select 1 from public.plans where code = 'dir_scout');
  end if;
end $$;

-- Existing callers (stripe-webhook) keep working.
create or replace function public.recompute_entitlements(p_user uuid)
returns void language sql security definer set search_path = public as $$
  select public.recompute_owner_entitlements(p_user, null)
$$;

create or replace function public.recompute_org_entitlements(p_org uuid)
returns void language sql security definer set search_path = public as $$
  select public.recompute_owner_entitlements(null, p_org)
$$;

-- ─────────────────────────────────────────────── outbound sync gating
-- Nothing is sent to a module until its provisioning has been enabled by an admin
-- (after the module's API contract has been verified), and never for an
-- individual whose email is not verified yet.

create or replace function public.module_provisioning_enabled(p_module public.module_key)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.modules where key = p_module and provisioning_status = 'enabled' and is_active)
$$;

create or replace function public.enqueue_entitlement_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if new.module_key = 'workforce' then return new; end if;   -- on-prem pulls via MCP
  if tg_op = 'UPDATE' and (new.plan_id, new.status, new.valid_until) is not distinct from (old.plan_id, old.status, old.valid_until) then
    return new;
  end if;
  if not public.module_provisioning_enabled(new.module_key) then return new; end if;

  if new.organization_id is not null then
    insert into public.integration_events (direction, module_key, event_type, organization_id, payload)
    values ('outbound', new.module_key, 'organization.entitlement_changed', new.organization_id,
            jsonb_build_object('plan_id', new.plan_id, 'status', new.status, 'valid_until', new.valid_until));
    return new;
  end if;

  if not public.email_is_confirmed(new.user_id) then return new; end if;
  v_type := case when tg_op = 'INSERT' then 'member.provision'
                 when new.status = 'canceled' then 'member.entitlement_revoked'
                 else 'member.plan_changed' end;
  insert into public.integration_events (direction, module_key, event_type, user_id, payload)
  values ('outbound', new.module_key, v_type, new.user_id,
          jsonb_build_object('plan_id', new.plan_id, 'status', new.status, 'valid_until', new.valid_until));
  return new;
end $$;

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
    where l.user_id = new.id and l.module_key <> 'workforce' and l.status = 'linked'
      and public.module_provisioning_enabled(l.module_key);
  end if;
  return new;
end $$;

-- Email verified → provision the modules the user already has (if enabled).
create or replace function public.handle_user_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    insert into public.integration_events (direction, module_key, event_type, user_id, payload)
    select 'outbound', e.module_key, 'member.provision', e.user_id,
           jsonb_build_object('plan_id', e.plan_id, 'status', e.status, 'valid_until', e.valid_until)
    from public.entitlements e
    where e.user_id = new.id and e.module_key <> 'workforce' and e.status <> 'canceled'
      and public.module_provisioning_enabled(e.module_key);
  end if;
  return new;
end $$;

create trigger on_auth_user_email_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_email_confirmed();

-- ─────────────────────────────────────────────── admin numbers
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users',          (select count(*) from public.profiles),
    'active_users',   (select count(*) from public.profiles where status = 'active'),
    'organizations',  (select count(*) from public.organizations where status = 'active'),
    'paying_users',   (select count(distinct coalesce(organization_id, user_id)) from public.subscriptions where status in ('active', 'trialing', 'past_due')),
    'mrr_cents',      (select coalesce(sum(case pl.interval when 'year' then pl.price_cents / 12 else pl.price_cents end * si.quantity), 0)
                         from public.subscriptions s join public.subscription_items si on si.subscription_id = s.id
                         join public.plans pl on pl.id = si.plan_id where s.status in ('active', 'past_due')),
    'by_module',      (select jsonb_object_agg(module_key, n) from (
                         select module_key, count(*) n from public.entitlements
                         where public.entitlement_is_live(status, source, valid_until) group by module_key) t),
    'queue_failed',   (select count(*) from public.integration_events where status in ('failed', 'dead')),
    'queue_pending',  (select count(*) from public.integration_events where status = 'queued'),
    'links_to_review',(select count(*) from public.identity_links where status = 'pending_review'),
    'installations',  (select count(*) from public.workforce_installations where status = 'active')
  );
end $$;

-- ─────────────────────────────────────────────── RLS (replace user-only policies)
drop policy "own entitlements" on public.entitlements;
create policy "own or org entitlements" on public.entitlements for select using (
  user_id = auth.uid()
  or (organization_id is not null and public.is_org_member(organization_id))
  or public.is_platform_admin());

drop policy "own subscriptions" on public.subscriptions;
create policy "own or org billing subscriptions" on public.subscriptions for select using (
  (organization_id is null and user_id = auth.uid())
  or (organization_id is not null and public.has_org_role(organization_id, '{owner,billing}'))
  or public.is_platform_admin());

drop policy "own subscription items" on public.subscription_items;
create policy "own or org billing subscription items" on public.subscription_items for select using (
  exists (select 1 from public.subscriptions s where s.id = subscription_id and (
    (s.organization_id is null and s.user_id = auth.uid())
    or (s.organization_id is not null and public.has_org_role(s.organization_id, '{owner,billing}'))
    or public.is_platform_admin())));

drop policy "own invoices" on public.invoices;
create policy "own or org billing invoices" on public.invoices for select using (
  (organization_id is null and user_id = auth.uid())
  or (organization_id is not null and public.has_org_role(organization_id, '{owner,billing}'))
  or public.is_platform_admin());

revoke all on function public.module_access_for(uuid) from public, anon, authenticated;
revoke all on function public.user_can_access_module(uuid, public.module_key, uuid) from public, anon, authenticated;
revoke all on function public.paid_grants(uuid, uuid) from public, anon, authenticated;
revoke all on function public.recompute_owner_entitlements(uuid, uuid) from public, anon, authenticated;
revoke all on function public.recompute_entitlements(uuid) from public, anon, authenticated;
revoke all on function public.recompute_org_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.module_access_for(uuid) to service_role;
grant execute on function public.user_can_access_module(uuid, public.module_key, uuid) to service_role;
grant execute on function public.recompute_entitlements(uuid) to service_role;
grant execute on function public.recompute_org_entitlements(uuid) to service_role;
grant execute on function public.my_module_access() to authenticated;
grant execute on function public.admin_module_access(uuid) to authenticated;
grant execute on function public.assign_org_module_seat(uuid, uuid, public.module_key) to authenticated;
grant execute on function public.unassign_org_module_seat(uuid, uuid, public.module_key) to authenticated;
grant execute on function public.org_modules(uuid) to authenticated;
