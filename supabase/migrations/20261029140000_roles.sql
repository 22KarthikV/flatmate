-- Household roles and removal (SPEC-household H5, H11).
--
-- Admins can promote and demote, and remove members. Only the owner can remove an admin, and
-- nobody can touch the owner. Flatmates can see each other's name and photo, so lists and later
-- history make sense.

-- Can the signed-in person see this profile? Yes if it is their own flat's member, past or
-- present (history keeps showing them, "Deleted user" once anonymised). Only people currently
-- in the flat get this view.
create or replace function authz.shares_household_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships mine
      join public.memberships theirs on theirs.household_id = mine.household_id
     where mine.profile_id = (select authz.current_profile_id())
       and mine.left_at is null
       and theirs.profile_id = p_profile_id
  );
$$;

revoke all on function authz.shares_household_with(uuid) from public, anon;
grant execute on function authz.shares_household_with(uuid) to authenticated;

create policy profiles_select_flatmates on public.profiles
  for select to authenticated
  using ((select authz.shares_household_with(id)));

-- Promote a member to admin, or demote an admin to member. Owner and admins only.
create or replace function public.set_member_role(p_profile_id uuid, p_role public.household_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_target_role public.household_role;
begin
  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = (select authz.current_profile_id())
     and m.left_at is null
     and m.role in ('owner', 'admin');
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform 1 from public.households where id = v_household for update;

  select m.role into v_target_role
    from public.memberships m
   where m.household_id = v_household and m.profile_id = p_profile_id and m.left_at is null;
  if v_target_role is null then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if v_target_role = 'owner' then
    raise exception 'owner_is_fixed' using errcode = '42501';
  end if;

  update public.memberships set role = p_role
   where household_id = v_household and profile_id = p_profile_id and left_at is null;
end;
$$;

-- Removes someone from the flat. Admins can remove members; only the owner can remove an admin;
-- the owner cannot be removed, and you cannot remove yourself (leaving is a separate action).
create or replace function public.remove_member(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_caller_role public.household_role;
  v_household uuid;
  v_target_role public.household_role;
begin
  select m.household_id, m.role into v_household, v_caller_role
    from public.memberships m
   where m.profile_id = v_caller
     and m.left_at is null
     and m.role in ('owner', 'admin');
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_profile_id = v_caller then
    raise exception 'use_leave' using errcode = 'P0001';
  end if;

  perform 1 from public.households where id = v_household for update;

  select m.role into v_target_role
    from public.memberships m
   where m.household_id = v_household and m.profile_id = p_profile_id and m.left_at is null;
  if v_target_role is null then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if v_target_role = 'owner' or (v_target_role = 'admin' and v_caller_role <> 'owner') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.memberships set left_at = now(), left_reason = 'removed'
   where household_id = v_household and profile_id = p_profile_id and left_at is null;
end;
$$;

revoke all on function public.set_member_role(uuid, public.household_role) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.set_member_role(uuid, public.household_role) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;

comment on function public.set_member_role(uuid, public.household_role) is
  'Promotes a member to admin or demotes an admin to member. Never touches the owner.';
comment on function public.remove_member(uuid) is
  'Removes a member (left_reason removed). Only the owner can remove an admin.';
