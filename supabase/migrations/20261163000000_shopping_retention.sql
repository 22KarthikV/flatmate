-- Extras A: shopping list retention (SPEC-extras A). Independent of the other extras tools.
--
-- Once a day, delete items cleared more than 90 days ago, and bought items never cleared after 90
-- days. An expense does not depend on the items behind it, so they are safe to delete.

create or replace function private.purge_shopping(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.shopping_items
   where cleared_at < p_now - interval '90 days'
      or (cleared_at is null and bought_at < p_now - interval '90 days');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.run_shopping_retention(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('shopping-retention', to_char(p_now at time zone 'utc', 'YYYY-MM-DD'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.purge_shopping(p_now);
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.purge_shopping(timestamptz) from public, anon, authenticated;
revoke all on function private.run_shopping_retention(timestamptz) from public, anon, authenticated;

select cron.schedule('shopping-retention', '22 3 * * *', 'select private.run_shopping_retention()');
