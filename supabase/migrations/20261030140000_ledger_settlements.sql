-- Ledger: settling up (SPEC-ledger L7, L8, L9).
--
-- A payer records "I paid Sam £6.00". That is only a claim until Sam confirms it, so a pending
-- settlement changes nobody's balance. The receiver confirms (the balance moves) or declines (it
-- never counts); the payer may cancel while it is still pending. Each of these writes its
-- notification in the same transaction. Confirming, declining and cancelling are idempotent: doing
-- the same thing twice changes nothing and tells nobody twice.

-- Finds a settlement the caller is allowed to see: they must be in its flat. Someone outside the
-- flat gets "not found", so another flat's ids reveal nothing. Locks the row so two people acting
-- at once cannot both win.
create or replace function private.ledger_lock_settlement(p_settlement uuid, p_caller uuid)
returns public.settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.settlements;
begin
  select * into s from public.settlements where id = p_settlement for update;
  if not found or not exists (
    select 1 from public.memberships m
     where m.household_id = s.household_id and m.profile_id = p_caller and m.left_at is null
  ) then
    raise exception 'settlement_not_found' using errcode = 'P0001';
  end if;
  return s;
end;
$$;

-- "Bob says they paid you £6.00." Records a pending payment to another member of the caller's flat.
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
  if not exists (
    select 1 from public.memberships m
     where m.household_id = v_household and m.profile_id = p_to and m.left_at is null
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  insert into public.settlements (household_id, from_profile, to_profile, amount_pence)
  values (v_household, v_caller, p_to, p_amount_pence)
  returning id into v_id;

  select display_name into v_payer from public.profiles where id = v_caller;
  perform private.notify(
    p_to, v_household, 'settlement_pending',
    left(v_payer || ' says they paid you', 80),
    'Confirm it when you have received ' || private.format_pence(p_amount_pence) || '.',
    '/money', 'settlement:' || v_id
  );
  return v_id;
end;
$$;

-- The receiver confirms: the payment now counts, and the payer is told.
create or replace function public.confirm_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  s public.settlements;
  v_receiver text;
begin
  s := private.ledger_lock_settlement(p_settlement_id, v_caller);
  if s.to_profile <> v_caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if s.status = 'confirmed' then
    return;
  end if;
  if s.status <> 'pending' then
    raise exception 'settlement_not_pending' using errcode = 'P0001';
  end if;

  update public.settlements
     set status = 'confirmed', decided_at = now(), confirmed_by = v_caller
   where id = s.id;

  -- The payer may have left since; there is nobody to tell then, and the confirmation still counts.
  if exists (select 1 from public.memberships m
              where m.household_id = s.household_id and m.profile_id = s.from_profile and m.left_at is null) then
    select display_name into v_receiver from public.profiles where id = v_caller;
    perform private.notify(
      s.from_profile, s.household_id, 'settlement_confirmed',
      left(v_receiver || ' confirmed your payment', 80),
      private.format_pence(s.amount_pence) || ' now counts towards what you owe.',
      '/money', 'settlement_confirmed:' || s.id
    );
  end if;
end;
$$;

-- The receiver says it did not arrive (or was not meant): it never counts, and the payer is told.
create or replace function public.decline_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  s public.settlements;
  v_receiver text;
begin
  s := private.ledger_lock_settlement(p_settlement_id, v_caller);
  if s.to_profile <> v_caller then
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
    select display_name into v_receiver from public.profiles where id = v_caller;
    perform private.notify(
      s.from_profile, s.household_id, 'settlement_declined',
      left(v_receiver || ' did not confirm your payment', 80),
      'They have not counted your ' || private.format_pence(s.amount_pence)
        || ' payment. Check with them if it should have been.',
      '/money', 'settlement_declined:' || s.id
    );
  end if;
end;
$$;

-- The payer takes it back while it is still pending. The receiver is not told: there is nothing
-- left to confirm, and the pending prompt disappears from their screen.
create or replace function public.cancel_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  s public.settlements;
begin
  s := private.ledger_lock_settlement(p_settlement_id, v_caller);
  if s.from_profile <> v_caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if s.status = 'cancelled' then
    return;
  end if;
  if s.status <> 'pending' then
    raise exception 'settlement_not_pending' using errcode = 'P0001';
  end if;

  update public.settlements set status = 'cancelled', decided_at = now() where id = s.id;
end;
$$;

revoke all on function private.ledger_lock_settlement(uuid, uuid) from public, anon, authenticated;

revoke all on function public.record_settlement(uuid, bigint) from public, anon;
revoke all on function public.confirm_settlement(uuid) from public, anon;
revoke all on function public.decline_settlement(uuid) from public, anon;
revoke all on function public.cancel_settlement(uuid) from public, anon;
grant execute on function public.record_settlement(uuid, bigint) to authenticated;
grant execute on function public.confirm_settlement(uuid) to authenticated;
grant execute on function public.decline_settlement(uuid) to authenticated;
grant execute on function public.cancel_settlement(uuid) to authenticated;

comment on function public.record_settlement(uuid, bigint) is
  'Records that the caller paid another member of their flat. Pending until the receiver confirms; changes no balance.';
comment on function public.confirm_settlement(uuid) is
  'The receiver confirms a pending payment: it now counts. Idempotent.';
comment on function public.decline_settlement(uuid) is
  'The receiver declines a pending payment: it never counts. Idempotent.';
comment on function public.cancel_settlement(uuid) is
  'The payer takes back a pending payment. Idempotent.';
