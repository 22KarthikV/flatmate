-- Rota: when someone leaves (SPEC-rota T15, T16).
--
-- A trigger on memberships notices that left_at was set, whichever path set it (leaving, being
-- removed, or account deletion), and records a "rebuild needed" row. It does nothing else, so none
-- of those functions is edited and a problem in the rota can never stop someone leaving. The
-- scheduler logic is TypeScript, so the rota-generate Edge Function (also run every ten minutes by
-- the rota-rebalance job) reads the inputs, runs the pure rebalance, and hands the moves back here.
--
-- Nothing is rewritten. Each chore that moves becomes a new assignment pointing at the old one
-- (ticks carried over), exactly as a swap does, and every move is recorded against the rebuild.
-- Chores that start within 24 hours, or have been started, are locked: only the leaver's own are
-- moved. An admin can undo for 24 hours. Flats with no active chore are left alone.

insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('rota_rebuilt', true, true, false);

update public.notification_types set push_title = 'Some chores were moved',
  push_body = 'A flatmate left and the rota was updated. Open FlatMate to see what changed.'
 where type = 'rota_rebuilt';

-- ---------------------------------------------------------------------------------------------
create table public.rota_rebuilds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  left_profile uuid not null references public.profiles (id),
  left_reason text,
  requested_at timestamptz not null default now(),
  -- pending: waiting for the job. applied: chores moved. nothing: there was nothing to move.
  -- undone: an admin put things back.
  status text not null default 'pending' check (status in ('pending', 'applied', 'nothing', 'undone')),
  applied_at timestamptz,
  undo_until timestamptz,
  undone_at timestamptz,
  undone_by uuid references public.profiles (id),
  -- Chores nobody was around to take, which admins were told about.
  unassigned integer not null default 0,
  check ((status = 'pending') = (applied_at is null)),
  check ((status = 'undone') = (undone_at is not null))
);

-- A person leaves a flat once per membership row, so one rebuild per leaving.
create unique index rota_rebuilds_once on public.rota_rebuilds (household_id, left_profile, requested_at);
create index rota_rebuilds_pending on public.rota_rebuilds (requested_at) where status = 'pending';
create index rota_rebuilds_household on public.rota_rebuilds (household_id, requested_at desc);

create table public.rota_rebuild_moves (
  id uuid primary key default gen_random_uuid(),
  rebuild_id uuid not null references public.rota_rebuilds (id),
  old_assignment_id uuid not null references public.chore_assignments (id),
  new_assignment_id uuid not null references public.chore_assignments (id),
  from_profile uuid references public.profiles (id),
  to_profile uuid references public.profiles (id),
  -- leaver: the leaver's own chore. balance: moved to even things out.
  reason text not null check (reason in ('leaver', 'balance')),
  created_at timestamptz not null default now(),
  unique (rebuild_id, old_assignment_id)
);

create index rota_rebuild_moves_rebuild on public.rota_rebuild_moves (rebuild_id);

comment on table public.rota_rebuilds is
  'One row per person who left a flat that uses the rota. Written by a trigger on memberships; the rota-generate job applies it.';
comment on table public.rota_rebuild_moves is
  'Every chore a rebuild moved, with the new and old assignment rows, so an admin can undo it.';

alter table public.rota_rebuilds enable row level security;
alter table public.rota_rebuild_moves enable row level security;
revoke all on public.rota_rebuilds, public.rota_rebuild_moves from anon, authenticated;
grant select on public.rota_rebuilds, public.rota_rebuild_moves to authenticated;

create policy rota_rebuilds_select_members on public.rota_rebuilds
  for select to authenticated using ((select authz.is_household_member(household_id)));
create policy rota_rebuild_moves_select_members on public.rota_rebuild_moves
  for select to authenticated
  using (exists (
    select 1 from public.rota_rebuilds b
     where b.id = rebuild_id and (select authz.is_household_member(b.household_id))
  ));

create or replace function private.rota_rebuild_moves_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'rota_rebuild_moves is append-only' using errcode = '42501';
end;
$$;

create trigger rota_rebuild_moves_append_only before update or delete on public.rota_rebuild_moves
  for each row execute function private.rota_rebuild_moves_guard();
create trigger rota_rebuild_moves_no_truncate before truncate on public.rota_rebuild_moves
  for each statement execute function private.rota_rebuild_moves_guard();

-- ---------------------------------------------------------------------------------------------
-- The trigger. Only flats that use the rota (an active chore) and only when the leaver holds an
-- unfinished chore from today on. A closed flat has nothing to rebalance.
create or replace function private.rota_note_member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  if new.left_reason = 'flat_closed' then
    return new;
  end if;
  if not exists (
    select 1 from public.chores c where c.household_id = new.household_id and c.archived_at is null
  ) then
    return new;
  end if;
  if not exists (
    select 1 from public.chore_assignments a
     where a.household_id = new.household_id and a.assignee = new.profile_id
       and a.superseded_at is null and a.completed_at is null and a.due_on >= v_today
  ) then
    return new;
  end if;
  insert into public.rota_rebuilds (household_id, left_profile, left_reason)
  values (new.household_id, new.profile_id, new.left_reason);
  return new;
end;
$$;

revoke all on function private.rota_note_member_left() from public, anon, authenticated;

create trigger rota_note_member_left after update of left_at on public.memberships
  for each row when (old.left_at is null and new.left_at is not null)
  execute function private.rota_note_member_left();

-- ---------------------------------------------------------------------------------------------
-- A move to nobody leaves the chore unassigned, so the rotation record is only kept for a person.
create or replace function private.rota_move_assignment(
  p_old uuid, p_to uuid, p_changed_by uuid, p_explanation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.chore_assignments%rowtype;
  v_new uuid;
begin
  select * into o from public.chore_assignments where id = p_old for update;

  insert into public.chore_assignments
    (household_id, rota_week_id, chore_id, chore_name, effort, needs_signoff, assignee, due_on,
     explanation, replaces_id, changed_by)
  values
    (o.household_id, o.rota_week_id, o.chore_id, o.chore_name, o.effort, o.needs_signoff, p_to, o.due_on,
     p_explanation, o.id, p_changed_by)
  returning id into v_new;

  insert into public.assignment_items (assignment_id, position, text, done_at, done_by)
  select v_new, i.position, i.text, i.done_at, i.done_by
    from public.assignment_items i where i.assignment_id = o.id;

  update public.chore_assignments set superseded_at = now() where id = o.id;

  update public.swap_requests set status = 'cancelled', decided_at = now()
   where assignment_id = o.id and status = 'pending';

  if p_to is not null then
    insert into public.rotation_state (household_id, profile_id, chore_id, last_done_on)
    values (o.household_id, p_to, o.chore_id, o.due_on)
    on conflict (household_id, profile_id, chore_id)
    do update set last_done_on = greatest(public.rotation_state.last_done_on, excluded.last_done_on);
  end if;

  return v_new;
end;
$$;

revoke all on function private.rota_move_assignment(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- What the job reads. service_role only.
create or replace function public.rota_pending_rebuilds()
returns table (rebuild_id uuid, household_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.household_id from public.rota_rebuilds b
   where b.status = 'pending'
   order by b.requested_at, b.id
   limit 50;
$$;

-- Everything the pure rebalance needs for one rebuild, as json. A chore is locked when its day starts
-- within 24 hours of p_now (a chore due today has started) or someone has ticked a step.
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
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_object_agg(person, days)
        from (
          select av.profile_id as person, jsonb_object_agg(av.on_date, av.available) as days
            from public.availability av
           where av.household_id = b.household_id and av.on_date >= v_today
             and av.profile_id = any (coalesce(v_remaining, '{}'))
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

revoke all on function private.rota_rebuild_input(timestamptz, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Applying a rebuild. p_moves is a json array of {taskId, to (a profile id or null), reason, explanation}.
-- Safe to run twice: only a pending rebuild does anything. If anything is stale (a chore finished or
-- moved since the inputs were read) the whole call fails and the job tries again with fresh inputs.
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
      v_name || ' left, so ' || v_count || case when v_count = 1 then ' chore was' else ' chores were' end || ' moved',
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

revoke all on function private.rota_apply_rebuild(timestamptz, uuid, jsonb) from public, anon, authenticated;

create or replace function public.rota_apply_rebuild(p_rebuild uuid, p_moves jsonb)
returns text
language sql
security definer
set search_path = ''
as $$
  select private.rota_apply_rebuild(now(), p_rebuild, p_moves);
$$;

revoke all on function public.rota_pending_rebuilds() from public, anon, authenticated;
revoke all on function public.rota_rebuild_input(uuid) from public, anon, authenticated;
revoke all on function public.rota_apply_rebuild(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rota_pending_rebuilds() to service_role;
grant execute on function public.rota_rebuild_input(uuid) to service_role;
grant execute on function public.rota_apply_rebuild(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Undo, for an owner or admin, within 24 hours. A chore goes back to the person it came from when
-- that person is still in the flat and the chore has not been finished or moved again since. The
-- leaver's own chores cannot go back to someone who is no longer there, so they stay put.
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
       and mv.from_profile <> b.left_profile
       and exists (
         select 1 from public.memberships m
          where m.household_id = b.household_id and m.profile_id = mv.from_profile and m.left_at is null
       ) then
      perform private.rota_move_assignment(
        a.id, mv.from_profile, p_caller, 'Put back after an admin undid the changes made when ' || private.rota_name(b.left_profile) || ' left.');
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
      'The changes made after ' || private.rota_name(b.left_profile) || ' left were partly undone. Open the Rota to see yours.',
      '/rota', 'rota_undo:' || b.id || ':' || r.profile_id
    );
  end loop;

  return jsonb_build_object('status', 'undone', 'restored', v_restored, 'kept', v_kept);
end;
$$;

revoke all on function private.rota_undo_rebuild(timestamptz, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.undo_rota_rebuild(p_rebuild uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.rota_admin_household();
begin
  return private.rota_undo_rebuild(now(), v_household, authz.current_profile_id(), p_rebuild);
end;
$$;

revoke all on function public.undo_rota_rebuild(uuid) from public, anon;
grant execute on function public.undo_rota_rebuild(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The same Edge Function that generates weeks also applies rebuilds. Every ten minutes keeps the
-- wait short; with nothing pending it does no work.
select private.register_edge_job('rota-rebalance', '*/10 * * * *', 'rota-generate');
