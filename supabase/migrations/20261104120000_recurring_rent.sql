-- Recurring: rent payments and status (SPEC-recurring R14, R16, R21, R22, R23).
--
-- Rent is tracked in its own private ledger: charges (written by the generator) and payments
-- (written here), never in the shared ledger's expenses, shares or settlements. A person records
-- "I paid my rent"; it stays pending until the collector, or another admin who is not the payer,
-- confirms or declines it. Confirmed payments cover a person's oldest unpaid charge first. What is
-- paid, pending or outstanding is worked out from those rows every time by one function, so it
-- cannot drift, and the screens and the reminders read the same numbers. A person sees only their
-- own rent (my_rent derives them from auth.uid()); admins see everyone's (rent_dashboard).

-- ---------------------------------------------------------------------------------------------
-- The status of every charge: how much confirmed payments cover (oldest charge first), how much a
-- pending payment would cover next, and what is left. Per person and per rent template. Voided
-- payments, and declined or cancelled ones, count for nothing. p_profile null means everyone.
create or replace function private.rent_charge_status(p_household uuid, p_profile uuid default null)
returns table (
  charge_id uuid, template_id uuid, profile_id uuid, period date, due_on date,
  amount_pence bigint, covered_pence bigint, pending_pence bigint, outstanding_pence bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select ch.id, ch.template_id, ch.profile_id, ch.period, ch.due_on, ch.amount_pence,
           coalesce(sum(ch.amount_pence) over w, 0) as before_amount
      from public.rent_charges ch
     where ch.household_id = p_household and (p_profile is null or ch.profile_id = p_profile)
    window w as (partition by ch.template_id, ch.profile_id order by ch.period, ch.due_on, ch.id
                 rows between unbounded preceding and 1 preceding)
  ),
  pay as (
    select p.template_id, p.payer_id,
           coalesce(sum(p.amount_pence) filter (where p.status = 'confirmed' and p.voided_at is null), 0) as confirmed,
           coalesce(sum(p.amount_pence) filter (where p.status = 'pending'), 0) as pending
      from public.rent_payments p
     where p.household_id = p_household
     group by p.template_id, p.payer_id
  ),
  covered as (
    select c.id, c.template_id, c.profile_id, c.period, c.due_on, c.amount_pence,
           coalesce(pay.pending, 0) as pend,
           least(c.amount_pence, greatest(0, coalesce(pay.confirmed, 0) - c.before_amount)) as cov
      from c
      left join pay on pay.template_id = c.template_id and pay.payer_id = c.profile_id
  ),
  remaining as (
    select cv.*, cv.amount_pence - cv.cov as rem,
           coalesce(sum(cv.amount_pence - cv.cov) over w2, 0) as rem_before
      from covered cv
    window w2 as (partition by cv.template_id, cv.profile_id order by cv.period, cv.due_on, cv.id
                  rows between unbounded preceding and 1 preceding)
  )
  select r.id, r.template_id, r.profile_id, r.period, r.due_on, r.amount_pence, r.cov,
         least(r.rem, greatest(0, r.pend - r.rem_before))::bigint,
         (r.rem - least(r.rem, greatest(0, r.pend - r.rem_before)))::bigint
    from remaining r
   order by r.profile_id, r.period, r.due_on;
$$;

-- A word for a charge: paid, pending (a payment is waiting for the collector), part_paid, outstanding.
create or replace function private.rent_status_label(p_amount bigint, p_covered bigint, p_pending bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_covered >= p_amount then 'paid'
    when p_covered + p_pending >= p_amount then 'pending'
    when p_covered + p_pending > 0 then 'part_paid'
    else 'outstanding'
  end;
$$;

-- The caller's flat if they are an owner or admin there; "not allowed" otherwise. A person is
-- "the payer" only of their own payments, so there is no separate payer check here.
create or replace function private.recurring_decider_household(p_caller uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.recurring_admin_household(p_caller);
$$;

-- A payment of the caller's flat, locked, or "not found" (so other flats' ids reveal nothing).
create or replace function private.rent_lock_payment(p_payment uuid, p_caller uuid)
returns public.rent_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.rent_payments;
begin
  select * into p from public.rent_payments where id = p_payment for update;
  if not found or not exists (
    select 1 from public.memberships m
     where m.household_id = p.household_id and m.profile_id = p_caller and m.left_at is null
  ) then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- "I paid my rent". For the caller only, from 1p up to what they still owe on the template of their
-- oldest unpaid charge (charges less confirmed and pending payments). Tells the collector and the
-- other admins, who may see the amount.
create or replace function public.record_rent_payment(p_amount_pence bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
  v_template uuid;
  v_collector uuid;
  v_owed bigint;
  v_id uuid;
  v_name text;
begin
  select m.household_id into v_household
    from public.memberships m where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_amount_pence is null or p_amount_pence not between 1 and 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select s.template_id, ch.collector_id into v_template, v_collector
    from private.rent_charge_status(v_household, v_caller) s
    join public.rent_charges ch on ch.id = s.charge_id
   where s.outstanding_pence > 0
   order by s.period, s.due_on, s.charge_id
   limit 1;
  if v_template is null then
    raise exception 'nothing_owed' using errcode = 'P0001';
  end if;
  select sum(s.outstanding_pence) into v_owed
    from private.rent_charge_status(v_household, v_caller) s where s.template_id = v_template;
  if p_amount_pence > v_owed then
    raise exception 'amount_exceeds_owed' using errcode = 'P0001';
  end if;

  insert into public.rent_payments (household_id, template_id, payer_id, collector_id, amount_pence, status)
  values (v_household, v_template, v_caller, v_collector, p_amount_pence, 'pending')
  returning id into v_id;

  select display_name into v_name from public.profiles where id = v_caller;
  perform private.recurring_notify_admins_except(
    v_household, v_caller, 'rent_payment_pending',
    left(v_name || ' says they paid ' || private.format_pence(p_amount_pence) || ' rent', 80),
    'Please confirm it if it has arrived, or say it has not.',
    '/money/rent', 'rent_payment:' || v_id
  );
  return v_id;
end;
$$;

-- Everyone who can decide rent (owners and admins), except one person (the payer).
create or replace function private.recurring_notify_admins_except(
  p_household uuid, p_except uuid, p_type text, p_title text, p_body text, p_href text, p_dedupe text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select m.profile_id from public.memberships m
     where m.household_id = p_household and m.left_at is null and m.role in ('owner', 'admin')
       and m.profile_id <> p_except
     order by m.profile_id
  loop
    perform private.notify(r.profile_id, p_household, p_type, left(p_title, 80), left(p_body, 200), p_href, p_dedupe);
  end loop;
end;
$$;

-- Confirm or decline: the collector or an admin who is not the payer, once, while pending.
create or replace function private.rent_decide(p_payment uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_decider_household(v_caller);
  p public.rent_payments := private.rent_lock_payment(p_payment, v_caller);
  v_name text;
begin
  if p.household_id <> v_household then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  if p.payer_id = v_caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p.status <> 'pending' then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;

  update public.rent_payments
     set status = p_status, decided_by = v_caller, decided_at = now()
   where id = p.id;

  select display_name into v_name from public.profiles where id = v_caller;
  if private.recurring_is_member(p.household_id, p.payer_id, false) then
    perform private.notify(
      p.payer_id, p.household_id, 'rent_payment_decided',
      left(v_name || case when p_status = 'confirmed' then ' confirmed your rent payment' else ' says your rent payment has not arrived' end, 80),
      case when p_status = 'confirmed'
           then private.format_pence(p.amount_pence) || ' is now counted towards your rent.'
           else 'The ' || private.format_pence(p.amount_pence) || ' you recorded is not counted. Check with them.' end,
      '/money/rent', 'rent_decided:' || p.id
    );
  end if;
end;
$$;

create or replace function public.confirm_rent_payment(p_payment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.rent_decide(p_payment_id, 'confirmed');
$$;

create or replace function public.decline_rent_payment(p_payment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.rent_decide(p_payment_id, 'declined');
$$;

-- The payer takes back a payment that is still pending.
create or replace function public.cancel_rent_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  p public.rent_payments := private.rent_lock_payment(p_payment_id, v_caller);
begin
  if p.payer_id <> v_caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p.status <> 'pending' then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  update public.rent_payments set status = 'cancelled', decided_by = v_caller, decided_at = now() where id = p.id;
end;
$$;

-- An admin undoes a confirmation made by mistake: once, and the payer is told.
create or replace function public.void_rent_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
  p public.rent_payments := private.rent_lock_payment(p_payment_id, v_caller);
begin
  if p.household_id <> v_household then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  if p.status <> 'confirmed' then
    raise exception 'not_confirmed' using errcode = 'P0001';
  end if;
  if p.voided_at is not null then
    raise exception 'already_voided' using errcode = 'P0001';
  end if;
  update public.rent_payments set voided_at = now(), voided_by = v_caller where id = p.id;

  if p.payer_id <> v_caller and private.recurring_is_member(p.household_id, p.payer_id, false) then
    perform private.notify(
      p.payer_id, p.household_id, 'rent_payment_decided',
      'A confirmed rent payment was reversed',
      'The ' || private.format_pence(p.amount_pence) || ' is no longer counted. Check with the person who collects the rent.',
      '/money/rent', 'rent_void:' || p.id
    );
  end if;
end;
$$;

-- Closes rent that will not be paid: an immediately confirmed, admin-only entry with a reason, up
-- to what the person still owes. Not for oneself.
create or replace function public.waive_rent(p_payer_id uuid, p_amount_pence bigint, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_template uuid;
  v_collector uuid;
  v_owed bigint;
  v_id uuid;
begin
  if p_payer_id = v_caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_amount_pence is null or p_amount_pence not between 1 and 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 1 and 200 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select s.template_id, ch.collector_id into v_template, v_collector
    from private.rent_charge_status(v_household, p_payer_id) s
    join public.rent_charges ch on ch.id = s.charge_id
   where s.outstanding_pence > 0
   order by s.period, s.due_on, s.charge_id
   limit 1;
  if v_template is null then
    raise exception 'nothing_owed' using errcode = 'P0001';
  end if;
  select sum(s.outstanding_pence) into v_owed
    from private.rent_charge_status(v_household, p_payer_id) s where s.template_id = v_template;
  if p_amount_pence > v_owed then
    raise exception 'amount_exceeds_owed' using errcode = 'P0001';
  end if;

  insert into public.rent_payments
    (household_id, template_id, payer_id, collector_id, kind, amount_pence, status, reason, decided_by, decided_at)
  values
    (v_household, v_template, p_payer_id, v_collector, 'waiver', p_amount_pence, 'confirmed', v_reason, v_caller, now())
  returning id into v_id;

  if private.recurring_is_member(v_household, p_payer_id, false) then
    perform private.notify(
      p_payer_id, v_household, 'rent_payment_decided',
      'Some of your rent was waived',
      private.format_pence(p_amount_pence) || ' is no longer owed.',
      '/money/rent', 'rent_waiver:' || v_id
    );
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- What each person sees. my_rent derives the person from auth.uid() and returns only their own
-- charges, so there is no argument to point at someone else. A flat's current members only.
create or replace function public.my_rent()
returns table (
  charge_id uuid, template_id uuid, period date, due_on date, amount_pence bigint,
  covered_pence bigint, pending_pence bigint, outstanding_pence bigint, status text,
  collector_id uuid, collector_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
begin
  select m.household_id into v_household
    from public.memberships m where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    return;
  end if;
  return query
    select s.charge_id, s.template_id, s.period, s.due_on, s.amount_pence, s.covered_pence,
           s.pending_pence, s.outstanding_pence,
           private.rent_status_label(s.amount_pence, s.covered_pence, s.pending_pence),
           ch.collector_id, p.display_name
      from private.rent_charge_status(v_household, v_caller) s
      join public.rent_charges ch on ch.id = s.charge_id
      join public.profiles p on p.id = ch.collector_id
     order by s.period desc, s.due_on desc;
end;
$$;

-- Everyone's rent for one month. Owners and admins only (the collector is one); anyone else is refused.
create or replace function public.rent_dashboard(p_period date)
returns table (
  charge_id uuid, profile_id uuid, display_name text, still_in_flat boolean, room_name text,
  period date, due_on date, amount_pence bigint, covered_pence bigint, pending_pence bigint,
  outstanding_pence bigint, status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
begin
  return query
    select s.charge_id, s.profile_id, p.display_name,
           private.recurring_is_member(v_household, s.profile_id, false),
           ch.room_name, s.period, s.due_on, s.amount_pence, s.covered_pence, s.pending_pence,
           s.outstanding_pence,
           private.rent_status_label(s.amount_pence, s.covered_pence, s.pending_pence)
      from private.rent_charge_status(v_household, null) s
      join public.rent_charges ch on ch.id = s.charge_id
      join public.profiles p on p.id = s.profile_id
     where s.period = p_period
     order by p.display_name, s.profile_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Leaving with unpaid rent (R23): it never blocks leaving (the ledger's leave rule is about shared
-- money). The daily job tells every admin once per person how much is still unpaid; admins decide
-- outside the app, or close it with a waiver. The charges stay as history.
create or replace function private.recurring_notify_leavers(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select h.id as household_id, s.profile_id, sum(s.outstanding_pence)::bigint as owed
      from public.households h
      cross join lateral private.rent_charge_status(h.id, null) s
     where not private.recurring_is_member(h.id, s.profile_id, false)
     group by h.id, s.profile_id
    having sum(s.outstanding_pence) > 0
     order by h.id, s.profile_id
  loop
    perform private.recurring_notify_admins(
      r.household_id, 'recurring_attention',
      (select display_name from public.profiles where id = r.profile_id) || ' left owing rent',
      private.format_pence(r.owed) || ' of their rent is unpaid. You can close it with a waiver on the rent screen.',
      '/money/rent', 'rent_left_unpaid:' || r.profile_id || ':' || r.household_id
    );
  end loop;
end;
$$;

revoke all on function private.rent_charge_status(uuid, uuid) from public, anon, authenticated;
revoke all on function private.rent_status_label(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function private.recurring_decider_household(uuid) from public, anon, authenticated;
revoke all on function private.rent_lock_payment(uuid, uuid) from public, anon, authenticated;
revoke all on function private.recurring_notify_admins_except(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.rent_decide(uuid, text) from public, anon, authenticated;
revoke all on function private.recurring_notify_leavers(timestamptz) from public, anon, authenticated;

revoke all on function public.record_rent_payment(bigint) from public, anon;
revoke all on function public.confirm_rent_payment(uuid) from public, anon;
revoke all on function public.decline_rent_payment(uuid) from public, anon;
revoke all on function public.cancel_rent_payment(uuid) from public, anon;
revoke all on function public.void_rent_payment(uuid) from public, anon;
revoke all on function public.waive_rent(uuid, bigint, text) from public, anon;
revoke all on function public.my_rent() from public, anon;
revoke all on function public.rent_dashboard(date) from public, anon;
grant execute on function public.record_rent_payment(bigint) to authenticated;
grant execute on function public.confirm_rent_payment(uuid) to authenticated;
grant execute on function public.decline_rent_payment(uuid) to authenticated;
grant execute on function public.cancel_rent_payment(uuid) to authenticated;
grant execute on function public.void_rent_payment(uuid) to authenticated;
grant execute on function public.waive_rent(uuid, bigint, text) to authenticated;
grant execute on function public.my_rent() to authenticated;
grant execute on function public.rent_dashboard(date) to authenticated;

comment on function public.my_rent() is
  'The caller''s own rent charges with what is paid, pending and outstanding. Derived from auth.uid(); never anyone else''s.';
comment on function public.rent_dashboard(date) is
  'Owners and admins: everyone''s rent for one month. Raises not_allowed for anyone else.';
