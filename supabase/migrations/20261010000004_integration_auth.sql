-- OmniForce hub — authentication interface for module applications.
--
-- OmniForce acts as an OpenID Connect-shaped identity provider for registered
-- applications (OAuth 2.0 authorization code + mandatory PKCE S256, confidential
-- clients). Launching a module from the hub uses OIDC "third-party initiated
-- login": the hub sends the browser to the app's initiate_login_uri and the APP
-- starts a normal authorization request with its own state + PKCE. OmniForce
-- never pushes a bearer credential into an app the app did not ask for.
--
-- Nothing here is enabled for any module: clients start 'disabled' and
-- modules.sso_status starts 'not_configured'. A module is switched on only after
-- its team has built and tested its side of the contract (docs/INTEGRATION_AUTH.md).
--
-- Raw secrets and codes are never stored: only sha256 hashes.

create or replace function public.is_valid_redirect_uri(p text)
returns boolean language sql immutable as $$
  select p is not null and length(p) <= 2000 and position('#' in p) = 0 and (
         p ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?(/[^[:space:]]*)?$'
      or p ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?(/[^[:space:]]*)?$')
$$;

create or replace function public.all_valid_redirect_uris(p text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(public.is_valid_redirect_uri(u)), true) from unnest(p) as u
$$;

create table public.oauth_clients (
  client_id                  text primary key default ('ofc_' || replace(gen_random_uuid()::text, '-', '')),
  module_key                 public.module_key not null references public.modules (key),
  name                       text not null,
  environment                text not null default 'production' check (environment in ('production', 'staging', 'development')),
  status                     text not null default 'disabled' check (status in ('disabled', 'testing', 'enabled')),
  secret_hash                text,
  secret_hint                text,
  previous_secret_hash       text,
  previous_secret_expires_at timestamptz,
  redirect_uris              text[] not null default '{}' check (public.all_valid_redirect_uris(redirect_uris)),
  initiate_login_uri         text check (initiate_login_uri is null or public.is_valid_redirect_uri(initiate_login_uri)),
  allowed_scopes             text[] not null default '{openid,profile,email,organizations,entitlements}',
  created_by                 uuid references public.profiles (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (status = 'disabled' or (secret_hash is not null and cardinality(redirect_uris) > 0))
);
create trigger oauth_clients_touch before update on public.oauth_clients for each row execute function public.touch_updated_at();

create table public.oauth_authorization_codes (
  code_hash             text primary key,
  client_id             text not null references public.oauth_clients (client_id) on delete cascade,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  organization_id       uuid references public.organizations (id) on delete cascade,
  redirect_uri          text not null,
  scope                 text[] not null,
  nonce                 text,
  code_challenge        text not null,
  code_challenge_method text not null default 'S256' check (code_challenge_method = 'S256'),
  auth_time             timestamptz,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null,
  consumed_at           timestamptz
);
create index oauth_codes_recent_idx on public.oauth_authorization_codes (client_id, user_id, consumed_at desc);

-- Replay guard for HMAC-signed inbound webhooks.
create table public.webhook_replay_guard (
  source     text not null,
  signature  text not null,
  expires_at timestamptz not null,
  primary key (source, signature)
);

-- ─────────────────────────────────────────────── helpers

create or replace function public.pkce_s256(p_verifier text)
returns text language sql immutable strict as $$
  select rtrim(translate(encode(sha256(convert_to(p_verifier, 'UTF8')), 'base64'), '+/', '-_'), '=')
$$;

-- Client is usable by this user right now? ('testing' = platform admins only)
create or replace function public.client_usable_by(p_client public.oauth_clients, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_client.status = 'enabled'
      or (p_client.status = 'testing' and exists (select 1 from public.platform_admins where user_id = p_user))
$$;

create or replace function public.module_sso_usable_by(p_module public.module_key, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.modules m where m.key = p_module and m.is_active and (
           m.sso_status = 'enabled'
        or (m.sso_status = 'testing' and exists (select 1 from public.platform_admins where user_id = p_user))))
$$;

create or replace function public.oauth_client_authenticate(p_client_id text, p_secret_hash text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.oauth_clients c
    where c.client_id = p_client_id and c.status <> 'disabled' and p_secret_hash is not null
      and (c.secret_hash = p_secret_hash
           or (c.previous_secret_hash = p_secret_hash and c.previous_secret_expires_at > now())))
$$;

-- Identity claims for an id_token / userinfo response. NULL when the user may no
-- longer sign in to this client (disabled account, access removed, client off).
create or replace function public.oauth_claims(p_user uuid, p_client_id text, p_org uuid, p_scope text[])
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_client public.oauth_clients;
  v_p      public.profiles;
  v_conf   timestamptz;
  v_acc    record;
  v_claims jsonb;
begin
  select * into v_client from public.oauth_clients where client_id = p_client_id;
  select * into v_p from public.profiles where id = p_user;
  if v_client.client_id is null or v_p.id is null or v_p.status <> 'active' then return null; end if;
  if not public.client_usable_by(v_client, p_user) or not public.module_sso_usable_by(v_client.module_key, p_user) then return null; end if;

  select * into v_acc from public.module_access_for(p_user) a
   where a.module_key = v_client.module_key
     and (p_org is null and a.via = 'individual' or a.organization_id = p_org)
   limit 1;
  if not found then return null; end if;

  select email_confirmed_at into v_conf from auth.users where id = p_user;
  v_claims := jsonb_build_object('sub', v_p.omniforce_id);

  if 'profile' = any (p_scope) then
    v_claims := v_claims || jsonb_build_object(
      'name', btrim(v_p.first_name || ' ' || v_p.last_name), 'given_name', v_p.first_name, 'family_name', v_p.last_name,
      'updated_at', floor(extract(epoch from v_p.updated_at))::bigint);
  end if;
  if 'email' = any (p_scope) then
    v_claims := v_claims || jsonb_build_object('email', v_p.email, 'email_verified', v_conf is not null);
  end if;
  if 'organizations' = any (p_scope) and p_org is not null then
    v_claims := v_claims || jsonb_build_object('org', (
      select jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'role', v_acc.org_role,
                                'external_id', (select l.external_org_id from public.organization_links l
                                                where l.organization_id = o.id and l.module_key = v_client.module_key and l.status = 'linked'))
      from public.organizations o where o.id = p_org));
  end if;
  if 'entitlements' = any (p_scope) then
    v_claims := v_claims || jsonb_build_object('omniforce_access', jsonb_build_object(
      'module', v_client.module_key, 'via', v_acc.via, 'status', v_acc.status, 'plan', v_acc.plan_code,
      'plan_ref', v_acc.plan_ref, 'seats', v_acc.seats,
      'valid_until', case when v_acc.valid_until is null then null else floor(extract(epoch from v_acc.valid_until))::bigint end));
  end if;
  v_claims := v_claims || jsonb_build_object('module_user_id', (
    select l.external_id from public.identity_links l
    where l.user_id = p_user and l.module_key = v_client.module_key and l.status = 'linked'));
  return v_claims;
end $$;

-- ─────────────────────────────────────────────── authorization endpoint
-- Called by the oauth-authorize edge function for the signed-in user.
-- Returns {ok:true} or {error, error_description, redirectable, organizations?}.
-- redirectable=false means the client/redirect_uri can't be trusted: show the
-- error in OmniForce and never redirect.
create or replace function public.oauth_issue_code(
  p_user uuid, p_client_id text, p_redirect_uri text, p_scope text[], p_nonce text,
  p_code_challenge text, p_code_challenge_method text, p_organization_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_client public.oauth_clients;
  v_p      public.profiles;
  v_orgs   jsonb;
  v_auth   timestamptz;
begin
  select * into v_client from public.oauth_clients where client_id = p_client_id;
  if v_client.client_id is null or v_client.status = 'disabled' then
    return jsonb_build_object('error', 'invalid_client', 'error_description', 'Unknown or disabled application.', 'redirectable', false);
  end if;
  if p_redirect_uri is null or not (p_redirect_uri = any (v_client.redirect_uris)) then
    return jsonb_build_object('error', 'invalid_request', 'error_description', 'redirect_uri is not registered for this application.', 'redirectable', false);
  end if;
  -- from here on errors may be returned to the (registered) redirect_uri
  if not public.client_usable_by(v_client, p_user) or not public.module_sso_usable_by(v_client.module_key, p_user) then
    return jsonb_build_object('error', 'access_denied', 'error_description', 'Sign-in with OmniForce is not available for this application yet.', 'redirectable', true);
  end if;
  if p_scope is null or not ('openid' = any (p_scope)) or not (p_scope <@ v_client.allowed_scopes) then
    return jsonb_build_object('error', 'invalid_scope', 'error_description', 'Scope must include openid and only allowed scopes.', 'redirectable', true);
  end if;
  if coalesce(p_code_challenge_method, '') <> 'S256' or coalesce(p_code_challenge, '') !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('error', 'invalid_request', 'error_description', 'PKCE with S256 is required.', 'redirectable', true);
  end if;
  if p_nonce is not null and length(p_nonce) > 255 then
    return jsonb_build_object('error', 'invalid_request', 'error_description', 'nonce is too long.', 'redirectable', true);
  end if;

  select * into v_p from public.profiles where id = p_user;
  if v_p.id is null or v_p.status <> 'active' then
    return jsonb_build_object('error', 'access_denied', 'error_description', 'This OmniForce account is disabled.', 'redirectable', true);
  end if;
  if not public.email_is_confirmed(p_user) then
    return jsonb_build_object('error', 'access_denied', 'error_description', 'Verify your email address first.', 'redirectable', false);
  end if;

  if not public.user_can_access_module(p_user, v_client.module_key, p_organization_id) then
    -- no individual access but seats in organizations → let the user pick one
    select jsonb_agg(jsonb_build_object('id', a.organization_id, 'name', a.organization_name) order by a.organization_name)
      into v_orgs from public.module_access_for(p_user) a
     where a.module_key = v_client.module_key and a.via = 'organization';
    if p_organization_id is null and v_orgs is not null then
      return jsonb_build_object('error', 'organization_required', 'organizations', v_orgs, 'redirectable', false);
    end if;
    return jsonb_build_object('error', 'access_denied', 'error_description', 'Your OmniForce plan does not include this module.', 'redirectable', true);
  end if;

  select last_sign_in_at into v_auth from auth.users where id = p_user;
  insert into public.oauth_authorization_codes (code_hash, client_id, user_id, organization_id, redirect_uri, scope, nonce,
                                                code_challenge, code_challenge_method, auth_time, expires_at)
  values (p_code_hash, p_client_id, p_user, p_organization_id, p_redirect_uri, p_scope, p_nonce,
          p_code_challenge, 'S256', v_auth, now() + interval '60 seconds');
  delete from public.oauth_authorization_codes where expires_at < now() - interval '1 day';
  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────── token endpoint
-- Single use: the code is marked consumed BEFORE any check, so a failed or
-- replayed exchange burns it. Returns {error} instead of raising so the
-- consumption is committed.
create or replace function public.oauth_consume_code(p_code_hash text, p_client_id text, p_redirect_uri text, p_code_verifier text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r        public.oauth_authorization_codes;
  v_claims jsonb;
begin
  update public.oauth_authorization_codes set consumed_at = now()
   where code_hash = p_code_hash and consumed_at is null
  returning * into r;
  if r.code_hash is null then
    if exists (select 1 from public.oauth_authorization_codes where code_hash = p_code_hash) then
      perform public.write_audit(null, 'oauth.code_replay', 'oauth_client', p_client_id, '{}');
    end if;
    return jsonb_build_object('error', 'invalid_grant', 'error_description', 'Code is invalid, expired or already used.');
  end if;
  if r.expires_at < now() or r.client_id <> p_client_id or r.redirect_uri <> coalesce(p_redirect_uri, '') then
    return jsonb_build_object('error', 'invalid_grant', 'error_description', 'Code is invalid, expired or already used.');
  end if;
  if coalesce(p_code_verifier, '') !~ '^[A-Za-z0-9._~-]{43,128}$' or public.pkce_s256(p_code_verifier) <> r.code_challenge then
    return jsonb_build_object('error', 'invalid_grant', 'error_description', 'PKCE verification failed.');
  end if;

  -- access is checked again at exchange time
  v_claims := public.oauth_claims(r.user_id, r.client_id, r.organization_id, r.scope);
  if v_claims is null then
    return jsonb_build_object('error', 'invalid_grant', 'error_description', 'Access is no longer available.');
  end if;
  perform public.write_audit(r.user_id, 'oauth.sign_in', 'oauth_client', r.client_id,
    jsonb_build_object('organization_id', r.organization_id));
  return jsonb_build_object('ok', true, 'user_id', r.user_id, 'organization_id', r.organization_id, 'scope', r.scope,
    'nonce', r.nonce, 'auth_time', case when r.auth_time is null then null else floor(extract(epoch from r.auth_time))::bigint end,
    'claims', v_claims);
end $$;

-- ─────────────────────────────────────────────── hub launch (third-party initiated login)
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
  select * into v_client from public.oauth_clients c
   where c.module_key = p_module and c.initiate_login_uri is not null and public.client_usable_by(c, p_user)
   order by (c.status = 'enabled') desc, (c.environment = 'production') desc, c.created_at
   limit 1;
  if v_client.client_id is null then
    return jsonb_build_object('error', 'sso_unavailable', 'app_url', v_mod.app_url, 'module_name', v_mod.name);
  end if;
  return jsonb_build_object('initiate_login_uri', v_client.initiate_login_uri, 'client_id', v_client.client_id);
end $$;

-- ─────────────────────────────────────────────── server-to-server (application → OmniForce)

-- Entitlement check for an app's back end. Context = individual, or the
-- OmniForce organization linked to the app's own organization id.
create or replace function public.integration_access(p_client_id text, p_omniforce_id text, p_external_org_id text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_client public.oauth_clients;
  v_user   uuid;
  v_org    uuid;
  v_acc    record;
begin
  select * into v_client from public.oauth_clients where client_id = p_client_id;
  select id into v_user from public.profiles where omniforce_id = p_omniforce_id;
  if v_user is null then return jsonb_build_object('sub', p_omniforce_id, 'active', false, 'reason', 'unknown_user'); end if;
  if p_external_org_id is not null then
    select organization_id into v_org from public.organization_links
     where module_key = v_client.module_key and external_org_id = p_external_org_id and status = 'linked';
    if v_org is null then return jsonb_build_object('sub', p_omniforce_id, 'active', false, 'reason', 'organization_not_linked'); end if;
  end if;
  select * into v_acc from public.module_access_for(v_user) a
   where a.module_key = v_client.module_key and (v_org is null and a.via = 'individual' or a.organization_id = v_org)
   limit 1;
  if not found then return jsonb_build_object('sub', p_omniforce_id, 'active', false, 'reason', 'no_access'); end if;
  return jsonb_build_object('sub', p_omniforce_id, 'active', true, 'module', v_client.module_key, 'via', v_acc.via,
    'organization_id', v_org, 'status', v_acc.status, 'plan', v_acc.plan_code, 'plan_ref', v_acc.plan_ref, 'seats', v_acc.seats,
    'valid_until', v_acc.valid_until,
    'seats_assigned', case when v_org is null then null else
      (select count(*) from public.organization_module_seats s where s.organization_id = v_org and s.module_key = v_client.module_key) end);
end $$;

-- The app tells OmniForce which of ITS accounts the user who just signed in
-- through OmniForce was bound to. Accepted only if that user completed an
-- OmniForce sign-in to this client in the last 15 minutes. Binding an
-- organization additionally requires the user to be owner/admin of the
-- OmniForce organization they signed in with.
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

  begin
    v_link := public.record_identity_link(v_user, v_client.module_key, p_external_user_id, 'app_assertion', p_external_org_id, null, null);
  exception when unique_violation then
    return jsonb_build_object('error', sqlerrm);
  end;

  if p_external_org_id is not null then
    if v_code.organization_id is null then return jsonb_build_object('error', 'organization_context_required', 'identity_link', v_link.status); end if;
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
  end if;
  return jsonb_build_object('ok', true, 'identity_link', v_link.status, 'organization_link', v_olink.status);
end $$;

create or replace function public.webhook_seen(p_source text, p_signature text, p_ttl_seconds int default 600)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.webhook_replay_guard where expires_at < now();
  insert into public.webhook_replay_guard (source, signature, expires_at)
  values (p_source, p_signature, now() + make_interval(secs => p_ttl_seconds));
  return false;
exception when unique_violation then
  return true;
end $$;

-- ─────────────────────────────────────────────── platform admin management

create or replace function public.admin_create_oauth_client(
  p_module public.module_key, p_name text, p_environment text, p_redirect_uris text[], p_initiate_login_uri text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_secret text := 'ofs_' || public.new_secret_token();
  v_c      public.oauth_clients;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.oauth_clients (module_key, name, environment, redirect_uris, initiate_login_uri,
                                    secret_hash, secret_hint, created_by)
  values (p_module, btrim(p_name), coalesce(p_environment, 'production'), coalesce(p_redirect_uris, '{}'),
          nullif(btrim(coalesce(p_initiate_login_uri, '')), ''), public.sha256_hex(v_secret), right(v_secret, 4), auth.uid())
  returning * into v_c;
  perform public.write_audit(auth.uid(), 'oauth_client.create', 'oauth_client', v_c.client_id,
    jsonb_build_object('module', p_module, 'environment', v_c.environment));
  return jsonb_build_object('client_id', v_c.client_id, 'client_secret', v_secret);
end $$;

create or replace function public.admin_update_oauth_client(
  p_client_id text, p_name text, p_redirect_uris text[], p_initiate_login_uri text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.oauth_clients set
    name = coalesce(nullif(btrim(p_name), ''), name),
    redirect_uris = coalesce(p_redirect_uris, redirect_uris),
    initiate_login_uri = nullif(btrim(coalesce(p_initiate_login_uri, '')), ''),
    status = coalesce(p_status, status)
  where client_id = p_client_id;
  if not found then raise exception 'client_not_found' using errcode = 'P0002'; end if;
  perform public.write_audit(auth.uid(), 'oauth_client.update', 'oauth_client', p_client_id,
    jsonb_build_object('status', p_status, 'redirect_uris', p_redirect_uris, 'initiate_login_uri', p_initiate_login_uri));
end $$;

-- The previous secret keeps working for 24 hours so the app can roll over.
create or replace function public.admin_rotate_oauth_client_secret(p_client_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_secret text := 'ofs_' || public.new_secret_token();
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.oauth_clients set
    previous_secret_hash = secret_hash, previous_secret_expires_at = now() + interval '24 hours',
    secret_hash = public.sha256_hex(v_secret), secret_hint = right(v_secret, 4)
  where client_id = p_client_id;
  if not found then raise exception 'client_not_found' using errcode = 'P0002'; end if;
  perform public.write_audit(auth.uid(), 'oauth_client.rotate_secret', 'oauth_client', p_client_id, '{}');
  return jsonb_build_object('client_id', p_client_id, 'client_secret', v_secret);
end $$;

-- Switching a module's SSO or provisioning on is a deliberate, audited act.
create or replace function public.admin_set_module_integration(p_module public.module_key, p_sso_status text, p_provisioning_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_sso_status = 'enabled' and not exists (select 1 from public.oauth_clients where module_key = p_module and status = 'enabled') then
    raise exception 'enable_a_client_first' using errcode = '22023';
  end if;
  update public.modules set sso_status = coalesce(p_sso_status, sso_status),
                            provisioning_status = coalesce(p_provisioning_status, provisioning_status)
   where key = p_module;
  perform public.write_audit(auth.uid(), 'module.integration', 'module', p_module::text,
    jsonb_build_object('sso_status', p_sso_status, 'provisioning_status', p_provisioning_status));
end $$;

-- ─────────────────────────────────────────────── RLS + grants
alter table public.oauth_clients             enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.webhook_replay_guard      enable row level security;

create policy "admins read clients" on public.oauth_clients for select using (public.is_platform_admin());
revoke all on public.oauth_clients from anon, authenticated;
grant select (client_id, module_key, name, environment, status, secret_hint, previous_secret_expires_at,
              redirect_uris, initiate_login_uri, allowed_scopes, created_at, updated_at)
  on public.oauth_clients to authenticated;
revoke all on public.oauth_authorization_codes from anon, authenticated;
revoke all on public.webhook_replay_guard from anon, authenticated;

-- modules: admins change integration state only through admin_set_module_integration
drop policy "admins manage modules" on public.modules;
create policy "admins update modules" on public.modules for update using (public.is_platform_admin()) with check (public.is_platform_admin());
revoke insert, update, delete on public.modules from anon, authenticated;
grant update (name, app_url, is_active, sort, integration_notes) on public.modules to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.client_usable_by(public.oauth_clients, uuid)',
    'public.module_sso_usable_by(public.module_key, uuid)',
    'public.oauth_client_authenticate(text, text)',
    'public.oauth_claims(uuid, text, uuid, text[])',
    'public.oauth_issue_code(uuid, text, text, text[], text, text, text, uuid, text)',
    'public.oauth_consume_code(text, text, text, text)',
    'public.sso_launch_target(uuid, public.module_key)',
    'public.integration_access(text, text, text)',
    'public.integration_link_identity(text, text, text, text)',
    'public.webhook_seen(text, text, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

grant execute on function public.admin_create_oauth_client(public.module_key, text, text, text[], text) to authenticated;
grant execute on function public.admin_update_oauth_client(text, text, text[], text, text) to authenticated;
grant execute on function public.admin_rotate_oauth_client_secret(text) to authenticated;
grant execute on function public.admin_set_module_integration(public.module_key, text, text) to authenticated;
