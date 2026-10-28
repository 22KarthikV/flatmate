-- Baseline migration: helpers shared by every module.
--
-- Tables, enums and policies arrive with the module that owns them (household owns roles,
-- ledger owns split modes, and so on), so nothing speculative lives here.
-- Extensions are enabled by the migration that first needs them (pg_cron + pg_net in the
-- scheduler task, pgmq in notifications). pgTAP is provided by `supabase test db`.

-- Keeps `updated_at` honest. Attach to any table with an `updated_at timestamptz` column:
--   create trigger set_updated_at before update on <table>
--     for each row execute function public.set_updated_at();
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: stamps updated_at with the transaction time on every update.';
