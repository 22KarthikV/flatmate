-- Recurring: ending a rent or bill also cancels its upcoming months that nobody has paid.
--
-- Before this, ending a template only stopped future months. A month already created stayed on the
-- books, so replacing a rent (end the old one, create a new one) left both months counting and
-- everyone appeared to owe twice. Now ending cancels each month that is not yet due, has no
-- payment (confirmed, waived or waiting) against it, and, for a bill, has no expense yet. Months
-- already due, and months with money against them, are kept: that rent was owed, or is in flight.
-- A cancelled month is final, stays in the history, and drops out of every rent screen, total and
-- reminder because the one status function skips it. Nothing is deleted.

alter table public.recurring_instances drop constraint recurring_instances_status_check;
alter table public.recurring_instances add constraint recurring_instances_status_check
  check (status in ('awaiting_amount', 'posted', 'skipped', 'cancelled'));

-- The two allowed changes to a month: a bill gets its amount (awaiting becomes posted, once), and a
-- month with no expense is cancelled (nothing else about it moves).
create or replace function private.recurring_guard_instance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'awaiting_amount' and new.status = 'posted' and new.expense_id is not null
     and (to_jsonb(new) - 'status' - 'expense_id') = (to_jsonb(old) - 'status' - 'expense_id') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('awaiting_amount', 'posted') and new.status = 'cancelled'
     and old.expense_id is null and new.expense_id is null
     and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
    return new;
  end if;
  raise exception 'recurring_is_append_only' using errcode = 'P0001';
end;
$$;

-- The status of every charge, as before, but a charge in a cancelled month is not a charge.
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
      join public.recurring_instances ins on ins.id = ch.instance_id and ins.status <> 'cancelled'
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

-- Cancels a template's months that are not yet due, have no money against them and no expense.
-- Returns how many. Safe to run again: it only ever finds what is still live.
create or replace function private.recurring_cancel_unpaid(p_template uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with target as (
    select i.id
      from public.recurring_instances i
     where i.template_id = p_template
       and i.status in ('awaiting_amount', 'posted')
       and i.expense_id is null
       and i.due_on >= private.ledger_today()
       and not exists (
         select 1
           from private.rent_charge_status(i.household_id, null) s
           join public.rent_charges ch on ch.id = s.charge_id
          where ch.instance_id = i.id and (s.covered_pence > 0 or s.pending_pence > 0)
       )
  ),
  done as (
    update public.recurring_instances set status = 'cancelled'
     where id in (select id from target)
    returning 1
  )
  select count(*)::integer into v_count from done;
  return v_count;
end;
$$;

-- Ending now says how many months it cancelled, and logs it.
drop function public.end_recurring_template(uuid);
create function public.end_recurring_template(p_template_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
  t public.recurring_templates := private.recurring_lock_template(p_template_id, v_household);
  v_cancelled integer;
begin
  if t.ended_at is not null then
    raise exception 'already_ended' using errcode = 'P0001';
  end if;
  update public.recurring_templates set ended_at = now() where id = t.id;
  v_cancelled := private.recurring_cancel_unpaid(t.id);
  perform private.recurring_log(t.id, v_household, v_caller, 'ended',
    jsonb_build_object('cancelled_months', v_cancelled));
  return v_cancelled;
end;
$$;

revoke all on function private.recurring_cancel_unpaid(uuid) from public, anon, authenticated;
revoke all on function public.end_recurring_template(uuid) from public, anon;
grant execute on function public.end_recurring_template(uuid) to authenticated;

comment on function public.end_recurring_template(uuid) is
  'Owner or admin: end a rent or bill. Also cancels its unpaid months that are not yet due; returns how many.';

-- Tidy up rents and bills that were ended before this existed: their unpaid coming months still
-- counted. Same rule, and the same harmless re-run.
select private.recurring_cancel_unpaid(t.id) from public.recurring_templates t where t.ended_at is not null;
