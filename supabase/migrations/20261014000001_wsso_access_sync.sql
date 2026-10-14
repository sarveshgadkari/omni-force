-- OmniForce hub — keep WSSO in step with access decided here.
--
-- WSSO accounts are created on first sign-in through OmniForce (WSSO is the OIDC
-- client). After that, OmniForce pushes signed access events to WSSO
-- (/api/omniforce/events) from the sync worker:
--   individual entitlement changed     → access.updated / access.revoked  (personal workspace)
--   organization entitlement / status  → access.updated / access.revoked  (team workspace)
--   organization seat / membership     → member.enabled / member.disabled (that person, in that workspace)
--   OmniForce account disabled/enabled → member.disabled / member.enabled
-- Nothing is queued unless modules.provisioning_status = 'enabled' for the module.

-- ─────────────────────────────────────────────── seats and memberships

create or replace function public.enqueue_org_seat_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  if r.module_key = 'workforce' or not public.module_provisioning_enabled(r.module_key) then return null; end if;
  -- the person is being deleted (cascade): nothing to sync, and the FK would reject the event
  if not exists (select 1 from public.profiles where id = r.user_id) then return null; end if;
  insert into public.integration_events (direction, module_key, event_type, user_id, organization_id, payload)
  values ('outbound', r.module_key, case when tg_op = 'DELETE' then 'member.seat_removed' else 'member.seat_assigned' end,
          r.user_id, r.organization_id, '{}'::jsonb);
  return null;
end $$;

drop trigger if exists organization_module_seats_sync on public.organization_module_seats;
create trigger organization_module_seats_sync after insert or delete on public.organization_module_seats
  for each row execute function public.enqueue_org_seat_sync();

-- A suspended member keeps their seats but loses access: tell the module.
create or replace function public.enqueue_org_member_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return null; end if;
  insert into public.integration_events (direction, module_key, event_type, user_id, organization_id, payload)
  select 'outbound', s.module_key, 'member.org_status_changed', s.user_id, s.organization_id,
         jsonb_build_object('status', new.status)
  from public.organization_module_seats s
  where s.organization_id = new.organization_id and s.user_id = new.user_id
    and s.module_key <> 'workforce' and public.module_provisioning_enabled(s.module_key);
  return null;
end $$;

drop trigger if exists organization_members_sync on public.organization_members;
create trigger organization_members_sync after update of status on public.organization_members
  for each row execute function public.enqueue_org_member_sync();

-- A disabled organization loses every module at once.
create or replace function public.enqueue_org_status_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return null; end if;
  insert into public.integration_events (direction, module_key, event_type, organization_id, payload)
  select 'outbound', e.module_key, 'organization.status_changed', new.id, jsonb_build_object('status', new.status)
  from public.entitlements e
  where e.organization_id = new.id and e.module_key <> 'workforce' and public.module_provisioning_enabled(e.module_key);
  return null;
end $$;

drop trigger if exists organizations_sync on public.organizations;
create trigger organizations_sync after update of status on public.organizations
  for each row execute function public.enqueue_org_status_sync();

-- What an organization currently holds for a module (for the sync worker).
create or replace function public.org_module_access(p_org uuid, p_module public.module_key)
returns table (live boolean, plan_code text, plan_ref text, seats int)
language sql stable security definer set search_path = public as $$
  select coalesce(o.status = 'active' and e.id is not null and public.entitlement_is_live(e.status, e.source, e.valid_until), false),
         pl.code, public.plan_ref_for(pl.external_ref, p_module), pl.seats
  from public.organizations o
  left join public.entitlements e on e.organization_id = o.id and e.module_key = p_module
  left join public.plans pl on pl.id = e.plan_id
  where o.id = p_org
$$;

-- ─────────────────────────────────────────────── app-asserted links
-- Same as before, plus: any member may CONFIRM the workspace their organization is
-- already linked to (WSSO reports it on every team sign-in). Only an owner/admin
-- may create the organization link, and an existing link is never re-pointed.

create or replace function public.integration_link_identity(
  p_client_id text, p_omniforce_id text, p_external_user_id text, p_external_org_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_client public.oauth_clients;
  v_user   uuid;
  v_code   public.oauth_authorization_codes;
  v_role   public.org_role;
  v_link   public.identity_links;
  v_olink  public.organization_links;
begin
  select * into v_client from public.oauth_clients where client_id = p_client_id;
  select id into v_user from public.profiles where omniforce_id = p_omniforce_id and status = 'active';
  if v_user is null then return jsonb_build_object('error', 'unknown_user'); end if;

  select * into v_code from public.oauth_authorization_codes
   where client_id = p_client_id and user_id = v_user and consumed_at > now() - interval '15 minutes'
   order by consumed_at desc limit 1;
  if v_code.code_hash is null then return jsonb_build_object('error', 'no_recent_sign_in'); end if;

  if p_external_org_id is not null and v_code.organization_id is null then
    return jsonb_build_object('error', 'organization_context_required');
  end if;

  begin
    -- the workspace is stored on the identity link only once the organization link agrees (below)
    v_link := public.record_identity_link(v_user, v_client.module_key, p_external_user_id, 'app_assertion', null, null, null);
  exception when unique_violation then
    return jsonb_build_object('error', sqlerrm);
  end;

  if p_external_org_id is not null then
    select * into v_olink from public.organization_links
     where organization_id = v_code.organization_id and module_key = v_client.module_key;
    if v_olink.status = 'linked' and v_olink.external_org_id = p_external_org_id then
      update public.identity_links set external_account_id = p_external_org_id where id = v_link.id;
      return jsonb_build_object('ok', true, 'identity_link', v_link.status, 'organization_link', v_olink.status);
    end if;

    select role into v_role from public.organization_members
     where organization_id = v_code.organization_id and user_id = v_user and status = 'active';
    if v_role is null or v_role not in ('owner', 'admin') then
      return jsonb_build_object('error', 'organization_link_requires_admin', 'identity_link', v_link.status);
    end if;
    begin
      v_olink := public.record_organization_link(v_code.organization_id, v_client.module_key, p_external_org_id, 'app_assertion', v_user);
    exception when unique_violation then
      return jsonb_build_object('error', sqlerrm, 'identity_link', v_link.status);
    end;
    update public.identity_links set external_account_id = p_external_org_id where id = v_link.id;
  end if;
  return jsonb_build_object('ok', true, 'identity_link', v_link.status, 'organization_link', v_olink.status);
end $$;

revoke all on function public.integration_link_identity(text, text, text, text) from public, anon, authenticated;
grant execute on function public.integration_link_identity(text, text, text, text) to service_role;

revoke all on function public.org_module_access(uuid, public.module_key) from public, anon, authenticated;
grant execute on function public.org_module_access(uuid, public.module_key) to service_role;
revoke all on function public.enqueue_org_seat_sync() from public, anon, authenticated;
revoke all on function public.enqueue_org_member_sync() from public, anon, authenticated;
revoke all on function public.enqueue_org_status_sync() from public, anon, authenticated;

update public.modules
   set integration_notes = 'Separate Supabase project. WSSO signs people in through OmniForce (OIDC client, /auth/omniforce/*), creates their workspace on first sign-in, and receives signed access events at /api/omniforce/events. Workspaces created this way are billed by OmniForce.'
 where key = 'wsso';
