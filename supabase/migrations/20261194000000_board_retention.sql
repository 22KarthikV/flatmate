-- Extras E: noticeboard retention (SPEC-extras E). Independent of the other extras tools.
--
-- Once a day, hard-delete posts that were deleted, or expired, more than 30 days ago.

create or replace function private.purge_board(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.board_posts
   where deleted_at < p_now - interval '30 days'
      or (pinned_at is null and expires_at < p_now - interval '30 days');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.run_board_retention(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('board-retention', to_char(p_now at time zone 'utc', 'YYYY-MM-DD'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.purge_board(p_now);
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.purge_board(timestamptz) from public, anon, authenticated;
revoke all on function private.run_board_retention(timestamptz) from public, anon, authenticated;

select cron.schedule('board-retention', '37 3 * * *', 'select private.run_board_retention()');
