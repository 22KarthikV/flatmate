-- Scheduler: pg_cron calls Edge Functions over HTTP (pg_net), authenticated by a shared secret.
--
-- Per-environment configuration lives in Vault, never in migrations, so the same migration works
-- locally and on the hosted project:
--   vault secret 'project_url'      base URL the database uses to reach the API
--                                   (hosted: https://<ref>.supabase.co, local: http://kong:8000)
--   vault secret 'scheduler_secret' random string; sent as the x-scheduler-secret header and
--                                   checked by the function through public.verify_scheduler_secret()
-- Until both exist the invoker does nothing, so a fresh environment never errors on schedule.
--
-- Later modules register jobs with private.register_edge_job(...) in their own migration.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Calls an Edge Function once. Returns the pg_net request id, or null when not configured.
create or replace function private.invoke_edge_function(p_function text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'scheduler_secret';

  if v_url is null or v_secret is null then
    raise warning 'scheduler not configured: vault secrets project_url and scheduler_secret are required';
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-secret', v_secret
    ),
    body := p_body || jsonb_build_object('scheduled_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function private.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- Creates or replaces a recurring job that calls an Edge Function. Same name = update in place.
create or replace function private.register_edge_job(p_job_name text, p_schedule text, p_function text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select cron.schedule(
    p_job_name,
    p_schedule,
    format('select private.invoke_edge_function(%L)', p_function)
  );
$$;

revoke all on function private.register_edge_job(text, text, text) from public, anon, authenticated;

-- Lets an Edge Function check the shared secret without holding it as an environment variable,
-- so Vault stays the single place the secret lives (rotate it there, nothing to redeploy).
create or replace function public.verify_scheduler_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select decrypted_secret = candidate
       from vault.decrypted_secrets
      where name = 'scheduler_secret'
      limit 1),
    false
  ) and coalesce(candidate, '') <> '';
$$;

revoke all on function public.verify_scheduler_secret(text) from public, anon, authenticated;
grant execute on function public.verify_scheduler_secret(text) to service_role;

comment on function public.verify_scheduler_secret(text) is
  'True when candidate equals the scheduler_secret in Vault. service_role only.';

-- Keeps the hosted project active and proves the scheduler end to end.
select private.register_edge_job('heartbeat', '0 * * * *', 'heartbeat');
