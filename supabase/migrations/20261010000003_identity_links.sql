-- OmniForce hub — identity mapping to module accounts, hardened.
--
-- Rules (enforced in record_identity_link / record_organization_link):
--   * One OmniForce user ↔ at most one account per module, and one module account
--     ↔ at most one OmniForce user (no duplicates in either direction).
--   * A link becomes 'linked' only with proof: OmniForce created the account
--     ('provisioned'), the module asserted it after the user signed in through
--     OmniForce ('app_assertion'), or a platform admin linked it ('admin').
--   * Matching by email ('verified_email') or bulk import ('import') only ever
--     creates a 'pending_review' candidate. A candidate grants nothing.
--   * Existing links are never silently re-pointed; a conflict is an error.
--
-- Organization links map an OmniForce organization to a module's own
-- organization/workspace (e.g. a WSSO `organizations` row) with the same rules.

alter table public.identity_links drop constraint identity_links_status_check;
alter table public.identity_links
  add constraint identity_links_status_check check (status in ('pending', 'pending_review', 'linked', 'error', 'disabled')),
  add column link_method   text check (link_method in ('provisioned', 'app_assertion', 'verified_email', 'admin', 'import')),
  add column verified_at   timestamptz,
  add column verified_by   uuid references public.profiles (id) on delete set null,
  add column review_reason text,
  add column created_at    timestamptz not null default now(),
  add constraint identity_links_linked_has_proof check (status <> 'linked' or (external_id is not null and link_method is not null));

create table public.organization_links (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  module_key       public.module_key not null,
  external_org_id  text not null,
  status           text not null default 'pending_review' check (status in ('pending_review', 'linked', 'error', 'disabled')),
  link_method      text not null check (link_method in ('provisioned', 'app_assertion', 'admin', 'import')),
  verified_at      timestamptz,
  verified_by      uuid references public.profiles (id) on delete set null,
  review_reason    text,
  last_error       text,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  unique (organization_id, module_key),
  unique (module_key, external_org_id)
);

-- ─────────────────────────────────────────────── central linking rules

-- Service-side entry point for every new or confirmed identity link.
create or replace function public.record_identity_link(
  p_user uuid, p_module public.module_key, p_external_id text, p_method text,
  p_external_account_id text default null, p_reason text default null, p_actor uuid default null)
returns public.identity_links language plpgsql security definer set search_path = public as $$
declare
  v_other  uuid;
  v_cur    public.identity_links;
  v_status text := case when p_method in ('provisioned', 'app_assertion', 'admin') then 'linked' else 'pending_review' end;
  v_row    public.identity_links;
begin
  if p_method not in ('provisioned', 'app_assertion', 'verified_email', 'admin', 'import') then
    raise exception 'invalid_link_method' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_external_id, '')), '') is null then raise exception 'external_id_required' using errcode = '22023'; end if;

  select user_id into v_other from public.identity_links where module_key = p_module and external_id = p_external_id;
  if v_other is not null and v_other <> p_user then
    raise exception 'external_account_linked_to_other_user' using errcode = '23505';
  end if;

  select * into v_cur from public.identity_links where user_id = p_user and module_key = p_module for update;
  if v_cur.id is not null and v_cur.external_id is not null and v_cur.external_id <> p_external_id
     and v_cur.status in ('linked', 'pending_review') then
    raise exception 'user_already_linked_to_other_account' using errcode = '23505';
  end if;
  -- never downgrade a proven link to a candidate
  if v_cur.status = 'linked' and v_status = 'pending_review' then return v_cur; end if;

  insert into public.identity_links (user_id, module_key, external_id, external_account_id, status, link_method,
                                     linked_at, verified_at, verified_by, review_reason, last_error, last_synced_at)
  values (p_user, p_module, p_external_id, p_external_account_id, v_status, p_method,
          case when v_status = 'linked' then now() end, case when v_status = 'linked' then now() end,
          p_actor, p_reason, null, now())
  on conflict (user_id, module_key) do update set
    external_id = excluded.external_id,
    external_account_id = coalesce(excluded.external_account_id, public.identity_links.external_account_id),
    status = excluded.status, link_method = excluded.link_method,
    linked_at = coalesce(public.identity_links.linked_at, excluded.linked_at),
    verified_at = excluded.verified_at, verified_by = excluded.verified_by,
    review_reason = excluded.review_reason, last_error = null, last_synced_at = now()
  returning * into v_row;

  perform public.write_audit(p_actor, 'identity_link.' || v_status, 'user', p_user::text,
    jsonb_build_object('module', p_module, 'external_id', p_external_id, 'method', p_method));
  return v_row;
end $$;

create or replace function public.record_organization_link(
  p_org uuid, p_module public.module_key, p_external_org_id text, p_method text, p_actor uuid default null)
returns public.organization_links language plpgsql security definer set search_path = public as $$
declare
  v_other  uuid;
  v_cur    public.organization_links;
  v_status text := case when p_method in ('provisioned', 'app_assertion', 'admin') then 'linked' else 'pending_review' end;
  v_row    public.organization_links;
begin
  if p_method not in ('provisioned', 'app_assertion', 'admin', 'import') then raise exception 'invalid_link_method' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_external_org_id, '')), '') is null then raise exception 'external_id_required' using errcode = '22023'; end if;

  select organization_id into v_other from public.organization_links where module_key = p_module and external_org_id = p_external_org_id;
  if v_other is not null and v_other <> p_org then
    raise exception 'external_org_linked_to_other_organization' using errcode = '23505';
  end if;
  select * into v_cur from public.organization_links where organization_id = p_org and module_key = p_module for update;
  if v_cur.id is not null and v_cur.external_org_id <> p_external_org_id and v_cur.status in ('linked', 'pending_review') then
    raise exception 'organization_already_linked_to_other_account' using errcode = '23505';
  end if;
  if v_cur.status = 'linked' and v_status = 'pending_review' then return v_cur; end if;

  insert into public.organization_links (organization_id, module_key, external_org_id, status, link_method, verified_at, verified_by, last_synced_at)
  values (p_org, p_module, p_external_org_id, v_status, p_method, case when v_status = 'linked' then now() end, p_actor, now())
  on conflict (organization_id, module_key) do update set
    external_org_id = excluded.external_org_id, status = excluded.status, link_method = excluded.link_method,
    verified_at = excluded.verified_at, verified_by = excluded.verified_by, last_error = null, last_synced_at = now()
  returning * into v_row;

  perform public.write_audit(p_actor, 'organization_link.' || v_status, 'organization', p_org::text,
    jsonb_build_object('module', p_module, 'external_org_id', p_external_org_id, 'method', p_method));
  return v_row;
end $$;

-- ─────────────────────────────────────────────── platform admin review

create or replace function public.admin_review_identity_link(p_link uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.identity_links;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from public.identity_links where id = p_link for update;
  if v.id is null then raise exception 'link_not_found' using errcode = 'P0002'; end if;
  if v.status <> 'pending_review' then raise exception 'link_not_pending' using errcode = '22023'; end if;
  if p_approve then
    update public.identity_links set status = 'linked', linked_at = now(), verified_at = now(), verified_by = auth.uid(),
           review_reason = p_reason where id = p_link;
  else
    delete from public.identity_links where id = p_link;
  end if;
  perform public.write_audit(auth.uid(), case when p_approve then 'identity_link.approve' else 'identity_link.reject' end,
    'user', v.user_id::text, jsonb_build_object('module', v.module_key, 'external_id', v.external_id, 'reason', p_reason));
end $$;

create or replace function public.admin_link_identity(p_user uuid, p_module public.module_key, p_external_id text, p_reason text)
returns public.identity_links language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  return public.record_identity_link(p_user, p_module, btrim(p_external_id), 'admin', null, p_reason, auth.uid());
end $$;

create or replace function public.admin_unlink_identity(p_link uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.identity_links;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.identity_links where id = p_link returning * into v;
  if v.id is null then raise exception 'link_not_found' using errcode = 'P0002'; end if;
  perform public.write_audit(auth.uid(), 'identity_link.remove', 'user', v.user_id::text,
    jsonb_build_object('module', v.module_key, 'external_id', v.external_id, 'reason', p_reason));
end $$;

create or replace function public.admin_link_organization(p_org uuid, p_module public.module_key, p_external_org_id text, p_reason text)
returns public.organization_links language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  return public.record_organization_link(p_org, p_module, btrim(p_external_org_id), 'admin', auth.uid());
end $$;

create or replace function public.admin_unlink_organization(p_link uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.organization_links;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.organization_links where id = p_link returning * into v;
  if v.id is null then raise exception 'link_not_found' using errcode = 'P0002'; end if;
  perform public.write_audit(auth.uid(), 'organization_link.remove', 'organization', v.organization_id::text,
    jsonb_build_object('module', v.module_key, 'external_org_id', v.external_org_id, 'reason', p_reason));
end $$;

-- ─────────────────────────────────────────────── RLS
alter table public.organization_links enable row level security;
create policy "members read organization links" on public.organization_links
  for select using (public.is_org_member(organization_id) or public.is_platform_admin());

-- identity_links: users read their own (existing policy); writes only through the functions above.
revoke insert, update, delete on public.identity_links from anon, authenticated;

revoke all on function public.record_identity_link(uuid, public.module_key, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.record_organization_link(uuid, public.module_key, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_identity_link(uuid, public.module_key, text, text, text, text, uuid) to service_role;
grant execute on function public.record_organization_link(uuid, public.module_key, text, text, uuid) to service_role;
grant execute on function public.admin_review_identity_link(uuid, boolean, text) to authenticated;
grant execute on function public.admin_link_identity(uuid, public.module_key, text, text) to authenticated;
grant execute on function public.admin_unlink_identity(uuid, text) to authenticated;
grant execute on function public.admin_link_organization(uuid, public.module_key, text, text) to authenticated;
grant execute on function public.admin_unlink_organization(uuid, text) to authenticated;
