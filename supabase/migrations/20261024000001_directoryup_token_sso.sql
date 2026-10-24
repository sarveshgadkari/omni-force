-- DirectoryUp SSO is a one-time login token, not OIDC. Enabling Directory
-- sign-in does not require an OAuth client. Plan external_ref values are the
-- DirectoryUp subscription_id integers supplied by the DirectoryUp team.

update public.plans set external_ref = '1' where code in ('dir_scout');
update public.plans set external_ref = '6' where code in ('dir_recreational');
update public.plans set external_ref = '3' where code in ('dir_commercial_month', 'dir_commercial_year');
update public.plans set external_ref = '2' where code in ('dir_provider_month', 'dir_provider_year');
update public.plans set external_ref = '5' where code in ('dir_vendor_month', 'dir_vendor_year', 'dir_employer_month', 'dir_employer_year');
update public.plans set external_ref = '2|growth' where code = 'bundle_dir_wsso_month';
update public.plans set external_ref = '2|growth' where code = 'bundle_dir_wsso_year';

update public.modules
   set integration_notes = 'DirectoryUp. Provisioning: form-encoded POST /api/v2/user/create then POST /api/v2/users_meta/create (key=omniforce_user_id). SSO: GET /api/v2/user/get/{id}?include_user_token=1 then redirect to /login/token/{token}. No OAuth client. Starts switched off until an admin enables it.'
 where key = 'directory';

create or replace function public.sso_launch_target(p_user uuid, p_module public.module_key)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_mod    public.modules;
  v_client public.oauth_clients;
begin
  select * into v_mod from public.modules where key = p_module;
  if v_mod.key is null then return jsonb_build_object('error', 'unknown_module'); end if;
  if not exists (select 1 from public.module_access_for(p_user) a where a.module_key = p_module) then
    return jsonb_build_object('error', 'not_entitled', 'app_url', v_mod.app_url);
  end if;
  if not public.module_sso_usable_by(p_module, p_user) then
    return jsonb_build_object('error', 'sso_unavailable', 'app_url', v_mod.app_url, 'module_name', v_mod.name);
  end if;

  -- DirectoryUp: token login. WSSO (and any future OIDC module) still needs a client.
  if p_module = 'directory' then
    return jsonb_build_object('protocol', 'directory_token', 'app_url', v_mod.app_url, 'module_name', v_mod.name);
  end if;

  select * into v_client from public.oauth_clients c
   where c.module_key = p_module and c.initiate_login_uri is not null and public.client_usable_by(c, p_user)
   order by (c.status = 'enabled') desc, (c.environment = 'production') desc, c.created_at
   limit 1;
  if v_client.client_id is null then
    return jsonb_build_object('error', 'sso_unavailable', 'app_url', v_mod.app_url, 'module_name', v_mod.name);
  end if;
  return jsonb_build_object('initiate_login_uri', v_client.initiate_login_uri, 'client_id', v_client.client_id);
end $$;

create or replace function public.admin_set_module_integration(p_module public.module_key, p_sso_status text, p_provisioning_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  -- Directory SSO is a DirectoryUp login token, not an OAuth client.
  if p_sso_status = 'enabled' and p_module <> 'directory'
     and not exists (select 1 from public.oauth_clients where module_key = p_module and status = 'enabled') then
    raise exception 'enable_a_client_first' using errcode = '22023';
  end if;
  update public.modules set sso_status = coalesce(p_sso_status, sso_status),
                            provisioning_status = coalesce(p_provisioning_status, provisioning_status)
   where key = p_module;
  perform public.write_audit(auth.uid(), 'module.integration', 'module', p_module::text,
    jsonb_build_object('sso_status', p_sso_status, 'provisioning_status', p_provisioning_status));
end $$;
