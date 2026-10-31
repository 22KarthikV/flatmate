-- Events: the write functions, the majority rule and the notification types (SPEC-events E2).
--
-- Every write comes from here. Each function takes the caller from auth.uid() (never from an
-- argument), checks that the event belongs to the caller's flat (another flat's id looks like "not
-- found"), and takes the event row's lock before it counts any votes, so two simultaneous votes
-- cannot both complete a majority or confirm twice. The one place the rule lives is
-- private.events_evaluate. Time is a parameter wherever a job needs it, so tests can move through it.
-- Push text is fixed and generic; the inbox row may name the event.

-- ---------------------------------------------------------------------------------------------
-- Notification types (append-only). Titles below are what the push worker sends instead of the
-- inbox row's own text, so no event title, place or person reaches a lock screen.
insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('event_proposed', true, true, false),
  ('event_changed', true, false, false),
  ('event_confirmed', true, true, false),
  ('event_cancelled', true, true, false),
  ('event_vote_reminder', true, true, true),
  ('event_tiebreak', true, true, false),
  ('event_reminder', true, true, true),
  ('event_organiser_changed', true, false, false);

update public.notification_types set push_title = 'A new event to vote on',
  push_body = 'Open FlatMate to take a look.' where type = 'event_proposed';
update public.notification_types set push_title = 'An event was updated',
  push_body = 'Open FlatMate to see what changed.' where type = 'event_changed';
update public.notification_types set push_title = 'An event is confirmed',
  push_body = 'Open FlatMate to see when.' where type = 'event_confirmed';
update public.notification_types set push_title = 'An event was cancelled',
  push_body = 'Open FlatMate to see why.' where type = 'event_cancelled';
update public.notification_types set push_title = 'An event needs your vote',
  push_body = 'Open FlatMate to vote.' where type = 'event_vote_reminder';
update public.notification_types set push_title = 'An event needs you to pick a date',
  push_body = 'Open FlatMate to choose.' where type = 'event_tiebreak';
update public.notification_types set push_title = 'An event is coming up',
  push_body = 'Open FlatMate to see the details.' where type = 'event_reminder';
update public.notification_types set push_title = 'You are organising an event',
  push_body = 'Open FlatMate to see it.' where type = 'event_organiser_changed';

-- ---------------------------------------------------------------------------------------------
-- Small helpers.

-- "Fri 6 Nov, 19:30" in London time, for inbox text.
create or replace function private.events_when(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'Europe/London', 'Dy FMDD Mon, HH24:MI');
$$;

revoke all on function private.events_when(timestamptz) from public, anon, authenticated;

-- The rule, on its own so it can be tested against the shared vectors. `p_yes` holds the yes count of
-- each live date in date order; the answer names dates by zero-based position.
--   Early: a date with more than half of the members' yes is confirmed. If two dates cross at once
--   (a member just left), the one with more yes wins and a level pair goes to the organiser.
--   At the deadline: the most yes wins, level goes to the organiser, none at all cancels.
create or replace function private.events_decide(p_yes integer[], p_members integer, p_deadline_passed boolean)
returns table (outcome text, dates integer[])
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_top integer;
  v_dates integer[];
begin
  if p_members <= 0 or coalesce(cardinality(p_yes), 0) = 0 then
    return query select 'wait'::text, '{}'::integer[];
    return;
  end if;
  select coalesce(max(y), 0) into v_top from unnest(p_yes) y;
  select coalesce(array_agg((i - 1)::integer order by i), '{}') into v_dates
    from unnest(p_yes) with ordinality t (y, i) where y = v_top and v_top > 0;

  if v_top > 0 and v_top * 2 > p_members then
    if cardinality(v_dates) = 1 then
      return query select 'confirm'::text, v_dates;
    else
      return query select 'tiebreak'::text, v_dates;
    end if;
  elsif not p_deadline_passed then
    return query select 'wait'::text, '{}'::integer[];
  elsif v_top = 0 then
    return query select 'cancel'::text, '{}'::integer[];
  elsif cardinality(v_dates) = 1 then
    return query select 'confirm'::text, v_dates;
  else
    return query select 'tiebreak'::text, v_dates;
  end if;
end;
$$;

revoke all on function private.events_decide(integer[], integer, boolean) from public, anon, authenticated;

-- Yes, maybe and no per live date, counting only current members' votes, with the number of members.
create or replace function private.events_tally(p_event uuid)
returns table (option_id uuid, pos integer, starts_at timestamptz, yes integer, maybe integer, no integer, members integer)
language sql
stable
security definer
set search_path = ''
as $$
  with e as (select id, household_id from public.events where id = p_event),
       n as (
         select count(*)::integer as members from public.memberships m, e
          where m.household_id = e.household_id and m.left_at is null
       )
  select o.id,
         (row_number() over (order by o.starts_at, o.id))::integer - 1,
         o.starts_at,
         (count(v.profile_id) filter (where v.answer = 'yes' and m.profile_id is not null))::integer,
         (count(v.profile_id) filter (where v.answer = 'maybe' and m.profile_id is not null))::integer,
         (count(v.profile_id) filter (where v.answer = 'no' and m.profile_id is not null))::integer,
         (select members from n)
    from e
    join public.event_options o on o.event_id = e.id and o.removed_at is null
    left join public.event_votes v on v.option_id = o.id
    left join public.memberships m
      on m.profile_id = v.profile_id and m.household_id = e.household_id and m.left_at is null
   group by o.id, o.starts_at
   order by o.starts_at, o.id;
$$;

revoke all on function private.events_tally(uuid) from public, anon, authenticated;

-- Looks up the event for the caller and locks it. Anyone who is not a current member of the event's
-- flat gets the same "not found" as for a made-up id.
create or replace function private.events_lock(p_event uuid)
returns table (caller uuid, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
  v_role text;
begin
  if v_caller is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select e.household_id into v_household from public.events e where e.id = p_event;
  select m.role into v_role from public.memberships m
   where m.profile_id = v_caller and m.household_id = v_household and m.left_at is null;
  if v_household is null or v_role is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  perform 1 from public.events e where e.id = p_event for update;
  return query select v_caller, v_role;
end;
$$;

revoke all on function private.events_lock(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Confirming, tying and cancelling are internal: they run inside a locked transaction.

create or replace function private.events_confirm(p_event uuid, p_option uuid, p_by text, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
  o public.event_options%rowtype;
begin
  select * into e from public.events where id = p_event for update;
  if e.status not in ('voting', 'tiebreak') then
    return;
  end if;
  select * into o from public.event_options where id = p_option and event_id = p_event and removed_at is null;
  if not found then
    raise exception 'invalid_option' using errcode = 'P0001';
  end if;

  update public.events
     set status = 'confirmed', confirmed_option_id = o.id, confirmed_at = p_now, confirmed_by = p_by,
         starts_at = o.starts_at, ends_at = o.ends_at
   where id = p_event;

  perform private.notify_flatmates(
    e.household_id, array[]::uuid[], 'event_confirmed',
    e.title || ' is on: ' || private.events_when(o.starts_at),
    '/events/' || p_event, 'event_confirmed:' || p_event);
end;
$$;

revoke all on function private.events_confirm(uuid, uuid, text, timestamptz) from public, anon, authenticated;

-- The organiser is asked to pick among tied dates, straight away; E3 reminds them later.
create or replace function private.events_start_tiebreak(p_event uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
begin
  select * into e from public.events where id = p_event for update;
  if e.status <> 'voting' then
    return;
  end if;
  update public.events set status = 'tiebreak', tiebreak_since = p_now where id = p_event;
  if exists (
    select 1 from public.memberships m
     where m.household_id = e.household_id and m.profile_id = e.organiser_id and m.left_at is null
  ) then
    perform private.notify(
      e.organiser_id, e.household_id, 'event_tiebreak',
      left(e.title, 50) || ' is tied: please pick a date',
      '', '/events/' || p_event, 'event_tiebreak:' || p_event || ':1');
  end if;
end;
$$;

revoke all on function private.events_start_tiebreak(uuid, timestamptz) from public, anon, authenticated;

-- Nobody could make any date: the app cancels it.
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
  if e.status <> 'voting' then
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

-- The one place the rule is applied. Idempotent: it only moves an event out of 'voting', and does
-- nothing to an event that is already confirmed, tied, cancelled or missing. Returns the new status.
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
    perform private.events_confirm(
      p_event, v_ids[d.dates[1] + 1],
      case when p_deadline_passed and not (v_yes[d.dates[1] + 1] * 2 > v_members) then 'deadline' else 'majority' end,
      p_now);
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
-- Text and date checks shared by propose and update.
create or replace function private.events_check_text(p_title text, p_description text, p_location text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then
    raise exception 'invalid_title' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'invalid_description' using errcode = 'P0001';
  end if;
  if p_location is not null and char_length(btrim(p_location)) > 100 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.events_check_text(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Public functions.

-- Proposes an event with 2 to 8 future dates and a voting deadline. `p_options` is a json array of
-- {"startsAt": "...", "endsAt": "..." or null}. Returns the event id.
create or replace function public.propose_event(
  p_title text,
  p_description text,
  p_location text,
  p_options jsonb,
  p_deadline timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
  v_event uuid;
  v_option jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_starts timestamptz[] := '{}';
  v_ends timestamptz[] := '{}';
  i integer;
begin
  if v_caller is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select m.household_id into v_household from public.memberships m
   where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.events_check_text(p_title, p_description, p_location);

  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 8 then
    raise exception 'invalid_options' using errcode = 'P0001';
  end if;
  for v_option in select * from jsonb_array_elements(p_options) loop
    begin
      v_start := (v_option ->> 'startsAt')::timestamptz;
      v_end := nullif(v_option ->> 'endsAt', '')::timestamptz;
    exception when others then
      raise exception 'invalid_options' using errcode = 'P0001';
    end;
    if v_start is null or (v_end is not null and v_end <= v_start) then
      raise exception 'invalid_options' using errcode = 'P0001';
    end if;
    if v_start <= now() then
      raise exception 'option_in_past' using errcode = 'P0001';
    end if;
    v_starts := v_starts || v_start;
    v_ends := v_ends || v_end;
  end loop;
  if (select count(distinct s) from unnest(v_starts) s) <> cardinality(v_starts) then
    raise exception 'invalid_options' using errcode = 'P0001';
  end if;

  if p_deadline is null or p_deadline <= now() or p_deadline >= (select min(s) from unnest(v_starts) s) then
    raise exception 'invalid_deadline' using errcode = 'P0001';
  end if;

  -- Serialise proposals per flat so the cap of ten open events cannot be beaten by two at once.
  perform 1 from public.households h where h.id = v_household for update;
  if (select count(*) from public.events e
       where e.household_id = v_household and e.status in ('voting', 'tiebreak')) >= 10 then
    raise exception 'too_many_open_events' using errcode = 'P0001';
  end if;

  insert into public.events (household_id, organiser_id, title, description, location, vote_deadline)
  values (v_household, v_caller, btrim(p_title), btrim(coalesce(p_description, '')),
          nullif(btrim(coalesce(p_location, '')), ''), p_deadline)
  returning id into v_event;

  for i in 1 .. cardinality(v_starts) loop
    insert into public.event_options (event_id, household_id, starts_at, ends_at)
    values (v_event, v_household, v_starts[i], v_ends[i]);
  end loop;

  perform private.notify_flatmates(
    v_household, array[v_caller], 'event_proposed',
    private.notification_name(v_caller) || ' proposed: ' || btrim(p_title),
    '/events/' || v_event, 'event_proposed:' || v_event);
  return v_event;
end;
$$;

-- Edits the text, and moves the deadline while voting is open. Only the organiser. `p_deadline` null
-- leaves it alone.
create or replace function public.update_event(
  p_event uuid,
  p_title text,
  p_description text,
  p_location text,
  p_deadline timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  e public.events%rowtype;
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_changed boolean;
begin
  select * into ctx from private.events_lock(p_event);
  select * into e from public.events where id = p_event;
  if e.organiser_id <> ctx.caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if e.status = 'cancelled' then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;
  perform private.events_check_text(p_title, p_description, p_location);

  if p_deadline is not null and p_deadline is distinct from e.vote_deadline then
    if e.status <> 'voting' then
      raise exception 'deadline_locked' using errcode = 'P0001';
    end if;
    if p_deadline <= now() or p_deadline >= (
      select min(o.starts_at) from public.event_options o where o.event_id = p_event and o.removed_at is null
    ) then
      raise exception 'invalid_deadline' using errcode = 'P0001';
    end if;
  end if;

  v_changed := btrim(p_title) is distinct from e.title
    or btrim(coalesce(p_description, '')) is distinct from e.description
    or v_location is distinct from e.location
    or (p_deadline is not null and p_deadline is distinct from e.vote_deadline);
  if not v_changed then
    return;
  end if;

  update public.events
     set title = btrim(p_title), description = btrim(coalesce(p_description, '')), location = v_location,
         vote_deadline = coalesce(p_deadline, vote_deadline), edit_number = edit_number + 1
   where id = p_event
  returning * into e;

  perform private.notify_flatmates(
    e.household_id, array[ctx.caller], 'event_changed', e.title || ' was updated',
    '/events/' || p_event, 'event_changed:' || p_event || ':' || e.edit_number);
end;
$$;

-- Adds a date while voting is open. Only the organiser. Returns the date's id.
create or replace function public.add_event_option(p_event uuid, p_starts_at timestamptz, p_ends_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  e public.events%rowtype;
  v_option uuid;
begin
  select * into ctx from private.events_lock(p_event);
  select * into e from public.events where id = p_event;
  if e.organiser_id <> ctx.caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if e.status <> 'voting' then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;
  if p_starts_at is null or (p_ends_at is not null and p_ends_at <= p_starts_at) then
    raise exception 'invalid_options' using errcode = 'P0001';
  end if;
  if p_starts_at <= now() then
    raise exception 'option_in_past' using errcode = 'P0001';
  end if;
  if p_starts_at <= e.vote_deadline then
    raise exception 'invalid_deadline' using errcode = 'P0001';
  end if;
  if (select count(*) from public.event_options o where o.event_id = p_event and o.removed_at is null) >= 8 then
    raise exception 'too_many_options' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.event_options o
     where o.event_id = p_event and o.removed_at is null and o.starts_at = p_starts_at
  ) then
    raise exception 'invalid_options' using errcode = 'P0001';
  end if;

  insert into public.event_options (event_id, household_id, starts_at, ends_at)
  values (p_event, e.household_id, p_starts_at, p_ends_at)
  returning id into v_option;

  update public.events set edit_number = edit_number + 1 where id = p_event returning * into e;
  perform private.notify_flatmates(
    e.household_id, array[ctx.caller], 'event_changed', e.title || ' was updated',
    '/events/' || p_event, 'event_changed:' || p_event || ':' || e.edit_number);
  return v_option;
end;
$$;

-- Drops a date while voting is open, as long as two remain. Votes on it stay as history. Only the
-- organiser.
create or replace function public.remove_event_option(p_option uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  e public.events%rowtype;
  v_event uuid;
begin
  select o.event_id into v_event from public.event_options o where o.id = p_option;
  if v_event is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  select * into ctx from private.events_lock(v_event);
  select * into e from public.events where id = v_event;
  if e.organiser_id <> ctx.caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if e.status <> 'voting' then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.event_options o where o.id = p_option and o.event_id = v_event and o.removed_at is null
  ) then
    raise exception 'invalid_option' using errcode = 'P0001';
  end if;
  if (select count(*) from public.event_options o where o.event_id = v_event and o.removed_at is null) <= 2 then
    raise exception 'too_few_options' using errcode = 'P0001';
  end if;

  update public.event_options set removed_at = now() where id = p_option;
  update public.events set edit_number = edit_number + 1 where id = v_event returning * into e;
  perform private.notify_flatmates(
    e.household_id, array[ctx.caller], 'event_changed', e.title || ' was updated',
    '/events/' || v_event, 'event_changed:' || v_event || ':' || e.edit_number);
  perform private.events_evaluate(v_event, now(), false);
end;
$$;

-- Records the caller's answer on a date (or clears it with a null answer) while voting is open, then
-- applies the rule. Returns the event's status afterwards.
create or replace function public.cast_event_vote(p_option uuid, p_answer text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  e public.events%rowtype;
  v_event uuid;
begin
  select o.event_id into v_event from public.event_options o where o.id = p_option;
  if v_event is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  select * into ctx from private.events_lock(v_event);
  select * into e from public.events where id = v_event;
  if p_answer is not null and p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid_answer' using errcode = 'P0001';
  end if;
  if e.status <> 'voting' or not exists (
    select 1 from public.event_options o where o.id = p_option and o.removed_at is null
  ) then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;
  if now() >= e.vote_deadline then
    raise exception 'voting_closed' using errcode = 'P0001';
  end if;

  if p_answer is null then
    delete from public.event_votes where option_id = p_option and profile_id = ctx.caller;
  else
    insert into public.event_votes (option_id, event_id, household_id, profile_id, answer)
    values (p_option, v_event, e.household_id, ctx.caller, p_answer)
    on conflict (option_id, profile_id) do update set answer = excluded.answer;
  end if;

  return private.events_evaluate(v_event, now(), false);
end;
$$;

-- Cancels an event, with an optional short reason. The organiser or any admin of the flat.
create or replace function public.cancel_event(p_event uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  e public.events%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into ctx from private.events_lock(p_event);
  select * into e from public.events where id = p_event;
  if e.organiser_id <> ctx.caller and ctx.member_role not in ('owner', 'admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if e.status = 'cancelled' then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_reason, '')) > 100 then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  update public.events
     set status = 'cancelled', cancelled_at = now(), cancelled_by = ctx.caller, cancelled_reason = v_reason
   where id = p_event;
  perform private.notify_flatmates(
    e.household_id, array[ctx.caller], 'event_cancelled', e.title || ' was cancelled',
    '/events/' || p_event, 'event_cancelled:' || p_event);
end;
$$;

-- The organiser picks the date after a tie. Only among the dates that are tied for the most yes.
create or replace function public.decide_event_tie(p_event uuid, p_option uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  e public.events%rowtype;
  v_top integer;
begin
  select * into ctx from private.events_lock(p_event);
  select * into e from public.events where id = p_event;
  if e.organiser_id <> ctx.caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if e.status <> 'tiebreak' then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;
  select max(t.yes) into v_top from private.events_tally(p_event) t;
  if v_top is null or v_top = 0 or not exists (
    select 1 from private.events_tally(p_event) t where t.option_id = p_option and t.yes = v_top
  ) then
    raise exception 'invalid_option' using errcode = 'P0001';
  end if;
  perform private.events_confirm(p_event, p_option, 'organiser', now());
end;
$$;

revoke all on function public.propose_event(text, text, text, jsonb, timestamptz) from public, anon;
revoke all on function public.update_event(uuid, text, text, text, timestamptz) from public, anon;
revoke all on function public.add_event_option(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.remove_event_option(uuid) from public, anon;
revoke all on function public.cast_event_vote(uuid, text) from public, anon;
revoke all on function public.cancel_event(uuid, text) from public, anon;
revoke all on function public.decide_event_tie(uuid, uuid) from public, anon;
grant execute on function public.propose_event(text, text, text, jsonb, timestamptz) to authenticated;
grant execute on function public.update_event(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.add_event_option(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.remove_event_option(uuid) to authenticated;
grant execute on function public.cast_event_vote(uuid, text) to authenticated;
grant execute on function public.cancel_event(uuid, text) to authenticated;
grant execute on function public.decide_event_tie(uuid, uuid) to authenticated;
