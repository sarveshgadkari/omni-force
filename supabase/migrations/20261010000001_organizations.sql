-- OmniForce hub — organizations, memberships, explicit roles, invitations and
-- per-member module seats. Individual accounts keep working unchanged: a user
-- with no organization is simply an individual account.
--
-- Roles (explicit, no inheritance beyond what is listed):
--   owner   everything, including billing, ownership and other owners
--   admin   members, invitations, module seats, organization settings (not owners, not billing)
--   billing subscriptions, checkout, invoices and payment methods
--   member  uses the modules they hold a seat for
--
-- Mutations go through security-definer RPCs below, never direct table writes,
-- so every role rule lives in one place and is audited.

create type public.org_role as enum ('owner', 'admin', 'billing', 'member');

create table public.organizations (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'),
  name               text not null check (length(btrim(name)) between 2 and 120),
  status             public.account_status not null default 'active',
  stripe_customer_id text unique,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.org_role not null default 'member',
  status          text not null default 'active' check (status in ('active', 'suspended')),
  invited_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);
create trigger organization_members_touch before update on public.organization_members
  for each row execute function public.touch_updated_at();

create table public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role            public.org_role not null default 'member',
  token_hash      text not null unique,            -- sha256 hex of the token; the token itself is shown once
  invited_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles (id) on delete set null,
  revoked_at      timestamptz
);
create unique index organization_invitations_open_idx on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

-- Which members may use which of the organization's modules (a "seat").
-- Access is explicit: an organization entitlement alone grants nobody access.
create table public.organization_module_seats (
  organization_id uuid not null,
  user_id         uuid not null,
  module_key      public.module_key not null,
  assigned_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id, module_key),
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);

-- ─────────────────────────────────────────────── helpers

-- Caller's role in an organization (active membership), regardless of org status.
create or replace function public.my_org_role(p_org uuid)
returns public.org_role language sql stable security definer set search_path = public as $$
  select role from public.organization_members
  where organization_id = p_org and user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_org_role(p_org) is not null
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_org_role(p_org) = any (p_roles), false)
$$;

create or replace function public.write_audit(p_actor uuid, p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values (p_actor, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;

-- Signed-in, active caller or an error. Returns auth.uid().
create or replace function public.assert_active_caller()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v and status = 'active') then
    raise exception 'account_disabled' using errcode = '42501';
  end if;
  return v;
end $$;

-- Caller holds one of the roles in an ACTIVE organization, or an error.
create or replace function public.assert_org_role(p_org uuid, p_roles public.org_role[])
returns public.org_role language plpgsql stable security definer set search_path = public as $$
declare v_role public.org_role;
begin
  perform public.assert_active_caller();
  if not exists (select 1 from public.organizations where id = p_org and status = 'active') then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;
  v_role := public.my_org_role(p_org);
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_role;
end $$;

create or replace function public.email_is_confirmed(p_user uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where id = p_user and email_confirmed_at is not null)
$$;

create or replace function public.new_secret_token()
returns text language sql volatile as $$
  -- 2 × v4 UUID from pg_strong_random → 244 random bits, 64 hex chars
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

create or replace function public.sha256_hex(p text)
returns text language sql immutable strict as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

create or replace function public.slugify(p text)
returns text language sql immutable as $$
  select left(btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-'), 48)
$$;

-- An organization always keeps at least one active owner.
create or replace function public.guard_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return null;   -- the organization itself is being deleted
  end if;
  if not exists (select 1 from public.organization_members
                 where organization_id = old.organization_id and role = 'owner' and status = 'active') then
    raise exception 'last_owner' using errcode = 'P0001',
      detail = 'An organization needs at least one active owner. Make someone else owner first.';
  end if;
  return null;
end $$;

create trigger organization_members_last_owner
  after update or delete on public.organization_members
  for each row execute function public.guard_last_owner();

-- ─────────────────────────────────────────────── RPCs

create or replace function public.create_organization(p_name text, p_slug text default null)
returns public.organizations language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := public.assert_active_caller();
  v_slug text;
  v_org  public.organizations;
begin
  if not public.email_is_confirmed(v_uid) then raise exception 'email_unverified' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = '22023'; end if;

  if nullif(btrim(p_slug), '') is not null then
    v_slug := lower(btrim(p_slug));
    if v_slug !~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$' then raise exception 'invalid_slug' using errcode = '22023'; end if;
    if exists (select 1 from public.organizations where slug = v_slug) then raise exception 'slug_taken' using errcode = '23505'; end if;
  else
    v_slug := public.slugify(p_name);
    if length(v_slug) < 1 then v_slug := 'org'; end if;
    if exists (select 1 from public.organizations where slug = v_slug) then
      v_slug := left(v_slug, 41) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
    end if;
  end if;

  insert into public.organizations (slug, name, created_by) values (v_slug, btrim(p_name), v_uid) returning * into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org.id, v_uid, 'owner');
  perform public.write_audit(v_uid, 'org.create', 'organization', v_org.id::text, jsonb_build_object('slug', v_slug));
  return v_org;
end $$;

create or replace function public.update_organization(p_org uuid, p_name text)
returns public.organizations language plpgsql security definer set search_path = public as $$
declare v_org public.organizations;
begin
  perform public.assert_org_role(p_org, '{owner,admin}');
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.organizations set name = btrim(p_name) where id = p_org returning * into v_org;
  perform public.write_audit(auth.uid(), 'org.update', 'organization', p_org::text, jsonb_build_object('name', v_org.name));
  return v_org;
end $$;

-- Organizations the caller belongs to.
create or replace function public.my_organizations()
returns table (id uuid, slug text, name text, status public.account_status, role public.org_role, member_count bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.slug, o.name, o.status, m.role,
         (select count(*) from public.organization_members x where x.organization_id = o.id and x.status = 'active'),
         o.created_at
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by o.name
$$;

-- Members of an organization the caller belongs to. Emails only for owners/admins.
create or replace function public.org_members(p_org uuid)
returns table (user_id uuid, omniforce_id text, first_name text, last_name text, email text,
               role public.org_role, status text, joined_at timestamptz, modules public.module_key[])
language plpgsql stable security definer set search_path = public as $$
declare v_role public.org_role := public.my_org_role(p_org);
begin
  if v_role is null and not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.user_id, p.omniforce_id, p.first_name, p.last_name,
           case when v_role in ('owner', 'admin') or public.is_platform_admin() then p.email end,
           m.role, m.status, m.created_at,
           coalesce((select array_agg(s.module_key order by s.module_key) from public.organization_module_seats s
                     where s.organization_id = m.organization_id and s.user_id = m.user_id), '{}')
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org
    order by array_position(array['owner', 'admin', 'billing', 'member']::public.org_role[], m.role), p.first_name;
end $$;

create or replace function public.create_org_invitation(p_org uuid, p_email text, p_role public.org_role default 'member')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role  public.org_role := public.assert_org_role(p_org, '{owner,admin}');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := public.new_secret_token();
  v_inv   public.organization_invitations;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  if p_role = 'owner' and v_role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
             where m.organization_id = p_org and lower(p.email) = v_email) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  update public.organization_invitations set revoked_at = now()
   where organization_id = p_org and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by)
  values (p_org, v_email, p_role, public.sha256_hex(v_token), auth.uid()) returning * into v_inv;

  perform public.write_audit(auth.uid(), 'org.invite', 'organization', p_org::text, jsonb_build_object('email', v_email, 'role', p_role));
  return jsonb_build_object('id', v_inv.id, 'token', v_token, 'email', v_email, 'role', p_role, 'expires_at', v_inv.expires_at);
end $$;

create or replace function public.org_invitations(p_org uuid)
returns table (id uuid, email text, role public.org_role, created_at timestamptz, expires_at timestamptz, invited_by_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_org_role(p_org, '{owner,admin}') or public.is_platform_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select i.id, i.email, i.role, i.created_at, i.expires_at, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    from public.organization_invitations i left join public.profiles p on p.id = i.invited_by
    where i.organization_id = p_org and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc;
end $$;

create or replace function public.revoke_org_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.organization_invitations where id = p_invitation;
  if v_org is null then raise exception 'invitation_not_found' using errcode = 'P0002'; end if;
  perform public.assert_org_role(v_org, '{owner,admin}');
  update public.organization_invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
  perform public.write_audit(auth.uid(), 'org.invite.revoke', 'organization', v_org::text, jsonb_build_object('invitation_id', p_invitation));
end $$;

-- Preview for the accept page (the token holder only learns what the invite is for).
create or replace function public.get_org_invitation(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  perform public.assert_active_caller();
  select i.*, o.name as org_name into v
  from public.organization_invitations i join public.organizations o on o.id = i.organization_id
  where i.token_hash = public.sha256_hex(coalesce(p_token, ''));
  if v is null then return jsonb_build_object('state', 'invalid'); end if;
  return jsonb_build_object(
    'organization_name', v.org_name, 'role', v.role, 'email', v.email,
    'state', case when v.revoked_at is not null or v.accepted_at is not null then 'used'
                  when v.expires_at <= now() then 'expired' else 'open' end);
end $$;

-- Accepting requires the signed-in user's VERIFIED email to equal the invited email,
-- so a forwarded or leaked link can't put the wrong account into the organization.
create or replace function public.accept_org_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid   uuid := public.assert_active_caller();
  v_inv   public.organization_invitations;
  v_email text;
begin
  select * into v_inv from public.organization_invitations
   where token_hash = public.sha256_hex(coalesce(p_token, '')) for update;
  if v_inv.id is null then raise exception 'invalid_invitation' using errcode = 'P0002'; end if;
  if v_inv.revoked_at is not null or v_inv.accepted_at is not null then raise exception 'invitation_used' using errcode = '22023'; end if;
  if v_inv.expires_at <= now() then raise exception 'invitation_expired' using errcode = '22023'; end if;
  if not exists (select 1 from public.organizations where id = v_inv.organization_id and status = 'active') then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'email_unverified' using errcode = '42501'; end if;
  if v_email <> v_inv.email then raise exception 'invitation_email_mismatch' using errcode = '42501'; end if;

  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (v_inv.organization_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (organization_id, user_id) do nothing;   -- existing members keep their current role
  update public.organization_invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;

  perform public.write_audit(v_uid, 'org.invite.accept', 'organization', v_inv.organization_id::text, jsonb_build_object('role', v_inv.role));
  return v_inv.organization_id;
end $$;

create or replace function public.set_org_member_role(p_org uuid, p_user uuid, p_role public.org_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller public.org_role := public.assert_org_role(p_org, '{owner,admin}');
  v_target public.org_role;
begin
  select role into v_target from public.organization_members where organization_id = p_org and user_id = p_user;
  if v_target is null then raise exception 'member_not_found' using errcode = 'P0002'; end if;
  if (v_target = 'owner' or p_role = 'owner') and v_caller <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.organization_members set role = p_role where organization_id = p_org and user_id = p_user;
  perform public.write_audit(auth.uid(), 'org.member.role', 'organization', p_org::text,
    jsonb_build_object('user_id', p_user, 'from', v_target, 'to', p_role));
end $$;

create or replace function public.remove_org_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public.assert_active_caller();
  v_caller public.org_role;
  v_target public.org_role;
begin
  select role into v_target from public.organization_members where organization_id = p_org and user_id = p_user;
  if v_target is null then raise exception 'member_not_found' using errcode = 'P0002'; end if;
  if p_user <> v_uid then   -- leaving is always allowed (last-owner guard still applies)
    v_caller := public.assert_org_role(p_org, '{owner,admin}');
    if v_target = 'owner' and v_caller <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  delete from public.organization_members where organization_id = p_org and user_id = p_user;
  perform public.write_audit(v_uid, case when p_user = v_uid then 'org.member.leave' else 'org.member.remove' end,
    'organization', p_org::text, jsonb_build_object('user_id', p_user, 'role', v_target));
end $$;

-- ─────────────────────────────────────────────── RLS

alter table public.organizations              enable row level security;
alter table public.organization_members       enable row level security;
alter table public.organization_invitations   enable row level security;
alter table public.organization_module_seats  enable row level security;

create policy "members read organization" on public.organizations
  for select using (public.is_org_member(id) or public.is_platform_admin());
create policy "admins update organizations" on public.organizations
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "members read memberships" on public.organization_members
  for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "members read seats" on public.organization_module_seats
  for select using (public.is_org_member(organization_id) or public.is_platform_admin());
-- invitations: no direct access; use org_invitations() / get_org_invitation()
revoke all on public.organization_invitations from anon, authenticated;

revoke all on function public.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.new_secret_token() from public, anon, authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.update_organization(uuid, text) to authenticated;
grant execute on function public.my_organizations() to authenticated;
grant execute on function public.org_members(uuid) to authenticated;
grant execute on function public.create_org_invitation(uuid, text, public.org_role) to authenticated;
grant execute on function public.org_invitations(uuid) to authenticated;
grant execute on function public.revoke_org_invitation(uuid) to authenticated;
grant execute on function public.get_org_invitation(text) to authenticated;
grant execute on function public.accept_org_invitation(text) to authenticated;
grant execute on function public.set_org_member_role(uuid, uuid, public.org_role) to authenticated;
grant execute on function public.remove_org_member(uuid, uuid) to authenticated;
