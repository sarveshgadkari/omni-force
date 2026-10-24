-- Run once per environment (SQL editor or psql) AFTER the edge functions are deployed
-- and CRON_SECRET is set as a function secret. Replace both placeholders first.
-- Re-running is safe: the job and secret are replaced.
do $$
declare
  v_ref    text := '<hub-ref>';        -- e.g. abcd1234efgh5678
  v_id     uuid;
  v_secret text := '<CRON_SECRET>';    -- same value as the CRON_SECRET function secret
begin
  if v_ref like '<%' or v_secret like '<%' then
    raise exception 'Replace <hub-ref> and <CRON_SECRET> before running this script';
  end if;

  -- vault.secrets can't be updated directly; use the vault functions
  select id into v_id from vault.secrets where name = 'omniforce_cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'omniforce_cron_secret');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;

  perform cron.unschedule('omniforce-sync-worker')
    where exists (select 1 from cron.job where jobname = 'omniforce-sync-worker');
  perform cron.schedule(
    'omniforce-sync-worker',
    '* * * * *',
    format($job$
      select net.http_post(
        url     := 'https://%s.supabase.co/functions/v1/sync-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'omniforce_cron_secret')),
        body    := '{}'::jsonb)
    $job$, v_ref));
end $$;
