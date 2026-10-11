-- Extensions used by the sync-worker schedule. The schedule itself needs the
-- project ref and a secret, so it is not a migration: run
-- supabase/setup/schedule-sync-worker.sql once per environment after deploying.
-- (An earlier version scheduled the job here with literal <hub-ref>/<CRON_SECRET>
-- placeholders, which would have stored a bogus secret on `db push`.)
create extension if not exists pg_cron;
create extension if not exists pg_net;
