-- Extras B: the bin reminder (SPEC-extras B). Independent of every other extras tool.
--
-- The evening before a collection every active member gets one nudge. "Evening" is decided by the
-- London hour (18 to 22), not a fixed UTC time, so summer time cannot move it; the job runs every
-- hour so a missed run still catches up the same evening, and the dedupe key stops anyone being
-- told twice. The lock screen carries fixed text only.

insert into public.notification_types (type, default_in_app, default_push, snoozable)
values ('bin_reminder', true, true, true);

update public.notification_types
   set push_title = 'Bin night',
       push_body = 'A bin collection is tomorrow. Open FlatMate to see which.'
 where type = 'bin_reminder';

create or replace function private.bins_remind(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Europe/London';
  v_tomorrow date := v_local::date + 1;
  v_sent integer := 0;
  h record;
  m record;
  v_names text;
begin
  if extract(hour from v_local) not between 18 and 22 then
    return 0;
  end if;

  for h in
    select distinct s.household_id
      from public.bin_streams s
      join public.households hh on hh.id = s.household_id and hh.closed_at is null
     where s.archived_at is null
  loop
    select string_agg(c.name, ', ' order by c.name) into v_names
      from private.bin_collections_on(h.household_id, v_tomorrow) c;
    if v_names is null then
      continue;
    end if;

    for m in
      select ms.profile_id
        from public.memberships ms
       where ms.household_id = h.household_id and ms.left_at is null
    loop
      perform private.notify(
        m.profile_id, h.household_id, 'bin_reminder',
        left('Bins out tonight: ' || v_names, 80), '',
        '/more/bins', 'bin:' || h.household_id || ':' || v_tomorrow
      );
      v_sent := v_sent + 1;
    end loop;
  end loop;
  return v_sent;
end;
$$;

create or replace function private.run_bins_reminders(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('bins-reminders', to_char(p_now at time zone 'utc', 'YYYY-MM-DD"T"HH24'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.bins_remind(p_now);
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.bins_remind(timestamptz) from public, anon, authenticated;
revoke all on function private.run_bins_reminders(timestamptz) from public, anon, authenticated;

select cron.schedule('bins-reminders', '27 * * * *', 'select private.run_bins_reminders()');
