-- Household: the tenant boundary (SPEC-household, ADR-003).
--
-- A flat (household) has members; each membership has a role. Everything later is scoped to a flat
-- and checked through the two helpers below. The tables have no write policies: all changes go
-- through the security-definer functions, which check the caller and the rules in one transaction.

create type public.household_role as enum ('owner', 'admin', 'member');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 50),
  timezone text not null default 'Europe/London',
  created_by uuid not null references public.profiles (id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.households
  for each row execute function public.set_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  profile_id uuid not null references public.profiles (id),
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text check (left_reason in ('left', 'removed', 'account_deleted', 'flat_closed')),
  check ((left_at is null) = (left_reason is null))
);

-- One active flat per person, and exactly one owner per flat (SPEC-household H4, H5).
create unique index memberships_one_active_flat on public.memberships (profile_id) where left_at is null;
create unique index memberships_one_owner on public.memberships (household_id)
  where role = 'owner' and left_at is null;
create index memberships_household_active on public.memberships (household_id) where left_at is null;

comment on table public.households is 'A flat. Closed flats keep their rows (closed_at) so history is never lost.';
comment on table public.memberships is
  'Who is, or was, in a flat. left_at and left_reason are the "member left" signal other modules read.';

-- Policy helpers live in their own schema, `authz`. RLS policies run as the signed-in role, so that
-- role needs to reach them; the `private` schema stays closed to app roles entirely (a scheduler
-- test asserts it). `authz` is not exposed through the API, and every function in it is closed to
-- PUBLIC by default from now on.
create schema if not exists authz;
revoke all on schema authz from public, anon;
grant usage on schema authz to authenticated;
alter default privileges in schema authz revoke execute on functions from public;

-- The signed-in person's profile id. Everything below derives the caller from auth.uid().
create or replace function authz.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles where user_id = (select auth.uid());
$$;

create or replace function authz.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships
     where household_id = p_household_id
       and profile_id = (select authz.current_profile_id())
       and left_at is null
  );
$$;

create or replace function authz.is_household_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships
     where household_id = p_household_id
       and profile_id = (select authz.current_profile_id())
       and left_at is null
       and role in ('owner', 'admin')
  );
$$;

revoke all on function authz.current_profile_id() from public, anon;
revoke all on function authz.is_household_member(uuid) from public, anon;
revoke all on function authz.is_household_admin(uuid) from public, anon;
grant execute on function authz.current_profile_id() to authenticated;
grant execute on function authz.is_household_member(uuid) to authenticated;
grant execute on function authz.is_household_admin(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.memberships enable row level security;

revoke all on public.households from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
grant select on public.households to authenticated;
grant select on public.memberships to authenticated;

create policy households_select_members on public.households
  for select to authenticated
  using (closed_at is null and (select authz.is_household_member(id)));

create policy memberships_select_members on public.memberships
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

-- Names are trimmed, 1 to 50 characters. Anything else is an invalid parameter.
create or replace function private.clean_household_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 50 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

-- Creates a flat and makes the caller its owner. Returns the new flat's id.
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := (select authz.current_profile_id());
  v_name text;
  v_household uuid;
begin
  if v_profile is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_name := private.clean_household_name(p_name);

  if exists (select 1 from public.memberships where profile_id = v_profile and left_at is null) then
    raise exception 'already_in_household' using errcode = 'P0001';
  end if;

  insert into public.households (name, created_by) values (v_name, v_profile)
  returning id into v_household;

  insert into public.memberships (household_id, profile_id, role)
  values (v_household, v_profile, 'owner');

  return v_household;
end;
$$;

-- Renames the caller's flat. Owner and admins only.
create or replace function public.rename_household(p_name text)
returns void
language plpgsql
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

  update public.households set name = private.clean_household_name(p_name) where id = v_household;
end;
$$;

revoke all on function private.clean_household_name(text) from public, anon, authenticated;
revoke all on function public.create_household(text) from public, anon;
revoke all on function public.rename_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.rename_household(text) to authenticated;

comment on function public.create_household(text) is 'Creates a flat with the caller as owner. Authenticated only.';
comment on function public.rename_household(text) is 'Renames the caller''s flat. Owner and admins only.';
