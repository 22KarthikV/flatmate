-- Events: the hourly job and the join/leave trigger (SPEC-events E3).
--
-- One pg_cron job does everything on a schedule, at minute 47 (heartbeat and the daily jobs use 0,
-- rota uses 7, 17, 37 and every ten minutes, retention 17 past 3, push delivery every minute).
-- The work function takes the time as a parameter so tests can move through it. Every step is safe
-- to repeat: state only moves forward and every notification has a dedupe key. A trigger on
-- memberships handles joins and leaves for every path (leave, removal, account deletion) without
-- editing anyone else's functions, and can never make leaving fail.

-- ---------------------------------------------------------------------------------------------
-- Two small changes to E2's internals so the job and the trigger can use them:
--   * cancelling for "nobody said yes" also works on a tied event (members may have left);
--   * a confirmation caused by a membership change is recorded as such (the trigger sets a
--     transaction-local flag; a function argument would change a signature other code calls).
create or replace function private.events_cancel_unwanted(p_event uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
begin
  select * into e from public.events where id = p_event for update;
  if e.status not in ('voting', 'tiebreak') then
    return;
  end if;
  update public.events
     set status = 'cancelled', cancelled_at = p_now, cancelled_by = null,
         cancelled_reason = 'Nobody could make any of the dates'
   where id = p_event;
  perform private.notify_flatmates(
    e.household_id, array[]::uuid[], 'event_cancelled',
    e.title || ' was cancelled', '/events/' || p_event, 'event_cancelled:' || p_event);
end;
$$;

revoke all on function private.events_cancel_unwanted(uuid, timestamptz) from public, anon, authenticated;

create or replace function private.events_evaluate(p_event uuid, p_now timestamptz, p_deadline_passed boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
  v_members integer;
  v_yes integer[];
  v_ids uuid[];
  v_by text;
  d record;
begin
  select * into e from public.events where id = p_event for update;
  if not found then
    return null;
  end if;
  if e.status <> 'voting' then
    return e.status;
  end if;

  select coalesce(array_agg(t.yes order by t.pos), '{}'), coalesce(array_agg(t.option_id order by t.pos), '{}'),
         coalesce(max(t.members), 0)
    into v_yes, v_ids, v_members
    from private.events_tally(p_event) t;

  select * into d from private.events_decide(v_yes, v_members, p_deadline_passed);
  if d.outcome = 'confirm' then
    v_by := case
      when coalesce(current_setting('flatmate.events_cause', true), '') = 'member_change' then 'member_change'
      when p_deadline_passed and not (v_yes[d.dates[1] + 1] * 2 > v_members) then 'deadline'
      else 'majority'
    end;
    perform private.events_confirm(p_event, v_ids[d.dates[1] + 1], v_by, p_now);
  elsif d.outcome = 'tiebreak' then
    perform private.events_start_tiebreak(p_event, p_now);
  elsif d.outcome = 'cancel' then
    perform private.events_cancel_unwanted(p_event, p_now);
  end if;
  return (select status from public.events where id = p_event);
end;
$$;

revoke all on function private.events_evaluate(uuid, timestamptz, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- After 48 hours with no answer from the organiser, the earliest of the tied dates is chosen so
-- the event is never stuck. If nobody has any yes left (members left), it is cancelled instead.
create or replace function private.events_auto_tiebreak(p_event uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
  v_top integer;
  v_option uuid;
begin
  select * into e from public.events where id = p_event for update;
  if e.status <> 'tiebreak' then
    return;
  end if;
  select max(t.yes) into v_top from private.events_tally(p_event) t;
  if coalesce(v_top, 0) = 0 then
    perform private.events_cancel_unwanted(p_event, p_now);
    return;
  end if;
  select t.option_id into v_option from private.events_tally(p_event) t
   where t.yes = v_top order by t.starts_at, t.option_id limit 1;
  perform private.events_confirm(p_event, v_option, 'auto_tiebreak', p_now);
end;
$$;

revoke all on function private.events_auto_tiebreak(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Everything the hourly job does, in order. Closed flats are skipped.
create or replace function private.events_run(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  m record;
  v_london_today date := (p_now at time zone 'Europe/London')::date;
begin
  -- 1. Voting that has run out of time.
  for r in
    select e.id from public.events e join public.households h on h.id = e.household_id
     where e.status = 'voting' and e.vote_deadline <= p_now and h.closed_at is null
     order by e.vote_deadline, e.id
  loop
    perform private.events_evaluate(r.id, p_now, true);
  end loop;

  -- 2. Ties the organiser left alone for 48 hours.
  for r in
    select e.id from public.events e join public.households h on h.id = e.household_id
     where e.status = 'tiebreak' and e.tiebreak_since <= p_now - interval '48 hours' and h.closed_at is null
     order by e.tiebreak_since, e.id
  loop
    perform private.events_auto_tiebreak(r.id, p_now);
  end loop;

  -- 3. The organiser is reminded once, 24 hours into a tie.
  for r in
    select e.id, e.household_id, e.organiser_id, e.title
      from public.events e join public.households h on h.id = e.household_id
     where e.status = 'tiebreak' and e.tiebreak_since <= p_now - interval '24 hours' and h.closed_at is null
       and exists (select 1 from public.memberships mm
                    where mm.household_id = e.household_id and mm.profile_id = e.organiser_id and mm.left_at is null)
  loop
    perform private.notify(
      r.organiser_id, r.household_id, 'event_tiebreak',
      left(r.title, 50) || ' is tied: please pick a date', '', '/events/' || r.id, 'event_tiebreak:' || r.id || ':2');
  end loop;

  -- 4. A day before voting closes, anyone who has not voted is nudged. Not for an event proposed
  --    inside that day, whose first notification said the same thing.
  for r in
    select e.id, e.household_id, e.title, e.vote_deadline
      from public.events e join public.households h on h.id = e.household_id
     where e.status = 'voting' and h.closed_at is null
       and e.vote_deadline > p_now and e.vote_deadline - interval '24 hours' <= p_now
       and e.created_at <= e.vote_deadline - interval '24 hours'
  loop
    for m in
      select mm.profile_id from public.memberships mm
       where mm.household_id = r.household_id and mm.left_at is null
         and not exists (
           select 1 from public.event_votes v
             join public.event_options o on o.id = v.option_id and o.removed_at is null
            where v.event_id = r.id and v.profile_id = mm.profile_id)
    loop
      perform private.notify(
        m.profile_id, r.household_id, 'event_vote_reminder',
        left('Vote on ' || left(r.title, 40) || ' before '
             || to_char(r.vote_deadline at time zone 'Europe/London', 'Dy FMDD Mon'), 80),
        '', '/events/' || r.id, 'event_vote_reminder:' || r.id);
    end loop;
  end loop;

  -- 5. Reminders before a confirmed event: about a day before (only if that moment came after the
  --    event was confirmed) and about two hours before. People who said no to the date are skipped.
  for r in
    select e.id, e.household_id, e.title, e.starts_at, e.confirmed_at, e.confirmed_option_id
      from public.events e join public.households h on h.id = e.household_id
     where e.status = 'confirmed' and h.closed_at is null
       and e.starts_at > p_now and e.starts_at - interval '24 hours' <= p_now
  loop
    for m in
      select mm.profile_id from public.memberships mm
       where mm.household_id = r.household_id and mm.left_at is null
         and not exists (
           select 1 from public.event_votes v
            where v.option_id = r.confirmed_option_id and v.profile_id = mm.profile_id and v.answer = 'no')
    loop
      if r.starts_at - interval '2 hours' > p_now and r.confirmed_at <= r.starts_at - interval '24 hours' then
        perform private.notify(
          m.profile_id, r.household_id, 'event_reminder',
          left(left(r.title, 50) || case when (r.starts_at at time zone 'Europe/London')::date = v_london_today
                 then ' is today, ' else ' is tomorrow, ' end
               || to_char(r.starts_at at time zone 'Europe/London', 'HH24:MI'), 80),
          '', '/events/' || r.id, 'event_reminder:' || r.id || ':day');
      elsif r.starts_at - interval '2 hours' <= p_now and r.confirmed_at <= r.starts_at - interval '2 hours' then
        perform private.notify(
          m.profile_id, r.household_id, 'event_reminder',
          left(left(r.title, 50) || ' is in 2 hours', 80),
          '', '/events/' || r.id, 'event_reminder:' || r.id || ':hour');
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function private.events_run(timestamptz) from public, anon, authenticated;

-- The cron entry point: one run per hour, recorded in job_runs so a second call in the same hour
-- does nothing.
create or replace function private.run_events_hourly()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('events-hourly', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.events_run(now());
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.run_events_hourly() from public, anon, authenticated;

select cron.schedule('events-hourly', '47 * * * *', 'select private.run_events_hourly()');

-- ---------------------------------------------------------------------------------------------
-- Joins and leaves.

-- A new member counts in the total from now on and is asked to vote on every event still open.
create or replace function private.events_note_member_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  begin
    for r in
      select e.id, e.title, e.organiser_id from public.events e
       where e.household_id = new.household_id and e.status = 'voting' and e.vote_deadline > now()
       order by e.created_at, e.id
    loop
      perform private.notify(
        new.profile_id, new.household_id, 'event_proposed',
        left(private.notification_name(r.organiser_id) || ' proposed: ' || r.title, 80),
        '', '/events/' || r.id, 'event_proposed:' || r.id);
    end loop;
  exception when others then
    raise warning 'events join notice failed: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function private.events_note_member_joined() from public, anon, authenticated;

-- A member left, was removed, or deleted their account (not a flat closing). Their open and
-- upcoming events pass to the longest-standing admin, then every open event is checked again,
-- because the flat just got smaller and a date may now have its majority.
create or replace function private.events_note_member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_heir uuid;
begin
  if new.left_reason = 'flat_closed' then
    return new;
  end if;
  begin
    select m.profile_id into v_heir from public.memberships m
     where m.household_id = new.household_id and m.left_at is null and m.profile_id <> new.profile_id
     order by (m.role in ('owner', 'admin')) desc, m.joined_at, m.profile_id limit 1;

    if v_heir is not null then
      perform set_config('flatmate.events_handover', 'on', true);
      for r in
        select e.id, e.title from public.events e
         where e.household_id = new.household_id and e.organiser_id = new.profile_id
           and (e.status in ('voting', 'tiebreak') or (e.status = 'confirmed' and e.starts_at > now()))
         order by e.created_at, e.id
      loop
        update public.events set organiser_id = v_heir where id = r.id;
        perform private.notify(
          v_heir, new.household_id, 'event_organiser_changed',
          left('You are now organising ' || r.title, 80), '', '/events/' || r.id,
          'event_organiser:' || r.id || ':' || v_heir);
      end loop;
      perform set_config('flatmate.events_handover', 'off', true);
    end if;

    perform set_config('flatmate.events_cause', 'member_change', true);
    for r in
      select e.id from public.events e
       where e.household_id = new.household_id and e.status = 'voting'
       order by e.created_at, e.id
    loop
      perform private.events_evaluate(r.id, now(), false);
    end loop;
    perform set_config('flatmate.events_cause', '', true);
  exception when others then
    perform set_config('flatmate.events_handover', 'off', true);
    perform set_config('flatmate.events_cause', '', true);
    raise warning 'events leave handling failed: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function private.events_note_member_left() from public, anon, authenticated;

create trigger events_note_member_joined after insert on public.memberships
  for each row when (new.left_at is null) execute function private.events_note_member_joined();
create trigger events_note_member_left after update of left_at on public.memberships
  for each row when (old.left_at is null and new.left_at is not null)
  execute function private.events_note_member_left();
