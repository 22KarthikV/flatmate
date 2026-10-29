-- Account deletion meets households (SPEC-household H10).
--
-- Called by the delete-account Edge Function (service role) BEFORE the profile is anonymised, while
-- the profile is still linked to the sign-in. A member or admin simply leaves. A sole owner's flat
-- is closed. An owner with other people still in the flat is refused, and nothing changes, so the
-- person is asked to hand the flat over first. Safe to repeat: once the profile is anonymised (or
-- there is no active membership) it just answers 'ok'.

create or replace function public.end_memberships_for_account(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_household uuid;
  v_role public.household_role;
begin
  select id into v_profile from public.profiles where user_id = p_user_id;
  if v_profile is null then
    return 'ok';
  end if;

  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_profile and m.left_at is null;
  if v_household is null then
    return 'ok';
  end if;

  perform 1 from public.households where id = v_household for update;

  select m.role into v_role
    from public.memberships m
   where m.household_id = v_household and m.profile_id = v_profile and m.left_at is null;
  if v_role is null then
    return 'ok';
  end if;

  if v_role = 'owner' then
    if exists (
      select 1 from public.memberships
       where household_id = v_household and left_at is null and profile_id <> v_profile
    ) then
      return 'owner_must_transfer';
    end if;

    update public.invites set revoked_at = now() where household_id = v_household and revoked_at is null;
    update public.memberships set left_at = now(), left_reason = 'flat_closed'
     where household_id = v_household and left_at is null;
    update public.households set closed_at = now() where id = v_household;
    return 'ok';
  end if;

  update public.memberships set left_at = now(), left_reason = 'account_deleted'
   where household_id = v_household and profile_id = v_profile and left_at is null;
  return 'ok';
end;
$$;

revoke all on function public.end_memberships_for_account(uuid) from public, anon, authenticated;
grant execute on function public.end_memberships_for_account(uuid) to service_role;

comment on function public.end_memberships_for_account(uuid) is
  'Ends a person''s flat membership before their account is deleted. service_role only.';
