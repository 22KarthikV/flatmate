-- Rota: weeks, assignments and ticks (SPEC-rota T8, T9, T11, T18, assumptions 5, 7 and 8).
--
-- The scheduler is TypeScript and pure; the database never decides who does what. It stores what the
-- scheduler returned, checks it again (the right people, the right days, nobody on a day they said
-- they are away), copies the chore templates into each assignment so a later template edit cannot
-- change what was handed out, keeps every revision, and lets the right people tick steps. Nothing is
-- deleted or rewritten: a rebuild is a new revision, and the older one is marked superseded.

-- ---------------------------------------------------------------------------------------------
-- Notification types. Push text is fixed here and never names a chore or a person.
insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('rota_week_ready', true, true, false),
  ('chore_assigned', true, true, false),
  ('chore_unassigned', true, false, false);

update public.notification_types set push_title = 'The rota is ready',
  push_body = 'Next week''s chores have been given out. Open FlatMate to see yours.'
 where type = 'rota_week_ready';
update public.notification_types set push_title = 'You have a chore',
  push_body = 'A chore was given to you. Open FlatMate to see it.'
 where type = 'chore_assigned';

-- ---------------------------------------------------------------------------------------------
-- Tables.
create table public.rota_weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  week_start date not null check (extract(dow from week_start) = 0),
  revision integer not null default 1 check (revision >= 1),
  -- weekly | manual | member_left | member_joined | undo
  reason text not null default 'weekly'
    check (reason in ('weekly', 'manual', 'member_left', 'member_joined', 'undo')),
  created_by uuid references public.profiles (id),
  -- Who was in the rota that week, so fair shares can be worked out later without guessing.
  member_ids uuid[] not null default '{}',
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rota_weeks_identity unique (household_id, week_start, revision)
);

-- At most one revision of a week is the current one.
create unique index rota_weeks_current on public.rota_weeks (household_id, week_start) where superseded_at is null;

create table public.chore_assignments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  rota_week_id uuid not null references public.rota_weeks (id),
  chore_id uuid not null references public.chores (id),
  chore_name text not null,
  effort smallint not null check (effort between 1 and 5),
  needs_signoff boolean not null default false,
  -- Null means nobody was around: admins are told, it is never silently dropped.
  assignee uuid references public.profiles (id),
  due_on date not null,
  explanation text not null check (char_length(explanation) between 1 and 300),
  -- Set on a swap or a reassignment: the row this one replaces, which is then superseded.
  replaces_id uuid references public.chore_assignments (id),
  superseded_at timestamptz,
  completed_at timestamptz,
  signed_off_by uuid references public.profiles (id),
  reopened_at timestamptz,
  reopened_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index chore_assignments_due on public.chore_assignments (household_id, due_on);
create index chore_assignments_person on public.chore_assignments (household_id, assignee, due_on);
create index chore_assignments_week on public.chore_assignments (rota_week_id);

create table public.assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.chore_assignments (id),
  position smallint not null,
  text text not null,
  done_at timestamptz,
  done_by uuid references public.profiles (id),
  unique (assignment_id, position),
  check ((done_at is null) = (done_by is null))
);

create table public.rotation_state (
  household_id uuid not null references public.households (id),
  profile_id uuid not null references public.profiles (id),
  chore_id uuid not null references public.chores (id),
  -- When this person last had this chore (for "longest ago").
  last_done_on date,
  -- 1 when they were passed over for it and should be next in line.
  owed_turns smallint not null default 0 check (owed_turns between 0 and 1),
  primary key (household_id, profile_id, chore_id)
);

comment on table public.rota_weeks is
  'One revision of a week''s rota. Never rewritten: a rebuild adds a revision and marks the old one superseded.';
comment on table public.chore_assignments is
  'A chore given to a person on a day, with the template''s name and effort copied in. Append-only apart from ticks.';
comment on table public.assignment_items is
  'The checklist copied into an assignment. Only ticks change.';
comment on table public.rotation_state is
  'What cannot be derived cheaply: when each person last had each chore, and who was passed over.';

-- ---------------------------------------------------------------------------------------------
-- Integrity that does not depend on who is writing.

-- An assignee must be an active member of the row's flat.
create or replace function private.rota_check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee is not null and not exists (
    select 1 from public.memberships
     where household_id = new.household_id and profile_id = new.assignee and left_at is null
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger chore_assignments_assignee before insert on public.chore_assignments
  for each row execute function private.rota_check_assignee();

-- History is never rewritten: only ticks, completion, sign-off, reopening and "superseded" change.
create or replace function private.rota_guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'completed_at' - 'signed_off_by' - 'reopened_at' - 'reopened_by' - 'superseded_at')
       = (to_jsonb(old) - 'completed_at' - 'signed_off_by' - 'reopened_at' - 'reopened_by' - 'superseded_at') then
    return new;
  end if;
  raise exception 'rota_is_append_only' using errcode = 'P0001';
end;
$$;

create or replace function private.rota_guard_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'done_at' - 'done_by') = (to_jsonb(old) - 'done_at' - 'done_by') then
    return new;
  end if;
  raise exception 'rota_is_append_only' using errcode = 'P0001';
end;
$$;

create or replace function private.rota_guard_week()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'superseded_at') = (to_jsonb(old) - 'superseded_at') then
    return new;
  end if;
  raise exception 'rota_is_append_only' using errcode = 'P0001';
end;
$$;

create or replace function private.rota_refuse_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'rota_is_append_only' using errcode = 'P0001';
end;
$$;

create trigger chore_assignments_append_only before update or delete on public.chore_assignments
  for each row execute function private.rota_guard_assignment();
create trigger assignment_items_append_only before update or delete on public.assignment_items
  for each row execute function private.rota_guard_item();
create trigger rota_weeks_append_only before update or delete on public.rota_weeks
  for each row execute function private.rota_guard_week();
create trigger chore_assignments_no_truncate before truncate on public.chore_assignments
  for each statement execute function private.rota_refuse_change();
create trigger assignment_items_no_truncate before truncate on public.assignment_items
  for each statement execute function private.rota_refuse_change();
create trigger rota_weeks_no_truncate before truncate on public.rota_weeks
  for each statement execute function private.rota_refuse_change();

revoke all on function private.rota_check_assignee() from public, anon, authenticated;
revoke all on function private.rota_guard_assignment() from public, anon, authenticated;
revoke all on function private.rota_guard_item() from public, anon, authenticated;
revoke all on function private.rota_guard_week() from public, anon, authenticated;
revoke all on function private.rota_refuse_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security: members of a flat read it. No write policies and no write grants.
alter table public.rota_weeks enable row level security;
alter table public.chore_assignments enable row level security;
alter table public.assignment_items enable row level security;
alter table public.rotation_state enable row level security;

revoke all on public.rota_weeks, public.chore_assignments, public.assignment_items, public.rotation_state
  from anon, authenticated;
grant select on public.rota_weeks, public.chore_assignments, public.assignment_items, public.rotation_state
  to authenticated;

create policy rota_weeks_select_members on public.rota_weeks
  for select to authenticated using ((select authz.is_household_member(household_id)));
create policy chore_assignments_select_members on public.chore_assignments
  for select to authenticated using ((select authz.is_household_member(household_id)));
create policy rotation_state_select_members on public.rotation_state
  for select to authenticated using ((select authz.is_household_member(household_id)));
create policy assignment_items_select_members on public.assignment_items
  for select to authenticated
  using (exists (
    select 1 from public.chore_assignments a
     where a.id = assignment_id and (select authz.is_household_member(a.household_id))
  ));

-- ---------------------------------------------------------------------------------------------
-- Storing a week. p_assignments is a json array of
--   {choreId, assignee (a profile id or null), dueOn, explanation}
-- and p_owed an array of {profileId, choreId, delta}. p_now is a parameter so tests can move
-- through time; the public wrapper passes now().
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
      if exists (
        select 1 from public.availability a
         where a.household_id = p_household and a.profile_id = v_assignee
           and a.on_date = v_due and not a.available
      ) then
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

revoke all on function private.rota_store_week(timestamptz, uuid, date, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;

-- An owner or admin stores a week the app's scheduler produced ("Generate now"). Only 'weekly' (the
-- first generation) and 'manual' (a deliberate rebuild) can come from the browser.
create or replace function public.store_rota_week(
  p_week_start date,
  p_assignments jsonb,
  p_owed jsonb default '[]'::jsonb,
  p_reason text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.rota_admin_household();
begin
  if p_reason not in ('weekly', 'manual') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  return private.rota_store_week(
    now(), v_household, p_week_start, p_reason, (select authz.current_profile_id()), p_assignments, p_owed
  );
end;
$$;

revoke all on function public.store_rota_week(date, jsonb, jsonb, text) from public, anon;
grant execute on function public.store_rota_week(date, jsonb, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ticking. The assignee or an owner or admin may tick; a step can be unticked by whoever ticked it
-- or an admin; finishing the last step completes the chore, and unticking reopens it and says who.

-- The assignment, its flat and whether the caller is an admin there; raises if the caller is not in the flat.
create or replace function private.rota_caller_context(p_assignment uuid)
returns table (assignment_id uuid, assignee uuid, caller uuid, is_admin boolean, is_current boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
begin
  return query
  select a.id, a.assignee, v_caller,
         (m.role in ('owner', 'admin')),
         (a.superseded_at is null and w.superseded_at is null)
    from public.chore_assignments a
    join public.rota_weeks w on w.id = a.rota_week_id
    join public.memberships m on m.household_id = a.household_id and m.profile_id = v_caller and m.left_at is null
   where a.id = p_assignment;
  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function private.rota_caller_context(uuid) from public, anon, authenticated;

create or replace function public.tick_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment uuid;
  ctx record;
begin
  select i.assignment_id into v_assignment from public.assignment_items i where i.id = p_item_id;
  if v_assignment is null then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
  select * into ctx from private.rota_caller_context(v_assignment);
  if not (ctx.assignee = ctx.caller or ctx.is_admin) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not ctx.is_current then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;

  update public.assignment_items
     set done_at = coalesce(done_at, now()), done_by = coalesce(done_by, ctx.caller)
   where id = p_item_id;

  if not exists (select 1 from public.assignment_items where assignment_id = v_assignment and done_at is null) then
    update public.chore_assignments set completed_at = coalesce(completed_at, now()) where id = v_assignment;
  end if;
end;
$$;

create or replace function public.untick_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment uuid;
  v_done_by uuid;
  ctx record;
begin
  select i.assignment_id, i.done_by into v_assignment, v_done_by from public.assignment_items i where i.id = p_item_id;
  if v_assignment is null then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
  select * into ctx from private.rota_caller_context(v_assignment);
  if not (v_done_by = ctx.caller or ctx.is_admin) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not ctx.is_current then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;

  update public.assignment_items set done_at = null, done_by = null where id = p_item_id;
  update public.chore_assignments
     set completed_at = null, signed_off_by = null, reopened_at = now(), reopened_by = ctx.caller
   where id = v_assignment and completed_at is not null;
end;
$$;

-- A chore with no steps is finished in one go; one with steps is finished by ticking them.
create or replace function public.complete_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
begin
  select * into ctx from private.rota_caller_context(p_assignment_id);
  if not (ctx.assignee = ctx.caller or ctx.is_admin) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not ctx.is_current then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.assignment_items where assignment_id = p_assignment_id) then
    raise exception 'has_checklist' using errcode = 'P0001';
  end if;
  update public.chore_assignments set completed_at = coalesce(completed_at, now()) where id = p_assignment_id;
end;
$$;

-- Reopens a finished chore (assumption 8): the assignee or an admin; the last step is unticked so
-- there is something to do again, and the record says who reopened it.
create or replace function public.reopen_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_last uuid;
begin
  select * into ctx from private.rota_caller_context(p_assignment_id);
  if not (ctx.assignee = ctx.caller or ctx.is_admin) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not ctx.is_current then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.chore_assignments where id = p_assignment_id and completed_at is not null) then
    raise exception 'not_completed' using errcode = 'P0001';
  end if;

  select i.id into v_last
    from public.assignment_items i
   where i.assignment_id = p_assignment_id and i.done_at is not null
   order by i.position desc limit 1;
  if v_last is not null then
    update public.assignment_items set done_at = null, done_by = null where id = v_last;
  end if;
  update public.chore_assignments
     set completed_at = null, signed_off_by = null, reopened_at = now(), reopened_by = ctx.caller
   where id = p_assignment_id;
end;
$$;

-- Another flatmate confirms a finished chore, only for chores that ask for it (T13).
create or replace function public.sign_off_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  a public.chore_assignments%rowtype;
begin
  select * into ctx from private.rota_caller_context(p_assignment_id);
  select * into a from public.chore_assignments where id = p_assignment_id;
  if not a.needs_signoff then
    raise exception 'no_signoff_needed' using errcode = 'P0001';
  end if;
  if a.completed_at is null then
    raise exception 'not_completed' using errcode = 'P0001';
  end if;
  if a.signed_off_by is not null then
    return;
  end if;
  if ctx.assignee = ctx.caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not ctx.is_current then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;
  update public.chore_assignments set signed_off_by = ctx.caller where id = p_assignment_id;
end;
$$;

revoke all on function public.tick_item(uuid) from public, anon;
revoke all on function public.untick_item(uuid) from public, anon;
revoke all on function public.complete_assignment(uuid) from public, anon;
revoke all on function public.reopen_assignment(uuid) from public, anon;
revoke all on function public.sign_off_assignment(uuid) from public, anon;
grant execute on function public.tick_item(uuid) to authenticated;
grant execute on function public.untick_item(uuid) to authenticated;
grant execute on function public.complete_assignment(uuid) to authenticated;
grant execute on function public.reopen_assignment(uuid) to authenticated;
grant execute on function public.sign_off_assignment(uuid) to authenticated;
