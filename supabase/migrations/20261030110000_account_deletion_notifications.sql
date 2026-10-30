-- Account deletion meets notifications (SPEC-notifications N13).
--
-- anonymise_profile keeps the profile row (shared history needs a "Deleted user"), so the
-- on-delete-cascade rules on notifications, preferences and push subscriptions never fire. This
-- removes that data explicitly, in the same transaction as the anonymising:
--   * the person's own notifications, saved preferences and push devices (queued pushes go with
--     the devices), so nothing can be pushed to their phone afterwards;
--   * their name from what OTHER people were told about them ("Bob joined Flat A" becomes
--     "Deleted user joined Flat A"). The notifications are found by their dedupe key, which names
--     the membership, not by matching the name, so a flatmate with the same name is never touched.
-- Safe to repeat: once the profile is unlinked there is nothing left to find.

create or replace function public.anonymise_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_name text;
begin
  select id, left(display_name, 30) into v_profile, v_name
    from public.profiles
   where user_id = p_user_id;
  if v_profile is null then
    return;
  end if;

  update public.notifications n
     set title = 'Deleted user' || substr(n.title, length(v_name) + 1)
   where n.type in ('member_joined', 'member_left')
     and starts_with(n.title, v_name || ' ')
     and exists (
       select 1 from public.memberships m
        where m.profile_id = v_profile
          and n.dedupe_key = case n.type when 'member_joined' then 'joined:' else 'left:' end || m.id
     );

  delete from public.notifications where recipient_id = v_profile;
  delete from public.notification_preferences where profile_id = v_profile;
  delete from public.push_subscriptions where profile_id = v_profile;

  update public.profiles
     set display_name = 'Deleted user',
         avatar_url = null,
         deleted_at = now(),
         user_id = null
   where id = v_profile;
end;
$$;

comment on function public.anonymise_profile(uuid) is
  'Replaces a person''s name and photo with a neutral placeholder, unlinks the row, and removes their notifications, preferences and push devices. service_role only.';

-- A role-change message no longer names the admin who made the change, so no one's name is
-- written into someone else's inbox where it could outlive their account. Otherwise unchanged.
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
      'Your role in ' || private.notification_flat(v_household) || ' was changed.',
      '/more/flat',
      v_prefix || ((select count(*) from public.notifications
                     where recipient_id = p_profile_id and left(dedupe_key, length(v_prefix)) = v_prefix) + 1)
    );
  end if;
end;
$$;
