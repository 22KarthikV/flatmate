-- Rota: generation and reminders (SPEC-rota T10, T11, T18).
--
-- The scheduler is TypeScript, so it runs in the rota-generate Edge Function. This migration gives
-- that function what it needs and nothing more: which flats are due, the inputs for one flat's week,
-- and a way to store the result. The same inputs feed "Generate now" for an admin. Reminders for
-- chores due today and overdue are plain database work. Jobs only touch flats that use the rota
-- (at least one active chore), and each runs at its own minute.

insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('chore_due', true, true, false),
  ('chore_overdue', true, true, false);

update public.notification_types set push_title = 'You have a chore today',
  push_body = 'A chore is due today. Open FlatMate to see it.'
 where type = 'chore_due';
update public.notification_types set push_title = 'A chore is overdue',
  push_body = 'A chore of yours is overdue. Open FlatMate to see it.'
 where type = 'chore_overdue';

-- ---------------------------------------------------------------------------------------------
-- Which flats need their next week generated: those that use the rota, whose availability window
-- for the upcoming week has closed, with no current revision of it. Anyone who did not answer is
-- filled in as around first, so the inputs are complete. service_role only.
create or replace function public.rota_due_generations(p_now timestamptz)
returns table (household_id uuid, week_start date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := private.rota_upcoming_week(p_now);
  r record;
begin
  if p_now < private.rota_window_closes(v_week) then
    return;
  end if;
  for r in
    select h.id from public.households h
     where h.closed_at is null
       and exists (select 1 from public.chores c where c.household_id = h.id and c.archived_at is null)
       and exists (select 1 from public.memberships m where m.household_id = h.id and m.left_at is null)
       and not exists (
         select 1 from public.rota_weeks w
          where w.household_id = h.id and w.week_start = v_week and w.superseded_at is null
       )
     order by h.id
  loop
    perform private.rota_assume_available_for(r.id, v_week);
    household_id := r.id;
    week_start := v_week;
    return next;
  end loop;
end;
$$;

-- Everything the scheduler reads for one flat and week, as one json document:
--   members, chores, availability {person: {date: bool}}, lastDone {person: {chore: date}},
--   owed {person: {chore: n}}, and history (the previous weeks, for carried load).
create or replace function private.rota_generation_input(p_household uuid, p_week date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(m.profile_id order by m.profile_id)
        from public.memberships m where m.household_id = p_household and m.left_at is null
    ), '[]'::jsonb),
    'chores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'cadence', c.cadence, 'preferredDow', c.preferred_dow,
               'everyNDays', c.every_n_days, 'effort', c.effort) order by c.id)
        from public.chores c where c.household_id = p_household and c.archived_at is null
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_object_agg(person, days)
        from (
          select a.profile_id as person, jsonb_object_agg(a.on_date, a.available) as days
            from public.availability a
           where a.household_id = p_household and a.on_date between p_week and p_week + 6
           group by a.profile_id
        ) x
    ), '{}'::jsonb),
    'lastDone', coalesce((
      select jsonb_object_agg(person, chores)
        from (
          select s.profile_id as person, jsonb_object_agg(s.chore_id, s.last_done_on) as chores
            from public.rotation_state s
           where s.household_id = p_household and s.last_done_on is not null
           group by s.profile_id
        ) x
    ), '{}'::jsonb),
    'owed', coalesce((
      select jsonb_object_agg(person, chores)
        from (
          select s.profile_id as person, jsonb_object_agg(s.chore_id, s.owed_turns) as chores
            from public.rotation_state s
           where s.household_id = p_household and s.owed_turns > 0
           group by s.profile_id
        ) x
    ), '{}'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'members', to_jsonb(w.member_ids),
               'assignments', coalesce((
                 select jsonb_agg(jsonb_build_object('assignee', a.assignee, 'effort', a.effort))
                   from public.chore_assignments a
                  where a.rota_week_id = w.id and a.superseded_at is null
               ), '[]'::jsonb)) order by w.week_start)
        from public.rota_weeks w
       where w.household_id = p_household and w.superseded_at is null
         and w.week_start < p_week and w.week_start >= p_week - 26 * 7
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.rota_generation_input(uuid, date) from public, anon, authenticated;

create or replace function public.rota_generation_input_for(p_household uuid, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_week_start is null or extract(dow from p_week_start) <> 0 then
    raise exception 'invalid_week' using errcode = '22023';
  end if;
  return private.rota_generation_input(p_household, p_week_start);
end;
$$;

-- An owner or admin reads their own flat's inputs, for "Generate now".
create or replace function public.rota_generation_input(p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.rota_admin_household();
begin
  if p_week_start is null or extract(dow from p_week_start) <> 0 then
    raise exception 'invalid_week' using errcode = '22023';
  end if;
  return private.rota_generation_input(v_household, p_week_start);
end;
$$;

-- The Edge Function stores what the scheduler returned: the weekly job's work, with nobody's name on it.
create or replace function public.store_rota_week_for(
  p_household uuid,
  p_week_start date,
  p_assignments jsonb,
  p_owed jsonb default '[]'::jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.rota_store_week(now(), p_household, p_week_start, 'weekly', null, p_assignments, p_owed);
$$;

revoke all on function public.rota_due_generations(timestamptz) from public, anon, authenticated;
revoke all on function public.rota_generation_input_for(uuid, date) from public, anon, authenticated;
revoke all on function public.store_rota_week_for(uuid, date, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.rota_generation_input(date) from public, anon;
grant execute on function public.rota_due_generations(timestamptz) to service_role;
grant execute on function public.rota_generation_input_for(uuid, date) to service_role;
grant execute on function public.store_rota_week_for(uuid, date, jsonb, jsonb) to service_role;
grant execute on function public.rota_generation_input(date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Reminders: at or after 08:00 London on the day a chore is due, and again once it is overdue (the
-- morning after). Current assignments of current members only; finished chores are never chased.
-- Once per assignment per kind, whatever the schedule does.
create or replace function private.rota_send_reminders(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Europe/London';
  v_today date := v_local::date;
  r record;
begin
  -- Nothing goes out before the morning round.
  if v_local::time < time '08:00' then
    return;
  end if;

  for r in
    select a.id, a.household_id, a.assignee, a.chore_name, a.due_on
      from public.chore_assignments a
      join public.rota_weeks w on w.id = a.rota_week_id and w.superseded_at is null
      join public.memberships m
        on m.household_id = a.household_id and m.profile_id = a.assignee and m.left_at is null
     where a.assignee is not null and a.superseded_at is null and a.completed_at is null
       and a.due_on between v_today - 6 and v_today
  loop
    if r.due_on = v_today then
      perform private.notify(
        r.assignee, r.household_id, 'chore_due',
        r.chore_name || ' is due today',
        'Open the Rota to tick it off as you go.',
        '/rota/assignments/' || r.id, 'chore_due:' || r.id
      );
    else
      perform private.notify(
        r.assignee, r.household_id, 'chore_overdue',
        r.chore_name || ' is overdue',
        'It was due on ' || to_char(r.due_on, 'FMDay') || '. It stays with you until it is done.',
        '/rota/assignments/' || r.id, 'chore_overdue:' || r.id
      );
    end if;
  end loop;
end;
$$;

revoke all on function private.rota_send_reminders(timestamptz) from public, anon, authenticated;

create or replace function private.run_rota_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('rota-reminders', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.rota_send_reminders(now());
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.run_rota_reminders() from public, anon, authenticated;

-- Minute 37 (availability runs at :17, generation at :07).
select cron.schedule('rota-reminders', '37 * * * *', 'select private.run_rota_reminders()');

-- Generation: the rota-generate Edge Function, hourly at :07. It does nothing when no flat is due.
select private.register_edge_job('rota-generate', '7 * * * *', 'rota-generate');
