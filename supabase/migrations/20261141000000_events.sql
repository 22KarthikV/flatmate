-- Events: tables, row-level security and guards (SPEC-events E1).
--
-- Anyone in the flat proposes an event with a few possible dates, everyone answers yes, maybe or no
-- on each date, and the first date to get more than half of the members' yes votes is confirmed.
-- This migration holds only the data and its guards. Members of the flat can read; nobody writes
-- directly. Every write comes from the functions added in the next migration, which derive the
-- caller from auth.uid(). History is kept: a dropped date, a cancelled event and a leaver's answers
-- all stay as rows.

-- ---------------------------------------------------------------------------------------------
-- Tables.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  organiser_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  location text check (location is null or char_length(location) between 1 and 100),
  -- voting: open. tiebreak: voting closed, the organiser must pick among the tied dates.
  status text not null default 'voting' check (status in ('voting', 'tiebreak', 'confirmed', 'cancelled')),
  vote_deadline timestamptz not null,
  tiebreak_since timestamptz,
  -- Set together when a date is confirmed. starts_at and ends_at are copied from the date so the
  -- calendar and the reminders need no join.
  confirmed_option_id uuid,
  confirmed_at timestamptz,
  confirmed_by text check (confirmed_by in ('majority', 'deadline', 'organiser', 'auto_tiebreak', 'member_change')),
  starts_at timestamptz,
  ends_at timestamptz,
  cancelled_at timestamptz,
  -- Null when the app cancelled it (nobody could make any date).
  cancelled_by uuid references public.profiles (id),
  cancelled_reason text check (char_length(cancelled_reason) <= 100),
  -- Counts real edits, so "was updated" is told once per edit.
  edit_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((confirmed_option_id is null) = (confirmed_at is null)),
  check ((confirmed_option_id is null) = (starts_at is null)),
  check (status <> 'confirmed' or confirmed_option_id is not null),
  check (status not in ('voting', 'tiebreak') or confirmed_option_id is null),
  check (status <> 'tiebreak' or tiebreak_since is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);

create table public.event_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  household_id uuid not null references public.households (id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- A dropped date keeps its row and its votes, but counts for nothing.
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  unique (id, event_id)
);

-- The same time cannot be offered twice on one event while it is still offered.
create unique index event_options_one_per_time on public.event_options (event_id, starts_at) where removed_at is null;
create index event_options_flat_time on public.event_options (household_id, starts_at);

alter table public.events
  add constraint events_confirmed_option_fk
  foreign key (confirmed_option_id, id) references public.event_options (id, event_id);

create table public.event_votes (
  option_id uuid not null,
  event_id uuid not null,
  household_id uuid not null references public.households (id),
  profile_id uuid not null references public.profiles (id),
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One answer per person per date.
  primary key (option_id, profile_id),
  foreign key (option_id, event_id) references public.event_options (id, event_id)
);

create index event_votes_event on public.event_votes (event_id);
create index event_votes_person on public.event_votes (profile_id, event_id);

-- Both lead with the tenant key.
create index events_open on public.events (household_id, status, vote_deadline)
  where status in ('voting', 'tiebreak');
create index events_confirmed on public.events (household_id, starts_at)
  where status = 'confirmed';

create trigger set_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.event_votes
  for each row execute function public.set_updated_at();

comment on table public.events is
  'A flat event decided by majority vote. Written only by the events functions. Flatmates can read everything on it.';
comment on table public.event_options is
  'The dates offered for an event. A dropped date keeps its row (removed_at) and its votes.';
comment on table public.event_votes is
  'Yes, maybe or no per person per date. Flatmates can read each other''s answers by design. A leaver''s answers stay but stop counting.';

-- ---------------------------------------------------------------------------------------------
-- Row-level security: members read, nobody writes.
alter table public.events enable row level security;
alter table public.event_options enable row level security;
alter table public.event_votes enable row level security;

revoke all on public.events from anon, authenticated;
revoke all on public.event_options from anon, authenticated;
revoke all on public.event_votes from anon, authenticated;
grant select on public.events to authenticated;
grant select on public.event_options to authenticated;
grant select on public.event_votes to authenticated;

create policy events_select_members on public.events
  for select to authenticated using ((select authz.is_household_member(household_id)));
create policy event_options_select_members on public.event_options
  for select to authenticated using ((select authz.is_household_member(household_id)));
create policy event_votes_select_members on public.event_votes
  for select to authenticated using ((select authz.is_household_member(household_id)));

-- ---------------------------------------------------------------------------------------------
-- Guards. Belt and braces behind the functions: even a function with a bug cannot let a vote land
-- on a closed event, move an event to another flat, or rewrite a date.

-- A vote only lands on an open event, on a date still offered, with matching ids. Clearing an
-- answer (delete) follows the same rule, so a closed event's votes are frozen.
create or replace function private.events_guard_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.event_votes%rowtype;
  v_option public.event_options%rowtype;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select * into v_option from public.event_options where id = v_row.option_id;
  if not found or v_option.event_id <> v_row.event_id or v_option.household_id <> v_row.household_id then
    raise exception 'event_vote_mismatch' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and (
    new.option_id <> old.option_id or new.profile_id <> old.profile_id
    or new.event_id <> old.event_id or new.household_id <> old.household_id
  ) then
    raise exception 'event_is_fixed' using errcode = 'P0001';
  end if;

  select e.status into v_status from public.events e where e.id = v_row.event_id;
  if v_status is distinct from 'voting' or v_option.removed_at is not null then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- An event never moves flats and never changes organiser, except through the hand-over, which
-- sets a transaction-local flag first. Events are never deleted.
create or replace function private.events_guard_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'event_is_fixed' using errcode = 'P0001';
  end if;
  if new.id <> old.id or new.household_id <> old.household_id or new.created_at <> old.created_at then
    raise exception 'event_is_fixed' using errcode = 'P0001';
  end if;
  if new.organiser_id <> old.organiser_id
     and coalesce(current_setting('flatmate.events_handover', true), '') <> 'on' then
    raise exception 'event_is_fixed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- A date can be dropped (removed_at) and nothing else about it changes. Dates are never deleted.
create or replace function private.events_guard_option()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'removed_at') = (to_jsonb(old) - 'removed_at')
     and (old.removed_at is null or new.removed_at is not distinct from old.removed_at) then
    return new;
  end if;
  raise exception 'event_is_fixed' using errcode = 'P0001';
end;
$$;

revoke all on function private.events_guard_vote() from public, anon, authenticated;
revoke all on function private.events_guard_event() from public, anon, authenticated;
revoke all on function private.events_guard_option() from public, anon, authenticated;

create trigger events_guard_vote before insert or update or delete on public.event_votes
  for each row execute function private.events_guard_vote();
create trigger events_guard_event before update or delete on public.events
  for each row execute function private.events_guard_event();
create trigger events_guard_option before update or delete on public.event_options
  for each row execute function private.events_guard_option();
