-- Scheduler bookkeeping and the health probe.
--
-- job_runs records every scheduled job execution. The unique (job_name, idempotency_key) pair
-- is what makes jobs safe to retry: a second attempt with the same key inserts nothing.
-- Only the service role (Edge Functions, pg_cron) touches it; the app's roles have no access.

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null check (length(job_name) between 1 and 100),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_runs_job_key_unique unique (job_name, idempotency_key)
);

create trigger set_updated_at before update on public.job_runs
  for each row execute function public.set_updated_at();

alter table public.job_runs enable row level security;
-- No policies on purpose: with RLS on and nothing granted, anon and authenticated see nothing.
-- Belt and braces: also remove the default table privileges Supabase grants to those roles.
revoke all on public.job_runs from anon, authenticated;

comment on table public.job_runs is
  'One row per scheduled job execution. Service role only. Unique (job_name, idempotency_key) makes retries idempotent.';

-- Cheap database round trip for /api/health. Exposes nothing: it returns a constant.
create or replace function public.health_ping()
returns boolean
language sql
stable
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.health_ping() from public;
grant execute on function public.health_ping() to anon, authenticated;

comment on function public.health_ping() is
  'Returns true. Called through the REST API by /api/health to prove the database is reachable.';
