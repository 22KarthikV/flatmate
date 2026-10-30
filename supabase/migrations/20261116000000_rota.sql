-- Rota: chores and their checklists (SPEC-rota T4, T8, assumptions 2, 3 and 6).
--
-- A chore and its checklist are editable templates. Only admins change them, and only through the
-- functions below; members of the flat can read them and nobody else can. Later migrations add the
-- weeks, assignments and ticks, which copy (snapshot) a chore's name, effort and checklist when a
-- week is generated, so editing a template never rewrites anything that already happened.

-- ---------------------------------------------------------------------------------------------
-- Tables.
create table public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  name text not null check (char_length(name) between 1 and 40),
  cadence text not null check (cadence in ('weekly', 'every_n_days')),
  -- 0 = Sunday. Weekly chores only; "every N days" chores have no preferred day.
  preferred_dow smallint check (preferred_dow between 0 and 6),
  every_n_days smallint check (every_n_days between 1 and 14),
  effort smallint not null default 3 check (effort between 1 and 5),
  needs_signoff boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (cadence = 'weekly' and preferred_dow is not null and every_n_days is null)
    or (cadence = 'every_n_days' and every_n_days is not null and preferred_dow is null)
  )
);

-- Two active chores in a flat cannot share a name, whatever the case; an archived one frees it.
create unique index chores_active_name on public.chores (household_id, lower(name)) where archived_at is null;
create index chores_household on public.chores (household_id, archived_at);

create table public.chore_checklist_items (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references public.chores (id),
  position smallint not null,
  text text not null check (char_length(text) between 1 and 80),
  unique (chore_id, position)
);

comment on table public.chores is
  'A chore template. Weeks copy its name, effort and checklist when generated; editing it never changes the past.';
comment on table public.chore_checklist_items is
  'The steps of a chore template, in order. Replaced as a whole when the chore is saved.';

-- ---------------------------------------------------------------------------------------------
-- Row-level security: members of a flat read its chores. There are no write policies and no write
-- grants, so the browser cannot change any of it; the functions below do.
alter table public.chores enable row level security;
alter table public.chore_checklist_items enable row level security;

revoke all on public.chores, public.chore_checklist_items from anon, authenticated;
grant select on public.chores, public.chore_checklist_items to authenticated;

create policy chores_select_members on public.chores
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

create policy chore_checklist_items_select_members on public.chore_checklist_items
  for select to authenticated
  using (exists (
    select 1 from public.chores c
     where c.id = chore_id and (select authz.is_household_member(c.household_id))
  ));

-- ---------------------------------------------------------------------------------------------
-- Writers. The caller is whoever is signed in (never an argument); the flat is theirs.

-- The flat of an owner or admin, or an error.
create or replace function private.rota_admin_household()
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

revoke all on function private.rota_admin_household() from public, anon, authenticated;

-- Trims and checks a checklist: up to 20 steps, each 1 to 80 characters.
create or replace function private.rota_clean_items(p_items text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_clean text[] := '{}';
  v_item text;
begin
  foreach v_item in array coalesce(p_items, '{}') loop
    v_item := btrim(coalesce(v_item, ''));
    if char_length(v_item) not between 1 and 80 then
      raise exception 'invalid_checklist' using errcode = '22023';
    end if;
    v_clean := v_clean || v_item;
  end loop;
  if coalesce(array_length(v_clean, 1), 0) > 20 then
    raise exception 'invalid_checklist' using errcode = '22023';
  end if;
  return v_clean;
end;
$$;

revoke all on function private.rota_clean_items(text[]) from public, anon, authenticated;

-- Adds a chore, or changes one (p_chore_id) and replaces its checklist. Admin only. Returns the id.
create or replace function public.save_chore(
  p_chore_id uuid default null,
  p_name text default null,
  p_cadence text default null,
  p_preferred_dow integer default null,
  p_every_n_days integer default null,
  p_effort integer default null,
  p_needs_signoff boolean default false,
  p_items text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.rota_admin_household();
  v_name text := btrim(coalesce(p_name, ''));
  v_items text[];
  v_id uuid := p_chore_id;
  v_archived timestamptz;
begin
  -- One writer per flat at a time, so the chore count and name checks cannot race.
  perform 1 from public.households where id = v_household for update;

  if char_length(v_name) not between 1 and 40 or p_cadence not in ('weekly', 'every_n_days') then
    raise exception 'invalid_chore' using errcode = '22023';
  end if;
  if p_cadence = 'weekly' and (p_preferred_dow is null or p_preferred_dow not between 0 and 6 or p_every_n_days is not null) then
    raise exception 'invalid_chore' using errcode = '22023';
  end if;
  if p_cadence = 'every_n_days' and (p_every_n_days is null or p_every_n_days not between 1 and 14 or p_preferred_dow is not null) then
    raise exception 'invalid_chore' using errcode = '22023';
  end if;
  if p_effort is null or p_effort not between 1 and 5 then
    raise exception 'invalid_effort' using errcode = '22023';
  end if;
  v_items := private.rota_clean_items(p_items);

  if v_id is not null then
    select c.archived_at into v_archived
      from public.chores c
     where c.id = v_id and c.household_id = v_household
     for update;
    if not found then
      raise exception 'chore_not_found' using errcode = 'P0002';
    end if;
    if v_archived is not null then
      raise exception 'chore_archived' using errcode = 'P0001';
    end if;
  elsif (select count(*) from public.chores c where c.household_id = v_household and c.archived_at is null) >= 12 then
    raise exception 'too_many_chores' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.chores c
     where c.household_id = v_household and c.archived_at is null
       and lower(c.name) = lower(v_name) and c.id is distinct from v_id
  ) then
    raise exception 'duplicate_name' using errcode = '23505';
  end if;

  if v_id is null then
    insert into public.chores (household_id, name, cadence, preferred_dow, every_n_days, effort, needs_signoff)
    values (v_household, v_name, p_cadence, p_preferred_dow, p_every_n_days, p_effort, coalesce(p_needs_signoff, false))
    returning id into v_id;
  else
    update public.chores
       set name = v_name, cadence = p_cadence, preferred_dow = p_preferred_dow, every_n_days = p_every_n_days,
           effort = p_effort, needs_signoff = coalesce(p_needs_signoff, false)
     where id = v_id;
    delete from public.chore_checklist_items where chore_id = v_id;
  end if;

  insert into public.chore_checklist_items (chore_id, position, text)
  select v_id, (t.ord)::smallint, t.item
    from unnest(v_items) with ordinality as t(item, ord);

  return v_id;
end;
$$;

-- Archives a chore: it stops being scheduled, its history stays. Admin only; archiving twice is harmless.
create or replace function public.archive_chore(p_chore_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.rota_admin_household();
begin
  perform 1 from public.chores c where c.id = p_chore_id and c.household_id = v_household for update;
  if not found then
    raise exception 'chore_not_found' using errcode = 'P0002';
  end if;
  update public.chores set archived_at = now() where id = p_chore_id and archived_at is null;
end;
$$;

-- The first flat's chores, in one tap, for a flat that has none (SPEC-rota T4). Admin only.
-- Bins 1, Kitchen 3, Living room 4, Bathroom 2, Hallway 1; the hallway takes the vacuum and mop from
-- what used to be one combined chore. Every one is editable afterwards.
create or replace function public.load_default_chores()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.rota_admin_household();
  v_chore uuid;
  r record;
begin
  perform 1 from public.households where id = v_household for update;
  if exists (select 1 from public.chores c where c.household_id = v_household and c.archived_at is null) then
    raise exception 'chores_exist' using errcode = 'P0001';
  end if;

  for r in
    select * from (values
      ('Bins', 'every_n_days', null::int, 2, 1,
        array['Take the rubbish out', 'Put the recycling out if it is collection day', 'Fit a new bin bag']),
      ('Kitchen', 'weekly', 3, null::int, 3,
        array['Clear and wipe the worktops', 'Clean the hob', 'Wipe the sink and taps', 'Wipe the fridge shelves', 'Sweep and mop the floor']),
      ('Living room', 'weekly', 6, null::int, 4,
        array['Tidy and put things away', 'Dust the surfaces', 'Wipe the table', 'Plump the cushions', 'Vacuum the floor']),
      ('Bathroom', 'weekly', 5, null::int, 2,
        array['Clean the toilet', 'Scrub the sink and taps', 'Clean the shower or bath', 'Wipe the mirror', 'Wash the floor']),
      ('Hallway', 'weekly', 0, null::int, 1,
        array['Tidy the shoes', 'Vacuum the floor', 'Mop the floor'])
    ) as d(name, cadence, dow, every_n, effort, items)
  loop
    insert into public.chores (household_id, name, cadence, preferred_dow, every_n_days, effort)
    values (v_household, r.name, r.cadence, r.dow, r.every_n, r.effort)
    returning id into v_chore;

    insert into public.chore_checklist_items (chore_id, position, text)
    select v_chore, (t.ord)::smallint, t.item from unnest(r.items) with ordinality as t(item, ord);
  end loop;

  return 5;
end;
$$;

revoke all on function public.save_chore(uuid, text, text, integer, integer, integer, boolean, text[]) from public, anon;
revoke all on function public.archive_chore(uuid) from public, anon;
revoke all on function public.load_default_chores() from public, anon;
grant execute on function public.save_chore(uuid, text, text, integer, integer, integer, boolean, text[]) to authenticated;
grant execute on function public.archive_chore(uuid) to authenticated;
grant execute on function public.load_default_chores() to authenticated;

comment on function public.save_chore(uuid, text, text, integer, integer, integer, boolean, text[]) is
  'Admin: add a chore, or change one and replace its checklist. Returns the chore id.';
comment on function public.archive_chore(uuid) is
  'Admin: stop scheduling a chore. Its history stays.';
comment on function public.load_default_chores() is
  'Admin: load the first flat''s five chores into a flat that has none.';
