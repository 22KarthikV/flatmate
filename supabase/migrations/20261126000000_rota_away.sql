-- Rota: away periods (SPEC-rota-away).
--
-- Someone on holiday still belongs to the flat and still owes rent and bills. Only chores skip them.
-- An away period is a date range, set by the person or an admin. Every day in it counts as not
-- available for every week it touches, without a weekly answer, and it replaces "assumed available".
-- A day marked available again by the person (back early) wins. Money never looks at this table.
-- A late change to a week that is already generated reuses the leaver rebuild: the same job, the same
-- 24-hour lock, the same 24-hour admin undo. Leaving the flat ends any open period.

create table public.away_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  profile_id uuid not null references public.profiles (id),
  starts_on date not null,
  ends_on date not null,
  note text check (note is null or char_length(note) between 1 and 100),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Set when the person ends the period early (or leaves the flat). It then counts for nothing.
  ended_at timestamptz,
  check (ends_on >= starts_on)
);

create index away_periods_flat on public.away_periods (household_id, starts_on, ends_on) where ended_at is null;
create index away_periods_person on public.away_periods (profile_id, starts_on) where ended_at is null;

comment on table public.away_periods is
  'Dates someone is away from chores. Rent and bills are not affected. Flatmates can read them, note included.';

alter table public.away_periods enable row level security;
revoke all on public.away_periods from anon, authenticated;
grant select on public.away_periods to authenticated;
create policy away_periods_select_members on public.away_periods
  for select to authenticated using ((select authz.is_household_member(household_id)));

-- The kind of rebuild: someone left, or someone is away for days that already have chores.
alter table public.rota_rebuilds
  add column kind text not null default 'left' check (kind in ('left', 'away'));

drop index public.rota_rebuilds_once;
create unique index rota_rebuilds_once on public.rota_rebuilds (household_id, left_profile, kind, requested_at);

-- ---------------------------------------------------------------------------------------------
-- Is this person away on that date? Inside an open period, unless they marked that day available
-- themselves (an answer they gave, not one the app filled in).
create or replace function private.rota_away_on(p_household uuid, p_profile uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.away_periods ap
     where ap.household_id = p_household and ap.profile_id = p_profile
       and ap.ended_at is null and p_date between ap.starts_on and ap.ends_on
  ) and not exists (
    select 1 from public.availability a
     where a.household_id = p_household and a.profile_id = p_profile
       and a.on_date = p_date and a.available and not a.assumed
  );
$$;

revoke all on function private.rota_away_on(uuid, uuid, date) from public, anon, authenticated;

-- What the rota treats as availability: what people answered, with their away days applied.
create or replace function private.rota_effective_availability(p_household uuid, p_from date, p_to date)
returns table (profile_id uuid, on_date date, available boolean, assumed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select x.profile_id, x.on_date,
         case when private.rota_away_on(p_household, x.profile_id, x.on_date) then false else x.available end,
         x.assumed and not private.rota_away_on(p_household, x.profile_id, x.on_date)
    from (
      select a.profile_id, a.on_date, a.available, a.assumed
        from public.availability a
       where a.household_id = p_household and a.on_date between p_from and p_to
      union
      select ap.profile_id, d::date, false, true
        from public.away_periods ap
       cross join lateral generate_series(
         greatest(ap.starts_on, p_from)::timestamp, least(ap.ends_on, p_to)::timestamp, interval '1 day') d
       where ap.household_id = p_household and ap.ended_at is null
         and not exists (
           select 1 from public.availability a
            where a.household_id = p_household and a.profile_id = ap.profile_id and a.on_date = d::date)
    ) x;
$$;

revoke all on function private.rota_effective_availability(uuid, date, date) from public, anon, authenticated;

-- How many days of a week each person is away, for fair shares: {profile: days}.
create or replace function private.rota_away_days(p_household uuid, p_week date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(profile_id, n), '{}'::jsonb)
    from (
      select m.profile_id, count(*) filter (where private.rota_away_on(p_household, m.profile_id, p_week + d)) as n
        from public.memberships m
       cross join generate_series(0, 6) d
       where m.household_id = p_household
       group by m.profile_id
    ) t
   where n > 0;
$$;

revoke all on function private.rota_away_days(uuid, date) from public, anon, authenticated;

-- Away status now comes from the combined view (swaps, reassigns and storing a week all use this).
create or replace function private.rota_is_away(p_household uuid, p_profile uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.rota_away_on(p_household, p_profile, p_date) or exists (
    select 1 from public.availability a
     where a.household_id = p_household and a.profile_id = p_profile
       and a.on_date = p_date and not a.available
  );
$$;

revoke all on function private.rota_is_away(uuid, uuid, date) from public, anon, authenticated;

-- The caller's flat's availability for the screens, away days applied. Members only.
create or replace function public.rota_availability(p_from date, p_to date)
returns table (profile_id uuid, on_date date, available boolean, assumed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select m.household_id into v_household from public.memberships m
   where m.profile_id = (select authz.current_profile_id()) and m.left_at is null;
  if v_household is null or p_from is null or p_to is null or p_to < p_from or p_to > p_from + 31 then
    return;
  end if;
  return query select * from private.rota_effective_availability(v_household, p_from, p_to);
end;
$$;

revoke all on function public.rota_availability(date, date) from public, anon;
grant execute on function public.rota_availability(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Setting and ending a period.
create or replace function private.rota_enqueue_away_rebuild(p_now timestamptz, p_household uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Europe/London')::date;
begin
  if not exists (select 1 from public.chores c where c.household_id = p_household and c.archived_at is null) then
    return;
  end if;
  if exists (
    select 1 from public.rota_rebuilds b
     where b.household_id = p_household and b.left_profile = p_profile and b.kind = 'away' and b.status = 'pending'
  ) then
    return;
  end if;
  if not exists (
    select 1 from public.chore_assignments a
     where a.household_id = p_household and a.assignee = p_profile
       and a.superseded_at is null and a.completed_at is null and a.due_on >= v_today
       and private.rota_away_on(p_household, p_profile, a.due_on)
  ) then
    return;
  end if;
  insert into public.rota_rebuilds (household_id, left_profile, left_reason, kind, requested_at)
  values (p_household, p_profile, 'away', 'away', p_now);
end;
$$;

revoke all on function private.rota_enqueue_away_rebuild(timestamptz, uuid, uuid) from public, anon, authenticated;

create or replace function private.rota_set_away(
  p_now timestamptz, p_caller uuid, p_profile uuid, p_starts date, p_ends date, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Europe/London')::date;
  v_this_week date := v_today - extract(dow from v_today)::int;
  v_target uuid := coalesce(p_profile, p_caller);
  v_household uuid;
  v_role public.household_role;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  select m.household_id, m.role into v_household, v_role from public.memberships m
   where m.profile_id = p_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_target <> p_caller and v_role not in ('owner', 'admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.household_id = v_household and m.profile_id = v_target and m.left_at is null
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if p_starts is null or p_ends is null or p_ends < p_starts or p_ends > p_starts + 730 then
    raise exception 'invalid_dates' using errcode = '22023';
  end if;
  if p_starts < v_this_week then
    raise exception 'away_in_past' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 100 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  perform 1 from public.households where id = v_household for update;
  if exists (
    select 1 from public.away_periods ap
     where ap.household_id = v_household and ap.profile_id = v_target and ap.ended_at is null
       and ap.starts_on <= p_ends and ap.ends_on >= p_starts
  ) then
    raise exception 'away_overlap' using errcode = 'P0001';
  end if;

  insert into public.away_periods (household_id, profile_id, starts_on, ends_on, note, created_by)
  values (v_household, v_target, p_starts, p_ends, v_note, p_caller)
  returning id into v_id;

  perform private.rota_enqueue_away_rebuild(p_now, v_household, v_target);
  return v_id;
end;
$$;

revoke all on function private.rota_set_away(timestamptz, uuid, uuid, date, date, text) from public, anon, authenticated;

create or replace function public.set_away(p_starts date, p_ends date, p_note text default null, p_profile uuid default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.rota_set_away(now(), (select authz.current_profile_id()), p_profile, p_starts, p_ends, p_note);
$$;

-- End a period now, or (with p_last_day) shorten it so that day is the last one away.
create or replace function private.rota_end_away(p_now timestamptz, p_caller uuid, p_id uuid, p_last_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ap public.away_periods%rowtype;
  v_role public.household_role;
begin
  select * into ap from public.away_periods where id = p_id and ended_at is null for update;
  if not found then
    raise exception 'away_not_found' using errcode = 'P0002';
  end if;
  select m.role into v_role from public.memberships m
   where m.household_id = ap.household_id and m.profile_id = p_caller and m.left_at is null;
  if v_role is null or (ap.profile_id <> p_caller and v_role not in ('owner', 'admin')) then
    raise exception 'away_not_found' using errcode = 'P0002';
  end if;
  if p_last_day is null or p_last_day < ap.starts_on then
    update public.away_periods set ended_at = p_now where id = ap.id;
  elsif p_last_day < ap.ends_on then
    update public.away_periods set ends_on = p_last_day where id = ap.id;
  end if;
end;
$$;

revoke all on function private.rota_end_away(timestamptz, uuid, uuid, date) from public, anon, authenticated;

create or replace function public.end_away(p_id uuid, p_last_day date default null)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.rota_end_away(now(), (select authz.current_profile_id()), p_id, p_last_day);
$$;

revoke all on function public.set_away(date, date, text, uuid) from public, anon;
revoke all on function public.end_away(uuid, date) from public, anon;
grant execute on function public.set_away(date, date, text, uuid) to authenticated;
grant execute on function public.end_away(uuid, date) to authenticated;

-- Leaving the flat ends any open period.
create or replace function private.rota_end_away_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.away_periods set ended_at = now()
   where household_id = new.household_id and profile_id = new.profile_id and ended_at is null;
  return new;
end;
$$;

revoke all on function private.rota_end_away_on_leave() from public, anon, authenticated;

create trigger rota_end_away_on_leave after update of left_at on public.memberships
  for each row when (old.left_at is null and new.left_at is not null)
  execute function private.rota_end_away_on_leave();

-- ---------------------------------------------------------------------------------------------
-- Everything below recreates functions from earlier migrations, changed only where noted.

-- Storing a week: an away period also blocks a day.
create or replace function private.rota_store_week(
  p_now timestamptz,
  p_household uuid,
  p_week_start date,
  p_reason text,
  p_created_by uuid,
  p_assignments jsonb,
  p_owed jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Europe/London')::date;
  v_this_week date := v_today - extract(dow from v_today)::int;
  v_week uuid;
  v_revision integer;
  v_current uuid;
  v_item jsonb;
  v_chore public.chores%rowtype;
  v_assignee uuid;
  v_due date;
  v_members uuid[];
  v_assignment uuid;
  r record;
begin
  if p_reason not in ('weekly', 'manual', 'member_left', 'member_joined', 'undo') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_week_start is null or extract(dow from p_week_start) <> 0 then
    raise exception 'invalid_week' using errcode = '22023';
  end if;
  if p_week_start < v_this_week then
    raise exception 'week_in_past' using errcode = 'P0001';
  end if;
  if p_week_start > v_this_week + 14 then
    raise exception 'week_too_far' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_assignments, '[]'::jsonb)) > 200 then
    raise exception 'invalid_assignment' using errcode = '22023';
  end if;

  -- One writer per flat at a time.
  perform 1 from public.households where id = p_household for update;

  select w.id into v_current
    from public.rota_weeks w
   where w.household_id = p_household and w.week_start = p_week_start and w.superseded_at is null;
  -- Generating the same week twice gives the same revision (T9).
  if v_current is not null and p_reason = 'weekly' then
    return v_current;
  end if;

  select coalesce(max(w.revision), 0) + 1 into v_revision
    from public.rota_weeks w
   where w.household_id = p_household and w.week_start = p_week_start;

  select array_agg(m.profile_id order by m.profile_id) into v_members
    from public.memberships m
   where m.household_id = p_household and m.left_at is null;

  if v_current is not null then
    update public.rota_weeks set superseded_at = p_now where id = v_current;
  end if;

  insert into public.rota_weeks (household_id, week_start, revision, reason, created_by, member_ids)
  values (p_household, p_week_start, v_revision, p_reason, p_created_by, coalesce(v_members, '{}'))
  returning id into v_week;

  for v_item in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    if coalesce(btrim(v_item ->> 'explanation'), '') = '' then
      raise exception 'invalid_assignment' using errcode = '22023';
    end if;
    begin
      v_due := (v_item ->> 'dueOn')::date;
      v_assignee := nullif(v_item ->> 'assignee', '')::uuid;
    exception when others then
      raise exception 'invalid_assignment' using errcode = '22023';
    end;
    if v_due is null or v_due < p_week_start or v_due > p_week_start + 6 then
      raise exception 'invalid_date' using errcode = '22023';
    end if;

    select * into v_chore
      from public.chores c
     where c.id = (v_item ->> 'choreId')::uuid and c.household_id = p_household and c.archived_at is null;
    if not found then
      raise exception 'chore_not_found' using errcode = 'P0002';
    end if;

    if v_assignee is not null then
      if not exists (
        select 1 from public.memberships m
         where m.household_id = p_household and m.profile_id = v_assignee and m.left_at is null
      ) then
        raise exception 'not_a_member' using errcode = 'P0001';
      end if;
      -- changed: away periods count as well as answers
      if private.rota_is_away(p_household, v_assignee, v_due) then
        raise exception 'assignee_unavailable' using errcode = 'P0001';
      end if;
    end if;

    insert into public.chore_assignments
      (household_id, rota_week_id, chore_id, chore_name, effort, needs_signoff, assignee, due_on, explanation)
    values
      (p_household, v_week, v_chore.id, v_chore.name, v_chore.effort, v_chore.needs_signoff, v_assignee, v_due,
       btrim(v_item ->> 'explanation'))
    returning id into v_assignment;

    insert into public.assignment_items (assignment_id, position, text)
    select v_assignment, i.position, i.text
      from public.chore_checklist_items i
     where i.chore_id = v_chore.id;

    if v_assignee is not null then
      insert into public.rotation_state (household_id, profile_id, chore_id, last_done_on)
      values (p_household, v_assignee, v_chore.id, v_due)
      on conflict (household_id, profile_id, chore_id)
      do update set last_done_on = greatest(public.rotation_state.last_done_on, excluded.last_done_on);
    end if;
  end loop;

  -- Owed turns: +1 for someone passed over, -1 once they have had the chore. Never outside 0 to 1.
  for r in
    select (o ->> 'profileId')::uuid as profile_id, (o ->> 'choreId')::uuid as chore_id, (o ->> 'delta')::int as delta
      from jsonb_array_elements(coalesce(p_owed, '[]'::jsonb)) o
  loop
    insert into public.rotation_state (household_id, profile_id, chore_id, owed_turns)
    values (p_household, r.profile_id, r.chore_id, greatest(0, least(1, r.delta)))
    on conflict (household_id, profile_id, chore_id)
    do update set owed_turns = greatest(0, least(1, public.rotation_state.owed_turns + r.delta));
  end loop;

  -- Tell people. Dedupe keys carry the revision, so a rebuild announces itself once and a retry never repeats.
  if p_reason in ('weekly', 'manual') then
    for r in select unnest(coalesce(v_members, '{}')) as profile_id loop
      perform private.notify(
        r.profile_id, p_household, 'rota_week_ready',
        'The rota for the week of ' || to_char(p_week_start, 'FMDD FMMon') || ' is ready',
        'Open the Rota to see your chores and why they are yours.',
        '/rota', 'rota_week:' || p_week_start || ':' || v_revision
      );
    end loop;

    for r in
      select a.assignee as profile_id,
             count(*) as n,
             string_agg(a.chore_name || ' on ' || to_char(a.due_on, 'FMDay'), ', ' order by a.due_on, a.chore_name) as what
        from public.chore_assignments a
       where a.rota_week_id = v_week and a.assignee is not null
       group by a.assignee
    loop
      perform private.notify(
        r.profile_id, p_household, 'chore_assigned',
        case when r.n = 1 then 'You have a chore this week' else 'You have ' || r.n || ' chores this week' end,
        left(r.what, 190), '/rota', 'chore_assigned:' || v_week || ':' || r.profile_id
      );
    end loop;

    for r in
      select a.id, a.chore_name, m.profile_id as admin_id
        from public.chore_assignments a
        join public.memberships m
          on m.household_id = p_household and m.left_at is null and m.role in ('owner', 'admin')
       where a.rota_week_id = v_week and a.assignee is null
    loop
      perform private.notify(
        r.admin_id, p_household, 'chore_unassigned',
        'Nobody is around for ' || r.chore_name,
        'No one is available for it this week. Give it to someone from the Rota.',
        '/rota', 'chore_unassigned:' || r.id
      );
    end loop;
  end if;

  return v_week;
end;
$$;


-- The scheduler input: availability has away days applied, and history says who was away.
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
            from private.rota_effective_availability(p_household, p_week, p_week + 6) a
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
               'away', private.rota_away_days(p_household, w.week_start),
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


-- Applying a rebuild: the wording depends on the kind.
create or replace function private.rota_apply_rebuild(p_now timestamptz, p_rebuild uuid, p_moves jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.rota_rebuilds%rowtype;
  v_item jsonb;
  v_old public.chore_assignments%rowtype;
  v_to uuid;
  v_new uuid;
  v_reason text;
  v_count integer := 0;
  v_unassigned integer := 0;
  v_name text;
  r record;
begin
  if jsonb_typeof(coalesce(p_moves, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_moves, '[]'::jsonb)) > 200 then
    raise exception 'invalid_move' using errcode = '22023';
  end if;

  select * into b from public.rota_rebuilds where id = p_rebuild for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if b.status <> 'pending' then
    return b.status;
  end if;
  -- One writer per flat at a time, in the same order store_week takes its locks.
  perform 1 from public.households where id = b.household_id for update;

  for v_item in select * from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) loop
    begin
      select * into v_old from public.chore_assignments where id = (v_item ->> 'taskId')::uuid for update;
      v_to := nullif(v_item ->> 'to', '')::uuid;
    exception when others then
      raise exception 'invalid_move' using errcode = '22023';
    end;
    v_reason := v_item ->> 'reason';
    if not found or v_old.household_id <> b.household_id or v_reason not in ('leaver', 'balance')
       or coalesce(btrim(v_item ->> 'explanation'), '') = '' then
      raise exception 'invalid_move' using errcode = '22023';
    end if;
    if v_old.superseded_at is not null or v_old.completed_at is not null then
      raise exception 'stale_move' using errcode = 'P0001';
    end if;
    if v_to is not null then
      if v_to = b.left_profile or not exists (
        select 1 from public.memberships m
         where m.household_id = b.household_id and m.profile_id = v_to and m.left_at is null
      ) then
        raise exception 'not_a_member' using errcode = 'P0001';
      end if;
      if private.rota_is_away(b.household_id, v_to, v_old.due_on) then
        raise exception 'assignee_unavailable' using errcode = 'P0001';
      end if;
    end if;

    v_new := private.rota_move_assignment(v_old.id, v_to, null, left(btrim(v_item ->> 'explanation'), 300));
    insert into public.rota_rebuild_moves (rebuild_id, old_assignment_id, new_assignment_id, from_profile, to_profile, reason)
    values (b.id, v_old.id, v_new, v_old.assignee, v_to, v_reason);
    v_count := v_count + 1;
    if v_to is null then
      v_unassigned := v_unassigned + 1;
    end if;
  end loop;

  if v_count = 0 then
    update public.rota_rebuilds set status = 'nothing', applied_at = p_now where id = b.id;
    return 'nothing';
  end if;

  update public.rota_rebuilds
     set status = 'applied', applied_at = p_now, undo_until = p_now + interval '24 hours',
         unassigned = v_unassigned
   where id = b.id;

  v_name := private.rota_name(b.left_profile);

  -- Everyone who received a chore, and every admin who can undo it, hears once.
  for r in
    select m.profile_id,
           coalesce((
             select string_agg(a.chore_name || ' on ' || to_char(a.due_on, 'FMDay'), ', ' order by a.due_on, a.chore_name)
               from public.rota_rebuild_moves mv
               join public.chore_assignments a on a.id = mv.new_assignment_id
              where mv.rebuild_id = b.id and mv.to_profile = m.profile_id
           ), '') as got,
           m.role in ('owner', 'admin') as is_admin
      from public.memberships m
     where m.household_id = b.household_id and m.left_at is null and m.profile_id <> b.left_profile
       and (m.role in ('owner', 'admin') or exists (
             select 1 from public.rota_rebuild_moves mv where mv.rebuild_id = b.id and mv.to_profile = m.profile_id))
  loop
    perform private.notify(
      r.profile_id, b.household_id, 'rota_rebuilt',
      v_name || case when b.kind = 'away' then ' is away, so ' else ' left, so ' end || v_count || case when v_count = 1 then ' chore was' else ' chores were' end || ' moved',
      case
        when r.got <> '' and r.is_admin then left('You now have ' || r.got || '. Admins can undo this for 24 hours from the Rota.', 190)
        when r.got <> '' then left('You now have ' || r.got || '.', 190)
        else 'Admins can undo this for 24 hours from the Rota.'
      end,
      '/rota', 'rota_rebuilt:' || b.id || ':' || r.profile_id
    );
  end loop;

  for r in
    select mv.new_assignment_id as id, a.chore_name, m.profile_id as admin_id
      from public.rota_rebuild_moves mv
      join public.chore_assignments a on a.id = mv.new_assignment_id
      join public.memberships m
        on m.household_id = b.household_id and m.left_at is null and m.role in ('owner', 'admin')
     where mv.rebuild_id = b.id and mv.to_profile is null
  loop
    perform private.notify(
      r.admin_id, b.household_id, 'chore_unassigned',
      'Nobody is around for ' || r.chore_name,
      'No one is available for it. Give it to someone from the Rota.',
      '/rota', 'chore_unassigned:' || r.id
    );
  end loop;

  return 'applied';
end;
$$;


-- Undo: for an away rebuild the chores go back to the person who is away.
create or replace function private.rota_undo_rebuild(p_now timestamptz, p_household uuid, p_caller uuid, p_rebuild uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.rota_rebuilds%rowtype;
  mv public.rota_rebuild_moves%rowtype;
  a public.chore_assignments%rowtype;
  v_restored integer := 0;
  v_kept integer := 0;
  r record;
begin
  select * into b from public.rota_rebuilds where id = p_rebuild and household_id = p_household for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if b.status = 'undone' then
    return jsonb_build_object('status', 'undone', 'restored', 0, 'kept', 0);
  end if;
  if b.status <> 'applied' then
    raise exception 'nothing_to_undo' using errcode = 'P0001';
  end if;
  if p_now > b.undo_until then
    raise exception 'undo_expired' using errcode = 'P0001';
  end if;
  perform 1 from public.households where id = b.household_id for update;

  for mv in select * from public.rota_rebuild_moves where rebuild_id = b.id order by created_at, id loop
    select * into a from public.chore_assignments where id = mv.new_assignment_id for update;
    if a.superseded_at is null and a.completed_at is null
       and mv.from_profile is not null
       and (b.kind = 'away' or mv.from_profile <> b.left_profile)
       and exists (
         select 1 from public.memberships m
          where m.household_id = b.household_id and m.profile_id = mv.from_profile and m.left_at is null
       ) then
      perform private.rota_move_assignment(
        a.id, mv.from_profile, p_caller, 'Put back after an admin undid the rota changes.');
      v_restored := v_restored + 1;
    else
      v_kept := v_kept + 1;
    end if;
  end loop;

  update public.rota_rebuilds set status = 'undone', undone_at = p_now, undone_by = p_caller where id = b.id;

  for r in
    select distinct x.profile_id
      from (
        select m.from_profile as profile_id from public.rota_rebuild_moves m where m.rebuild_id = b.id
        union
        select m.to_profile from public.rota_rebuild_moves m where m.rebuild_id = b.id
      ) x
      join public.memberships ms
        on ms.household_id = b.household_id and ms.profile_id = x.profile_id and ms.left_at is null
     where x.profile_id is not null and x.profile_id <> p_caller
  loop
    perform private.notify(
      r.profile_id, b.household_id, 'rota_rebuilt',
      'An admin put some chores back',
      'Some of the changes to the rota were undone. Open the Rota to see yours.',
      '/rota', 'rota_undo:' || b.id || ':' || r.profile_id
    );
  end loop;

  return jsonb_build_object('status', 'undone', 'restored', v_restored, 'kept', v_kept);
end;
$$;


-- The rebuild input: effective availability, the cause, and who was away in past weeks.
create or replace function private.rota_rebuild_input(p_now timestamptz, p_rebuild uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.rota_rebuilds%rowtype;
  v_today date := (p_now at time zone 'Europe/London')::date;
  v_week date := v_today - extract(dow from v_today)::int;
  v_remaining uuid[];
begin
  select * into b from public.rota_rebuilds where id = p_rebuild;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select array_agg(m.profile_id order by m.profile_id) into v_remaining
    from public.memberships m
   where m.household_id = b.household_id and m.left_at is null and m.profile_id <> b.left_profile;

  return jsonb_build_object(
    'leaver', b.left_profile,
    'leaverName', private.rota_name(b.left_profile),
    'cause', b.kind,
    'remaining', to_jsonb(coalesce(v_remaining, '{}')),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'choreId', a.chore_id, 'choreName', a.chore_name, 'effort', a.effort,
               'dueOn', a.due_on, 'assignee', a.assignee,
               'started', exists (select 1 from public.assignment_items i where i.assignment_id = a.id and i.done_at is not null),
               'locked', (a.due_on::timestamp at time zone 'Europe/London') < p_now + interval '24 hours'
                         or exists (select 1 from public.assignment_items i where i.assignment_id = a.id and i.done_at is not null)
             ) order by a.id)
        from public.chore_assignments a
       where a.household_id = b.household_id and a.superseded_at is null
         and a.completed_at is null and a.due_on >= v_today
         -- the person who is away only gives up the days they are away
         and (b.kind = 'left' or a.assignee is distinct from b.left_profile
              or private.rota_away_on(b.household_id, a.assignee, a.due_on))
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_object_agg(person, days)
        from (
          select av.profile_id as person, jsonb_object_agg(av.on_date, av.available) as days
            from private.rota_effective_availability(b.household_id, v_today, v_today + 31) av
           where av.profile_id = any (coalesce(v_remaining, '{}'))
           group by av.profile_id
        ) x
    ), '{}'::jsonb),
    'lastDone', coalesce((
      select jsonb_object_agg(person, chores)
        from (
          select s.profile_id as person, jsonb_object_agg(s.chore_id, s.last_done_on) as chores
            from public.rotation_state s
           where s.household_id = b.household_id and s.last_done_on is not null
           group by s.profile_id
        ) x
    ), '{}'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'members', to_jsonb(w.member_ids),
               'away', private.rota_away_days(b.household_id, w.week_start),
               'assignments', coalesce((
                 select jsonb_agg(jsonb_build_object('assignee', a.assignee, 'effort', a.effort))
                   from public.chore_assignments a
                  where a.rota_week_id = w.id and a.superseded_at is null
               ), '[]'::jsonb)) order by w.week_start)
        from public.rota_weeks w
       where w.household_id = b.household_id and w.superseded_at is null
         and w.week_start < v_week and w.week_start >= v_week - 26 * 7
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rota_rebuild_input(p_rebuild uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.rota_rebuild_input(now(), p_rebuild);
$$;

