-- Extras A: the shopping list (SPEC-extras A). Independent of every other extras tool.
--
-- One shared list per flat. Members read it; nobody writes a table directly. Every change is a
-- function that finds the caller's flat itself and answers "not found" for another flat's rows.

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  name text not null check (char_length(name) between 1 and 60),
  note text check (note is null or char_length(note) between 1 and 40),
  added_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  bought_at timestamptz,
  bought_by uuid references public.profiles (id),
  -- Set when the item was part of an expense made with "Turn into an expense".
  expense_id uuid references public.expenses (id),
  -- Hidden from the list ("Clear bought"), kept briefly so the expense link still works.
  cleared_at timestamptz,
  check ((bought_at is null) = (bought_by is null)),
  check (expense_id is null or bought_at is not null),
  check (cleared_at is null or bought_at is not null)
);

create index shopping_items_open on public.shopping_items (household_id, created_at desc)
  where cleared_at is null;
create index shopping_items_expense on public.shopping_items (expense_id) where expense_id is not null;
create index shopping_items_purge on public.shopping_items (cleared_at) where cleared_at is not null;

comment on table public.shopping_items is
  'The flat''s shopping list. Written only by the shopping functions; readable by members of the flat.';

alter table public.shopping_items enable row level security;
revoke all on public.shopping_items from anon, authenticated;
grant select on public.shopping_items to authenticated;

create policy shopping_items_select_members on public.shopping_items
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

-- The caller's current flat, or an error.
create or replace function private.shopping_household()
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
   where m.profile_id = (select authz.current_profile_id()) and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_household;
end;
$$;

revoke all on function private.shopping_household() from public, anon, authenticated;

-- Adds an item. A repeat of an open item (same name, ignoring case) returns the existing one.
create or replace function public.add_shopping_item(p_name text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.shopping_household();
  v_caller uuid := (select authz.current_profile_id());
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 40 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  -- Serialise adds within a flat so two taps cannot both slip past the duplicate and cap checks.
  perform pg_advisory_xact_lock(hashtextextended('shopping:' || v_household::text, 0));

  select i.id into v_id
    from public.shopping_items i
   where i.household_id = v_household and i.cleared_at is null and i.bought_at is null
     and lower(i.name) = lower(v_name)
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if (select count(*) from public.shopping_items i
       where i.household_id = v_household and i.cleared_at is null and i.bought_at is null) >= 100 then
    raise exception 'list_full' using errcode = 'P0001';
  end if;

  insert into public.shopping_items (household_id, name, note, added_by)
  values (v_household, v_name, v_note, v_caller)
  returning id into v_id;
  return v_id;
end;
$$;

-- Ticks or un-ticks an item. Once an item is behind an expense it stays bought.
create or replace function public.set_shopping_bought(p_item uuid, p_bought boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.shopping_household();
  v_caller uuid := (select authz.current_profile_id());
  i public.shopping_items;
begin
  select * into i from public.shopping_items
   where id = p_item and household_id = v_household and cleared_at is null for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if i.expense_id is not null then
    raise exception 'already_in_expense' using errcode = 'P0001';
  end if;
  if coalesce(p_bought, false) then
    update public.shopping_items set bought_at = coalesce(bought_at, now()), bought_by = coalesce(bought_by, v_caller)
     where id = i.id;
  else
    update public.shopping_items set bought_at = null, bought_by = null where id = i.id;
  end if;
end;
$$;

-- Removes an item: the person who added it, or an admin. An item behind an expense is kept.
create or replace function public.remove_shopping_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.shopping_household();
  v_caller uuid := (select authz.current_profile_id());
  i public.shopping_items;
begin
  select * into i from public.shopping_items
   where id = p_item and household_id = v_household for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if i.added_by <> v_caller and not (select authz.is_household_admin(v_household)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if i.expense_id is not null then
    raise exception 'already_in_expense' using errcode = 'P0001';
  end if;
  delete from public.shopping_items where id = i.id;
end;
$$;

-- Hides this flat's bought items from the list. Returns how many.
create or replace function public.clear_bought_items()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.shopping_household();
  v_count integer;
begin
  update public.shopping_items set cleared_at = now()
   where household_id = v_household and bought_at is not null and cleared_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Deleting an account removes the person's unbought items; items behind an expense stay.
create or replace function private.shopping_note_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.shopping_items where added_by = new.id and bought_at is null;
  return new;
end;
$$;

revoke all on function private.shopping_note_profile_deleted() from public, anon, authenticated;

create trigger shopping_profile_deleted
  after update of deleted_at on public.profiles
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.shopping_note_profile_deleted();

revoke all on function public.add_shopping_item(text, text) from public, anon;
revoke all on function public.set_shopping_bought(uuid, boolean) from public, anon;
revoke all on function public.remove_shopping_item(uuid) from public, anon;
revoke all on function public.clear_bought_items() from public, anon;
grant execute on function public.add_shopping_item(text, text) to authenticated;
grant execute on function public.set_shopping_bought(uuid, boolean) to authenticated;
grant execute on function public.remove_shopping_item(uuid) to authenticated;
grant execute on function public.clear_bought_items() to authenticated;
