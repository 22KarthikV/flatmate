-- Extras D: the fix-it log, part 3: the weekly nudge and retention (SPEC-extras D).
-- Independent of every other extras tool.
--
-- Daily at 09:32 UTC. A report that is not fixed or hidden and has had no activity for 7 days nudges
-- the person chasing it, or, with no chaser, every admin. The dedupe key carries the week number
-- since the report was made, so each report is nudged at most once a week and keeps being nudged
-- until someone adds a note or changes the status. The same job purges old rows.

create or replace function private.fix_remind(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  r record;
  v_week integer;
  v_sent integer := 0;
begin
  for f in
    select x.id, x.household_id, x.title, x.chaser_id, x.created_at
      from public.fix_reports x
      join public.households h on h.id = x.household_id and h.closed_at is null
     where x.hidden_at is null and x.status <> 'fixed'
       and x.last_activity_at <= p_now - interval '7 days'
  loop
    v_week := floor(extract(epoch from (p_now - f.created_at)) / 604800);
    for r in
      select m.profile_id from public.memberships m
       where m.household_id = f.household_id and m.left_at is null
         and (
           (f.chaser_id is not null and m.profile_id = f.chaser_id)
           or (
             m.role in ('owner', 'admin')
             and not exists (select 1 from public.memberships c
                              where c.household_id = f.household_id and c.profile_id = f.chaser_id
                                and c.left_at is null)
           )
         )
    loop
      perform private.notify(
        r.profile_id, f.household_id, 'fix_stale',
        left('Still waiting: ' || f.title, 80), '',
        '/more/fixes/' || f.id, 'fix_stale:' || f.id || ':' || v_week
      );
      v_sent := v_sent + 1;
    end loop;
  end loop;
  return v_sent;
end;
$$;

-- Hard-deletes hidden reports 30 days after hiding and fixed reports 2 years after fixing, with
-- their timelines.
create or replace function private.fix_purge(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform set_config('flatmate.fix_purge', 'on', true);
  delete from public.fix_updates u using public.fix_reports r
   where u.report_id = r.id
     and (r.hidden_at < p_now - interval '30 days' or r.fixed_at < p_now - interval '2 years');
  delete from public.fix_reports r
   where r.hidden_at < p_now - interval '30 days' or r.fixed_at < p_now - interval '2 years';
  get diagnostics v_count = row_count;
  perform set_config('flatmate.fix_purge', 'off', true);
  return v_count;
end;
$$;

create or replace function private.run_fix_stale(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('fix-stale', to_char(p_now at time zone 'Europe/London', 'YYYY-MM-DD'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.fix_remind(p_now);
    perform private.fix_purge(p_now);
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.fix_remind(timestamptz) from public, anon, authenticated;
revoke all on function private.fix_purge(timestamptz) from public, anon, authenticated;
revoke all on function private.run_fix_stale(timestamptz) from public, anon, authenticated;

select cron.schedule('fix-stale', '32 9 * * *', 'select private.run_fix_stale()');
