-- Leaving, handing over and closing a flat (SPEC-household H5, H9, H13).
--
-- Each function takes the flat's lock first and only then reads who is in it, so two people acting
-- at once cannot leave a flat with no owner or two owners.

-- The hook the ledger will replace: may this person leave right now? (Requirements: balances must
-- be settled before leaving.) Until money exists, everyone may.
create or replace function private.can_leave(p_household_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select true;
$$;

revoke all on function private.can_leave(uuid, uuid) from public, anon, authenticated;

-- Leave the flat. The owner cannot: hand over first, or close the flat if alone.
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := (select authz.current_profile_id());
  v_household uuid;
  v_role public.household_role;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_profile and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform 1 from public.households where id = v_household for update;

  select m.role into v_role
    from public.memberships m
   where m.household_id = v_household and m.profile_id = v_profile and m.left_at is null;
  if v_role is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if v_role = 'owner' then
    if exists (
      select 1 from public.memberships
       where household_id = v_household and left_at is null and profile_id <> v_profile
    ) then
      raise exception 'owner_must_transfer' using errcode = 'P0001';
    end if;
    raise exception 'owner_must_close' using errcode = 'P0001';
  end if;

  if not private.can_leave(v_household, v_profile) then
    raise exception 'cannot_leave' using errcode = 'P0001';
  end if;

  update public.memberships set left_at = now(), left_reason = 'left'
   where household_id = v_household and profile_id = v_profile and left_at is null;
end;
$$;

-- The owner hands the flat to another member and becomes an admin.
create or replace function public.transfer_ownership(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform 1 from public.households where id = v_household for update;

  if not exists (
    select 1 from public.memberships
     where household_id = v_household and profile_id = v_caller and left_at is null and role = 'owner'
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_profile_id = v_caller then
    raise exception 'use_leave' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.memberships
     where household_id = v_household and profile_id = p_profile_id and left_at is null
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  -- The one-owner index is checked per statement, so step down before stepping up.
  update public.memberships set role = 'admin'
   where household_id = v_household and profile_id = v_caller and left_at is null;
  update public.memberships set role = 'owner'
   where household_id = v_household and profile_id = p_profile_id and left_at is null;
end;
$$;

-- The owner closes the flat once nobody else is in it. The rows stay, marked closed.
create or replace function public.close_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform 1 from public.households where id = v_household for update;

  if not exists (
    select 1 from public.memberships
     where household_id = v_household and profile_id = v_caller and left_at is null and role = 'owner'
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.memberships
     where household_id = v_household and left_at is null and profile_id <> v_caller
  ) then
    raise exception 'flat_not_empty' using errcode = 'P0001';
  end if;

  update public.invites set revoked_at = now() where household_id = v_household and revoked_at is null;
  update public.memberships set left_at = now(), left_reason = 'flat_closed'
   where household_id = v_household and left_at is null;
  update public.households set closed_at = now() where id = v_household;
end;
$$;

revoke all on function public.leave_household() from public, anon;
revoke all on function public.transfer_ownership(uuid) from public, anon;
revoke all on function public.close_household() from public, anon;
grant execute on function public.leave_household() to authenticated;
grant execute on function public.transfer_ownership(uuid) to authenticated;
grant execute on function public.close_household() to authenticated;

comment on function public.leave_household() is
  'Leave the flat (left_reason left). The owner must transfer or close first.';
comment on function public.transfer_ownership(uuid) is
  'Owner hands the flat to another member and becomes an admin.';
comment on function public.close_household() is
  'Owner closes a flat nobody else is in. Rows are kept, marked closed.';
