-- Household events tell people (SPEC-notifications, "First events").
--
-- join_household, leave_household, remove_member, set_member_role and end_memberships_for_account
-- now call private.notify in their own transaction, so an event and its notifications commit
-- together or not at all. Nobody is told about their own action. Behaviour is otherwise unchanged:
-- the bodies below are the earlier versions plus the notify calls.

-- Tell every active member of a flat, except the people listed. Names are cut so the title always
-- fits the 80 character limit.
create or replace function private.notify_flatmates(
  p_household uuid,
  p_exclude uuid[],
  p_type text,
  p_title text,
  p_href text,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
begin
  for v_member in
    select m.profile_id
      from public.memberships m
     where m.household_id = p_household
       and m.left_at is null
       and m.profile_id <> all (p_exclude)
  loop
    perform private.notify(v_member, p_household, p_type, left(p_title, 80), '', p_href, p_dedupe_key);
  end loop;
end;
$$;

revoke all on function private.notify_flatmates(uuid, uuid[], text, text, text, text) from public, anon, authenticated;

-- Short names for notification text.
create or replace function private.notification_name(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce((select display_name from public.profiles where id = p_profile), 'Someone'), 30);
$$;

create or replace function private.notification_flat(p_household uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce((select name from public.households where id = p_household), 'the flat'), 30);
$$;

revoke all on function private.notification_name(uuid) from public, anon, authenticated;
revoke all on function private.notification_flat(uuid) from public, anon, authenticated;

-- Joins the flat behind a valid link as a plain member. Returns the flat's id.
create or replace function public.join_household(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := (select authz.current_profile_id());
  v_household uuid;
  v_membership uuid;
begin
  if v_profile is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select i.household_id into v_household
    from public.invites i
    join public.households h on h.id = i.household_id and h.closed_at is null
   where i.token_hash = private.invite_hash(p_token)
     and i.revoked_at is null
     and i.expires_at > now();
  if v_household is null then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  -- Joins to one flat are serialised, so the member cap cannot be beaten by two people at once.
  perform 1 from public.households where id = v_household for update;

  if exists (select 1 from public.memberships where profile_id = v_profile and left_at is null) then
    raise exception 'already_in_household' using errcode = 'P0001';
  end if;

  if (select count(*) from public.memberships where household_id = v_household and left_at is null) >= 20 then
    raise exception 'household_full' using errcode = 'P0001';
  end if;

  insert into public.memberships (household_id, profile_id, role)
  values (v_household, v_profile, 'member')
  returning id into v_membership;

  perform private.notify_flatmates(
    v_household, array[v_profile], 'member_joined',
    private.notification_name(v_profile) || ' joined ' || private.notification_flat(v_household),
    '/more/flat', 'joined:' || v_membership
  );

  return v_household;
end;
$$;

-- Promote a member to admin, or demote an admin to member. Owner and admins only. Only a real
-- change tells the person; each one gets its own number so going back and forth is never swallowed.
create or replace function public.set_member_role(p_profile_id uuid, p_role public.household_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
  v_target_role public.household_role;
  v_target_membership uuid;
  v_prefix text;
begin
  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller
     and m.left_at is null
     and m.role in ('owner', 'admin');
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform 1 from public.households where id = v_household for update;

  select m.role, m.id into v_target_role, v_target_membership
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

  if v_target_role <> p_role then
    v_prefix := 'role:' || v_target_membership || ':' || p_role || ':';
    perform private.notify(
      p_profile_id, v_household, 'role_changed',
      'You are now ' || case p_role when 'admin' then 'an admin' else 'a member' end,
      private.notification_name(v_caller) || ' changed your role in ' || private.notification_flat(v_household) || '.',
      '/more/flat',
      v_prefix || ((select count(*) from public.notifications
                     where recipient_id = p_profile_id and left(dedupe_key, length(v_prefix)) = v_prefix) + 1)
    );
  end if;
end;
$$;

-- Removes someone from the flat. Admins can remove members; only the owner can remove an admin;
-- the owner cannot be removed, and you cannot remove yourself (leaving is a separate action).
-- The others hear; the person who did it and the person removed do not.
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
  v_membership uuid;
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
   where household_id = v_household and profile_id = p_profile_id and left_at is null
  returning id into v_membership;

  perform private.notify_flatmates(
    v_household, array[v_caller, p_profile_id], 'member_left',
    private.notification_name(p_profile_id) || ' was removed from ' || private.notification_flat(v_household),
    '/more/flat', 'left:' || v_membership
  );
end;
$$;

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
  v_membership uuid;
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
   where household_id = v_household and profile_id = v_profile and left_at is null
  returning id into v_membership;

  perform private.notify_flatmates(
    v_household, array[v_profile], 'member_left',
    private.notification_name(v_profile) || ' left ' || private.notification_flat(v_household),
    '/more/flat', 'left:' || v_membership
  );
end;
$$;

-- Called by the delete-account Edge Function (service role) BEFORE the profile is anonymised, while
-- the profile still has its real name. A member or admin simply leaves, and the others are told. A
-- sole owner's flat is closed with nobody left to tell. An owner with other people still in the
-- flat is refused, and nothing changes. Safe to repeat.
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
  v_membership uuid;
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
   where household_id = v_household and profile_id = v_profile and left_at is null
  returning id into v_membership;

  perform private.notify_flatmates(
    v_household, array[v_profile], 'member_left',
    private.notification_name(v_profile) || ' left ' || private.notification_flat(v_household),
    '/more/flat', 'left:' || v_membership
  );
  return 'ok';
end;
$$;
