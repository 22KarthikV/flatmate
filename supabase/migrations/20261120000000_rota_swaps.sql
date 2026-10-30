-- Rota: swaps and admin reassignment (SPEC-rota T12).
--
-- One person asks another to take a chore (or to exchange it for one of theirs). Only an accepted
-- swap changes anything, and it never lands a chore on a day the new person marked away. Nothing is
-- rewritten: the old assignment is marked replaced and a new row, pointing back at it, takes its
-- place, so history and fairness stay honest. An admin can move a chore directly (even to someone
-- who is away that day) and their name goes on the record.

insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('swap_requested', true, true, false),
  ('swap_decided', true, false, false);

update public.notification_types set push_title = 'A swap request',
  push_body = 'A flatmate asked to swap a chore with you. Open FlatMate to answer.'
 where type = 'swap_requested';

-- Who moved it: the person who accepted a swap, or the admin who reassigned it.
alter table public.chore_assignments add column changed_by uuid references public.profiles (id);

create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  assignment_id uuid not null references public.chore_assignments (id),
  from_profile uuid not null references public.profiles (id),
  to_profile uuid not null references public.profiles (id),
  -- Set for an exchange: the other person's chore the asker takes in return.
  in_return_id uuid references public.chore_assignments (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (from_profile <> to_profile),
  check (in_return_id is null or in_return_id <> assignment_id),
  check ((status = 'pending') = (decided_at is null))
);

-- A chore has at most one open request.
create unique index swap_requests_one_open on public.swap_requests (assignment_id) where status = 'pending';
create index swap_requests_to on public.swap_requests (to_profile) where status = 'pending';
create index swap_requests_household on public.swap_requests (household_id, created_at desc);

comment on table public.swap_requests is
  'A request to swap a chore. Only an accepted one changes anything, by adding a new assignment.';

alter table public.swap_requests enable row level security;
revoke all on public.swap_requests from anon, authenticated;
grant select on public.swap_requests to authenticated;
create policy swap_requests_select_members on public.swap_requests
  for select to authenticated using ((select authz.is_household_member(household_id)));

-- ---------------------------------------------------------------------------------------------
-- Moving an assignment to someone else: a new row takes over (checklist and ticks come with it), the
-- old one is marked replaced, and any request still open on it lapses. Returns the new assignment.
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

  insert into public.rotation_state (household_id, profile_id, chore_id, last_done_on)
  values (o.household_id, p_to, o.chore_id, o.due_on)
  on conflict (household_id, profile_id, chore_id)
  do update set last_done_on = greatest(public.rotation_state.last_done_on, excluded.last_done_on);

  return v_new;
end;
$$;

revoke all on function private.rota_move_assignment(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Is this person marked away on that date?
create or replace function private.rota_is_away(p_household uuid, p_profile uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.availability a
     where a.household_id = p_household and a.profile_id = p_profile
       and a.on_date = p_date and not a.available
  );
$$;

revoke all on function private.rota_is_away(uuid, uuid, date) from public, anon, authenticated;

create or replace function private.rota_name(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select display_name from public.profiles where id = p_profile), 'Someone');
$$;

revoke all on function private.rota_name(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
create or replace function public.request_swap(
  p_assignment_id uuid,
  p_to_profile uuid,
  p_in_return_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  a public.chore_assignments%rowtype;
  r public.chore_assignments%rowtype;
  v_swap uuid;
begin
  select * into ctx from private.rota_caller_context(p_assignment_id);
  if ctx.assignee is distinct from ctx.caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not ctx.is_current then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;
  select * into a from public.chore_assignments where id = p_assignment_id;
  if a.completed_at is not null then
    raise exception 'already_completed' using errcode = 'P0001';
  end if;
  if p_to_profile is null or p_to_profile = ctx.caller then
    raise exception 'invalid_recipient' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.household_id = a.household_id and m.profile_id = p_to_profile and m.left_at is null
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.swap_requests s where s.assignment_id = a.id and s.status = 'pending') then
    raise exception 'swap_pending' using errcode = 'P0001';
  end if;
  if private.rota_is_away(a.household_id, p_to_profile, a.due_on) then
    raise exception 'assignee_unavailable' using errcode = 'P0001';
  end if;

  if p_in_return_id is not null then
    select * into r from public.chore_assignments where id = p_in_return_id;
    if not found or r.household_id <> a.household_id or r.assignee is distinct from p_to_profile
       or r.superseded_at is not null or r.completed_at is not null
       or exists (select 1 from public.rota_weeks w where w.id = r.rota_week_id and w.superseded_at is not null) then
      raise exception 'invalid_exchange' using errcode = 'P0001';
    end if;
    if private.rota_is_away(a.household_id, ctx.caller, r.due_on) then
      raise exception 'assignee_unavailable' using errcode = 'P0001';
    end if;
  end if;

  insert into public.swap_requests (household_id, assignment_id, from_profile, to_profile, in_return_id)
  values (a.household_id, a.id, ctx.caller, p_to_profile, p_in_return_id)
  returning id into v_swap;

  perform private.notify(
    p_to_profile, a.household_id, 'swap_requested',
    private.rota_name(ctx.caller) || ' asked to swap a chore with you',
    case when r.id is null
      then a.chore_name || ' on ' || to_char(a.due_on, 'FMDay') || ', for you to take.'
      else a.chore_name || ' on ' || to_char(a.due_on, 'FMDay') || ' for your ' || r.chore_name
           || ' on ' || to_char(r.due_on, 'FMDay') || '.'
    end,
    '/rota/assignments/' || a.id, 'swap_requested:' || v_swap
  );
  return v_swap;
end;
$$;

-- The person asked accepts or declines. Returns 'accepted', 'declined' or 'cancelled' (the chore had
-- already moved, finished or been replaced, so there is nothing left to swap).
create or replace function public.decide_swap(p_swap_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  s public.swap_requests%rowtype;
  a public.chore_assignments%rowtype;
  r public.chore_assignments%rowtype;
  v_ok boolean;
begin
  select * into s from public.swap_requests where id = p_swap_id for update;
  if not found or not exists (
    select 1 from public.memberships m
     where m.household_id = s.household_id and m.profile_id = v_caller and m.left_at is null
  ) then
    raise exception 'swap_not_found' using errcode = 'P0002';
  end if;
  if s.to_profile <> v_caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if s.status <> 'pending' then
    raise exception 'swap_not_pending' using errcode = 'P0001';
  end if;

  select * into a from public.chore_assignments where id = s.assignment_id;
  if not p_accept then
    update public.swap_requests set status = 'declined', decided_at = now() where id = s.id;
    perform private.notify(
      s.from_profile, s.household_id, 'swap_decided',
      private.rota_name(v_caller) || ' declined your swap',
      a.chore_name || ' on ' || to_char(a.due_on, 'FMDay') || ' stays with you.',
      '/rota/assignments/' || a.id, 'swap_decided:' || s.id
    );
    return 'declined';
  end if;

  -- Still possible? The chore is still the asker's, current and unfinished; both people are still in.
  v_ok := a.assignee = s.from_profile and a.superseded_at is null and a.completed_at is null
    and not exists (select 1 from public.rota_weeks w where w.id = a.rota_week_id and w.superseded_at is not null)
    and exists (select 1 from public.memberships m where m.household_id = s.household_id and m.profile_id = s.from_profile and m.left_at is null);
  if v_ok and s.in_return_id is not null then
    select * into r from public.chore_assignments where id = s.in_return_id;
    v_ok := r.assignee = v_caller and r.superseded_at is null and r.completed_at is null
      and not exists (select 1 from public.rota_weeks w where w.id = r.rota_week_id and w.superseded_at is not null);
  end if;
  if not v_ok then
    update public.swap_requests set status = 'cancelled', decided_at = now() where id = s.id;
    return 'cancelled';
  end if;

  -- Never onto a day someone is away.
  if private.rota_is_away(s.household_id, v_caller, a.due_on)
     or (r.id is not null and private.rota_is_away(s.household_id, s.from_profile, r.due_on)) then
    raise exception 'assignee_unavailable' using errcode = 'P0001';
  end if;

  update public.swap_requests set status = 'accepted', decided_at = now() where id = s.id;
  perform private.rota_move_assignment(
    a.id, v_caller, v_caller,
    'Swapped: ' || private.rota_name(s.from_profile) || ' asked you to take it, and you agreed.'
  );
  if r.id is not null then
    perform private.rota_move_assignment(
      r.id, s.from_profile, v_caller,
      'Swapped: ' || private.rota_name(v_caller) || ' took ' || a.chore_name || ' from you in exchange.'
    );
  end if;
  perform private.notify(
    s.from_profile, s.household_id, 'swap_decided',
    private.rota_name(v_caller) || ' accepted your swap',
    case when r.id is null
      then a.chore_name || ' on ' || to_char(a.due_on, 'FMDay') || ' is theirs now.'
      else 'You now have ' || r.chore_name || ' on ' || to_char(r.due_on, 'FMDay') || '.'
    end,
    '/rota', 'swap_decided:' || s.id
  );
  return 'accepted';
end;
$$;

create or replace function public.cancel_swap(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  s public.swap_requests%rowtype;
begin
  select * into s from public.swap_requests where id = p_swap_id for update;
  if not found or not exists (
    select 1 from public.memberships m
     where m.household_id = s.household_id and m.profile_id = v_caller and m.left_at is null
  ) then
    raise exception 'swap_not_found' using errcode = 'P0002';
  end if;
  if s.from_profile <> v_caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if s.status <> 'pending' then
    raise exception 'swap_not_pending' using errcode = 'P0001';
  end if;
  update public.swap_requests set status = 'cancelled', decided_at = now() where id = s.id;
end;
$$;

-- An owner or admin moves a chore straight to someone else. Allowed even on a day the person is away
-- (an explicit admin override), and the admin's name is on the new assignment.
create or replace function public.reassign_assignment(p_assignment_id uuid, p_to_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.rota_admin_household();
  v_admin uuid := (select authz.current_profile_id());
  a public.chore_assignments%rowtype;
  v_new uuid;
begin
  select * into a from public.chore_assignments where id = p_assignment_id and household_id = v_household;
  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
  if a.superseded_at is not null
     or exists (select 1 from public.rota_weeks w where w.id = a.rota_week_id and w.superseded_at is not null) then
    raise exception 'assignment_superseded' using errcode = 'P0001';
  end if;
  if a.completed_at is not null then
    raise exception 'already_completed' using errcode = 'P0001';
  end if;
  if p_to_profile is null or p_to_profile is not distinct from a.assignee then
    raise exception 'invalid_recipient' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.household_id = v_household and m.profile_id = p_to_profile and m.left_at is null
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  v_new := private.rota_move_assignment(
    a.id, p_to_profile, v_admin, 'Moved to you by ' || private.rota_name(v_admin) || '.'
  );

  if p_to_profile <> v_admin then
    perform private.notify(
      p_to_profile, v_household, 'chore_assigned',
      a.chore_name || ' was given to you',
      'Moved to you by ' || private.rota_name(v_admin) || ', for ' || to_char(a.due_on, 'FMDay') || '.',
      '/rota/assignments/' || v_new, 'chore_assigned:' || v_new
    );
  end if;
  if a.assignee is not null and a.assignee <> v_admin then
    perform private.notify(
      a.assignee, v_household, 'swap_decided',
      a.chore_name || ' was moved to ' || private.rota_name(p_to_profile),
      private.rota_name(v_admin) || ' moved it, so it is no longer yours.',
      '/rota', 'chore_moved:' || a.id
    );
  end if;
  return v_new;
end;
$$;

revoke all on function public.request_swap(uuid, uuid, uuid) from public, anon;
revoke all on function public.decide_swap(uuid, boolean) from public, anon;
revoke all on function public.cancel_swap(uuid) from public, anon;
revoke all on function public.reassign_assignment(uuid, uuid) from public, anon;
grant execute on function public.request_swap(uuid, uuid, uuid) to authenticated;
grant execute on function public.decide_swap(uuid, boolean) to authenticated;
grant execute on function public.cancel_swap(uuid) to authenticated;
grant execute on function public.reassign_assignment(uuid, uuid) to authenticated;
