-- Rota: fairness counts effort that was done, not effort that was handed out.
--
-- Until now a skipped chore still counted as work the person had "taken", so skipping cost nothing.
-- From now on the scheduler is told which past assignments were done. Two new ways to close an old
-- chore without doing it:
--   * covered: the same person did the same chore in a later week, which cleaned the same thing.
--     It closes the old chore with no credit, so one real clean earns credit once.
--   * excused: an owner or admin accepts illness or an emergency; it counts as done for fairness.
-- Both are set by functions that check the caller. Nothing is deleted or rewritten.

alter table public.chore_assignments
  add column covered_at timestamptz,
  add column covered_by uuid references public.chore_assignments (id),
  add column excused_at timestamptz,
  add column excused_by uuid references public.profiles (id),
  add constraint chore_assignments_covered_pair check ((covered_at is null) = (covered_by is null)),
  add constraint chore_assignments_excused_pair check ((excused_at is null) = (excused_by is null));

comment on column public.chore_assignments.covered_by is
  'The later assignment of the same chore that cleaned the same thing. Closes this one with no credit.';
comment on column public.chore_assignments.excused_by is
  'The owner or admin who excused an unfinished chore. It counts as done for fairness.';

-- Only ticks, completion, sign-off, reopening, covering, excusing and "superseded" change.
create or replace function private.rota_guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'completed_at' - 'signed_off_by' - 'reopened_at' - 'reopened_by' - 'superseded_at'
          - 'covered_at' - 'covered_by' - 'excused_at' - 'excused_by')
       = (to_jsonb(old) - 'completed_at' - 'signed_off_by' - 'reopened_at' - 'reopened_by' - 'superseded_at'
          - 'covered_at' - 'covered_by' - 'excused_at' - 'excused_by') then
    return new;
  end if;
  raise exception 'rota_is_append_only' using errcode = 'P0001';
end;
$$;


-- Whether an assignment counts as effort done: finished and not covered, or excused.
create or replace function private.rota_assignment_done(a public.chore_assignments)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select a.excused_at is not null or (a.completed_at is not null and a.covered_at is null);
$$;

revoke all on function private.rota_assignment_done(public.chore_assignments) from public, anon, authenticated;


-- The weeks the scheduler learns fairness from: each assignment says whether it was done.
create or replace function private.rota_history(p_household uuid, p_before date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'members', to_jsonb(w.member_ids),
           'away', private.rota_away_days(p_household, w.week_start),
           'assignments', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'assignee', a.assignee, 'effort', a.effort, 'done', private.rota_assignment_done(a)))
               from public.chore_assignments a
              where a.rota_week_id = w.id and a.superseded_at is null
           ), '[]'::jsonb)) order by w.week_start), '[]'::jsonb)
    from public.rota_weeks w
   where w.household_id = p_household and w.superseded_at is null
     and w.week_start < p_before and w.week_start >= p_before - 26 * 7;
$$;

revoke all on function private.rota_history(uuid, date) from public, anon, authenticated;


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
    'history', private.rota_history(p_household, p_week)
  );
$$;


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
    'history', private.rota_history(b.household_id, v_week)
  );
end;
$$;


-- ---------------------------------------------------------------------------------------------
-- Closing an old chore.

-- The Sunday of the week that contains p_now, London time.
create or replace function private.rota_week_of(p_now timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((p_now at time zone 'Europe/London')::date - extract(dow from (p_now at time zone 'Europe/London')::date)::int);
$$;

revoke all on function private.rota_week_of(timestamptz) from public, anon, authenticated;

-- The same person did the same chore in a later week. It closes the old one with no credit.
create or replace function private.rota_cover(p_now timestamptz, p_old uuid, p_new uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  o public.chore_assignments%rowtype;
  n public.chore_assignments%rowtype;
begin
  select * into ctx from private.rota_caller_context(p_old);
  if not (ctx.assignee = ctx.caller or ctx.is_admin) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not ctx.is_current then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;

  select * into o from public.chore_assignments where id = p_old for update;
  select * into n from public.chore_assignments where id = p_new for update;
  if not found or n.household_id <> o.household_id then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
  if o.completed_at is not null or o.covered_at is not null or o.excused_at is not null
     or o.due_on >= private.rota_week_of(p_now) then
    raise exception 'not_overdue' using errcode = 'P0001';
  end if;
  if n.superseded_at is not null or n.covered_at is not null or n.chore_id <> o.chore_id
     or n.assignee is distinct from o.assignee or n.due_on <= o.due_on or n.id = o.id then
    raise exception 'cannot_cover' using errcode = 'P0001';
  end if;

  update public.chore_assignments set covered_at = p_now, covered_by = n.id where id = o.id;
end;
$$;

revoke all on function private.rota_cover(timestamptz, uuid, uuid) from public, anon, authenticated;

create or replace function public.cover_assignment(p_assignment_id uuid, p_covered_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.rota_cover(now(), p_assignment_id, p_covered_by);
end;
$$;

-- An owner or admin accepts that an unfinished chore could not be done. It counts as done.
create or replace function private.rota_excuse(p_now timestamptz, p_assignment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  o public.chore_assignments%rowtype;
begin
  select * into ctx from private.rota_caller_context(p_assignment);
  if not ctx.is_admin then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not ctx.is_current then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;
  select * into o from public.chore_assignments where id = p_assignment for update;
  if o.completed_at is not null or o.covered_at is not null or o.excused_at is not null
     or o.due_on >= private.rota_week_of(p_now) then
    raise exception 'not_overdue' using errcode = 'P0001';
  end if;
  update public.chore_assignments set excused_at = p_now, excused_by = ctx.caller where id = o.id;
end;
$$;

revoke all on function private.rota_excuse(timestamptz, uuid) from public, anon, authenticated;

create or replace function public.excuse_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.rota_excuse(now(), p_assignment_id);
end;
$$;

revoke all on function public.cover_assignment(uuid, uuid) from public, anon;
revoke all on function public.excuse_assignment(uuid) from public, anon;
grant execute on function public.cover_assignment(uuid, uuid) to authenticated;
grant execute on function public.excuse_assignment(uuid) to authenticated;
