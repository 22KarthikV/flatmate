-- Ledger: leaving and account deletion with money in play (SPEC-ledger L11).
--
-- The can_leave hook that household reserved now means something: a person cannot leave, or delete
-- their account, while they owe or are owed money, or have a payment waiting for a decision.
-- Removing someone is not blocked (an admin must always be able to), so a person can be gone with
-- money still open. For that case, a payment TO them (they are owed it) can be recorded, and an
-- admin who is not the payer can confirm or decline it on their behalf. Nothing is written off
-- automatically; the confirmed payment is on the record, with the admin's name against it.

-- One person's balance in one flat, from the live rows: the same arithmetic as household_balances,
-- for a single person. Positive means they are owed money.
create or replace function private.ledger_person_balance(p_household uuid, p_profile uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(pence), 0)::bigint
    from (
      select e.amount_pence as pence
        from public.expenses e
       where e.household_id = p_household and e.paid_by = p_profile and e.voided_at is null
      union all
      select -s.share_pence
        from public.expense_shares s
        join public.expenses e on e.id = s.expense_id
       where e.household_id = p_household and s.profile_id = p_profile and e.voided_at is null
      union all
      select st.amount_pence
        from public.settlements st
       where st.household_id = p_household and st.from_profile = p_profile and st.status = 'confirmed'
      union all
      select -st.amount_pence
        from public.settlements st
       where st.household_id = p_household and st.to_profile = p_profile and st.status = 'confirmed'
    ) moves;
$$;

revoke all on function private.ledger_person_balance(uuid, uuid) from public, anon, authenticated;

-- May this person leave right now? Only when they owe nothing, are owed nothing, and have no
-- payment waiting for a decision (sent or received).
create or replace function private.can_leave(p_household_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.ledger_person_balance(p_household_id, p_profile_id) = 0
     and not exists (
       select 1
         from public.settlements st
        where st.household_id = p_household_id
          and st.status = 'pending'
          and p_profile_id in (st.from_profile, st.to_profile)
     );
$$;

revoke all on function private.can_leave(uuid, uuid) from public, anon, authenticated;

-- Everyone named in a row must belong to that row's flat. The payer of a settlement and everyone
-- on an expense must be in it now; the person PAID may also have left (an admin settles with them
-- on their behalf), which record_settlement checks separately.
create or replace function private.ledger_check_people()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_people uuid[];
  v_person uuid;
begin
  if tg_table_name = 'expenses' then
    v_people := array[new.paid_by, new.created_by];
  elsif tg_table_name = 'expense_shares' then
    v_people := array[new.profile_id];
  else
    v_people := array[new.from_profile];
    -- The receiver need only have been in the flat at some point.
    if not exists (
      select 1 from public.memberships
       where household_id = new.household_id and profile_id = new.to_profile
    ) then
      raise exception 'not_a_member' using errcode = 'P0001';
    end if;
  end if;

  foreach v_person in array v_people loop
    if not exists (
      select 1 from public.memberships
       where household_id = new.household_id and profile_id = v_person and left_at is null
    ) then
      raise exception 'not_a_member' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

-- Deleting an account now honours the same rule. The check comes before anything changes, and it
-- raises rather than returning a new answer, so an older delete-account function (which only knows
-- "ok" and "owner_must_transfer") fails closed and deletes nothing. A lone owner closing their flat
-- is not blocked: nobody else can be owed anything from a flat that is being closed.
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

  if not private.can_leave(v_household, v_profile) then
    raise exception 'open_balance' using errcode = 'P0001';
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

-- "Bob says they paid you £6.00." The person paid is a current flatmate, or someone who has left
-- and is still owed at least this much (an admin then decides it on their behalf).
create or replace function public.record_settlement(p_to uuid, p_amount_pence bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
  v_id uuid;
  v_payer text;
  v_receiver_active boolean;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_amount_pence is null or p_amount_pence not between 1 and 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_to is null or p_to = v_caller then
    raise exception 'invalid_recipient' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.memberships m
     where m.household_id = v_household and m.profile_id = p_to and m.left_at is null
  ) into v_receiver_active;

  if not v_receiver_active then
    if not exists (
      select 1 from public.memberships m
       where m.household_id = v_household and m.profile_id = p_to
    ) then
      raise exception 'not_a_member' using errcode = 'P0001';
    end if;
    -- Someone who has left can only be paid what they are owed.
    if private.ledger_person_balance(v_household, p_to) < p_amount_pence then
      raise exception 'not_owed' using errcode = 'P0001';
    end if;
  end if;

  insert into public.settlements (household_id, from_profile, to_profile, amount_pence)
  values (v_household, v_caller, p_to, p_amount_pence)
  returning id into v_id;

  if v_receiver_active then
    select display_name into v_payer from public.profiles where id = v_caller;
    perform private.notify(
      p_to, v_household, 'settlement_pending',
      left(v_payer || ' says they paid you', 80),
      'Confirm it when you have received ' || private.format_pence(p_amount_pence) || '.',
      '/money', 'settlement:' || v_id
    );
  end if;
  return v_id;
end;
$$;

-- Who may decide a pending settlement: its receiver, or, when the receiver has left the flat, an
-- owner or admin who is not the payer.
create or replace function private.ledger_may_decide(s public.settlements, p_caller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.to_profile = p_caller
      or (
        s.from_profile <> p_caller
        and not exists (
          select 1 from public.memberships m
           where m.household_id = s.household_id and m.profile_id = s.to_profile and m.left_at is null
        )
        and exists (
          select 1 from public.memberships m
           where m.household_id = s.household_id and m.profile_id = p_caller and m.left_at is null
             and m.role in ('owner', 'admin')
        )
      );
$$;

revoke all on function private.ledger_may_decide(public.settlements, uuid) from public, anon, authenticated;

create or replace function public.confirm_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  s public.settlements;
  v_actor text;
  v_receiver text;
  v_on_behalf boolean;
begin
  s := private.ledger_lock_settlement(p_settlement_id, v_caller);
  if not private.ledger_may_decide(s, v_caller) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if s.status = 'confirmed' then
    return;
  end if;
  if s.status <> 'pending' then
    raise exception 'settlement_not_pending' using errcode = 'P0001';
  end if;

  v_on_behalf := s.to_profile <> v_caller;
  update public.settlements
     set status = 'confirmed', decided_at = now(), confirmed_by = v_caller
   where id = s.id;

  -- The payer may have left since; there is nobody to tell then, and the confirmation still counts.
  if exists (select 1 from public.memberships m
              where m.household_id = s.household_id and m.profile_id = s.from_profile and m.left_at is null) then
    select display_name into v_actor from public.profiles where id = v_caller;
    select display_name into v_receiver from public.profiles where id = s.to_profile;
    perform private.notify(
      s.from_profile, s.household_id, 'settlement_confirmed',
      left(v_actor || ' confirmed your payment', 80),
      case when v_on_behalf
        then private.format_pence(s.amount_pence) || ' now counts. ' || v_receiver
             || ' has left, so an admin confirmed it for them.'
        else private.format_pence(s.amount_pence) || ' now counts towards what you owe.'
      end,
      '/money', 'settlement_confirmed:' || s.id
    );
  end if;
end;
$$;

create or replace function public.decline_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  s public.settlements;
  v_actor text;
begin
  s := private.ledger_lock_settlement(p_settlement_id, v_caller);
  if not private.ledger_may_decide(s, v_caller) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if s.status = 'declined' then
    return;
  end if;
  if s.status <> 'pending' then
    raise exception 'settlement_not_pending' using errcode = 'P0001';
  end if;

  update public.settlements set status = 'declined', decided_at = now() where id = s.id;

  if exists (select 1 from public.memberships m
              where m.household_id = s.household_id and m.profile_id = s.from_profile and m.left_at is null) then
    select display_name into v_actor from public.profiles where id = v_caller;
    perform private.notify(
      s.from_profile, s.household_id, 'settlement_declined',
      left(v_actor || ' did not confirm your payment', 80),
      'They have not counted your ' || private.format_pence(s.amount_pence)
        || ' payment. Check with them if it should have been.',
      '/money', 'settlement_declined:' || s.id
    );
  end if;
end;
$$;
