-- Extras B: bin days (SPEC-extras B). Independent of every other extras tool.
--
-- An admin types in each bin's repeating pattern and one real collection date; everyone in the flat
-- reads it. Exceptions skip or move one collection. Nothing is fetched from a council. Nobody writes
-- a table directly: the functions below find the caller's flat themselves.

create table public.bin_streams (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  name text not null check (char_length(name) between 1 and 40),
  colour text not null default 'other'
    check (colour in ('grey', 'blue', 'green', 'brown', 'black', 'red', 'purple', 'other')),
  -- A real collection date for this bin; every other one is anchor + n * every_weeks weeks.
  anchor_on date not null,
  every_weeks smallint not null default 1 check (every_weeks between 1 and 4),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint bin_streams_id_household unique (id, household_id)
);
create index bin_streams_flat on public.bin_streams (household_id) where archived_at is null;

create table public.bin_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  stream_id uuid not null,
  -- The date the pattern says it would have been collected.
  original_on date not null,
  kind text not null check (kind in ('skip', 'move')),
  moved_to date,
  note text check (note is null or char_length(note) between 1 and 60),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (stream_id, household_id) references public.bin_streams (id, household_id),
  check ((kind = 'move') = (moved_to is not null)),
  check (moved_to is null or (moved_to <> original_on and abs(moved_to - original_on) <= 14)),
  unique (stream_id, original_on)
);
create index bin_exceptions_flat on public.bin_exceptions (household_id, original_on);

comment on table public.bin_streams is
  'A bin the flat puts out: its name, colour and repeat pattern. Typed in by an admin; nothing comes from a council.';
comment on table public.bin_exceptions is
  'One skipped or moved collection of a bin.';

alter table public.bin_streams enable row level security;
alter table public.bin_exceptions enable row level security;
revoke all on public.bin_streams, public.bin_exceptions from anon, authenticated;
grant select on public.bin_streams, public.bin_exceptions to authenticated;

create policy bin_streams_select_members on public.bin_streams
  for select to authenticated
  using ((select authz.is_household_member(household_id)));
create policy bin_exceptions_select_members on public.bin_exceptions
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

-- Today in the flats' timezone.
create or replace function private.bins_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/London')::date;
$$;

-- Whether a pattern collects on a date, before exceptions. Plain day counts, so clock changes
-- cannot move it. The TypeScript isPatternDay does the same sum.
create or replace function private.bin_pattern_day(p_anchor date, p_every_weeks integer, p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_date - p_anchor) % (7 * p_every_weeks) = 0;
$$;

-- The bins collected in a flat on a date, with skips and moves applied. Used by the reminder; the
-- TypeScript collectionsBetween follows the same rules (shared test vectors keep them in step).
create or replace function private.bin_collections_on(p_household uuid, p_date date)
returns table (stream_id uuid, name text, colour text)
language sql
stable
set search_path = ''
as $$
  select s.id, s.name, s.colour
    from public.bin_streams s
   where s.household_id = p_household and s.archived_at is null
     and (
       (private.bin_pattern_day(s.anchor_on, s.every_weeks, p_date)
         and not exists (select 1 from public.bin_exceptions e
                          where e.stream_id = s.id and e.original_on = p_date))
       or exists (select 1 from public.bin_exceptions e
                   where e.stream_id = s.id and e.kind = 'move' and e.moved_to = p_date)
     )
   order by s.name, s.id;
$$;

-- The flat of an owner or admin, or an error.
create or replace function private.bins_admin_household()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = (select authz.current_profile_id())
     and m.left_at is null
     and m.role in ('owner', 'admin');
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_household;
end;
$$;

-- Adds a bin, or changes one (p_id). Admin only. Changing the pattern keeps an exception only where
-- it still lands on a collection date; the rest are removed.
create or replace function public.save_bin_stream(
  p_id uuid,
  p_name text,
  p_colour text,
  p_anchor_on date,
  p_every_weeks integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.bins_admin_household();
  v_caller uuid := (select authz.current_profile_id());
  v_name text := btrim(coalesce(p_name, ''));
  v_today date := private.bins_today();
  v_id uuid := p_id;
begin
  if char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_colour is null or p_colour not in ('grey', 'blue', 'green', 'brown', 'black', 'red', 'purple', 'other') then
    raise exception 'invalid_colour' using errcode = '22023';
  end if;
  if p_every_weeks is null or p_every_weeks not between 1 and 4 then
    raise exception 'invalid_pattern' using errcode = '22023';
  end if;
  if p_anchor_on is null or abs(p_anchor_on - v_today) > 730 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  if v_id is null then
    if (select count(*) from public.bin_streams s
         where s.household_id = v_household and s.archived_at is null) >= 20 then
      raise exception 'too_many_bins' using errcode = 'P0001';
    end if;
    insert into public.bin_streams (household_id, name, colour, anchor_on, every_weeks, created_by)
    values (v_household, v_name, p_colour, p_anchor_on, p_every_weeks, v_caller)
    returning id into v_id;
  else
    perform 1 from public.bin_streams s
     where s.id = v_id and s.household_id = v_household and s.archived_at is null for update;
    if not found then
      raise exception 'bin_not_found' using errcode = 'P0001';
    end if;
    update public.bin_streams
       set name = v_name, colour = p_colour, anchor_on = p_anchor_on, every_weeks = p_every_weeks
     where id = v_id;
    delete from public.bin_exceptions e
     where e.stream_id = v_id
       and not private.bin_pattern_day(p_anchor_on, p_every_weeks, e.original_on);
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_bin_stream(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.bins_admin_household();
begin
  update public.bin_streams set archived_at = now()
   where id = p_id and household_id = v_household and archived_at is null;
  if not found then
    raise exception 'bin_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Skips or moves one collection. The date must really be a collection date of that bin; a move
-- lands within 14 days. Replaces any earlier exception for the same date.
create or replace function public.set_bin_exception(
  p_stream uuid,
  p_original_on date,
  p_kind text,
  p_moved_to date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.bins_admin_household();
  v_caller uuid := (select authz.current_profile_id());
  s public.bin_streams;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  select * into s from public.bin_streams
   where id = p_stream and household_id = v_household and archived_at is null for update;
  if not found then
    raise exception 'bin_not_found' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind not in ('skip', 'move') or (p_kind = 'move') <> (p_moved_to is not null) then
    raise exception 'invalid_exception' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 60 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  if p_original_on is null or not private.bin_pattern_day(s.anchor_on, s.every_weeks, p_original_on) then
    raise exception 'not_a_collection_day' using errcode = 'P0001';
  end if;
  if p_moved_to is not null and (p_moved_to = p_original_on or abs(p_moved_to - p_original_on) > 14) then
    raise exception 'invalid_exception' using errcode = '22023';
  end if;

  insert into public.bin_exceptions
    (household_id, stream_id, original_on, kind, moved_to, note, created_by)
  values (v_household, s.id, p_original_on, p_kind, p_moved_to, v_note, v_caller)
  on conflict (stream_id, original_on) do update
    set kind = excluded.kind, moved_to = excluded.moved_to, note = excluded.note,
        created_by = excluded.created_by, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.clear_bin_exception(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.bins_admin_household();
begin
  delete from public.bin_exceptions where id = p_id and household_id = v_household;
  if not found then
    raise exception 'exception_not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.bins_today() from public, anon, authenticated;
revoke all on function private.bin_pattern_day(date, integer, date) from public, anon, authenticated;
revoke all on function private.bin_collections_on(uuid, date) from public, anon, authenticated;
revoke all on function private.bins_admin_household() from public, anon, authenticated;

revoke all on function public.save_bin_stream(uuid, text, text, date, integer) from public, anon;
revoke all on function public.archive_bin_stream(uuid) from public, anon;
revoke all on function public.set_bin_exception(uuid, date, text, date, text) from public, anon;
revoke all on function public.clear_bin_exception(uuid) from public, anon;
grant execute on function public.save_bin_stream(uuid, text, text, date, integer) to authenticated;
grant execute on function public.archive_bin_stream(uuid) to authenticated;
grant execute on function public.set_bin_exception(uuid, date, text, date, text) to authenticated;
grant execute on function public.clear_bin_exception(uuid) to authenticated;
