-- Recurring: a rent closed without payment does not protect its month from being cancelled.
--
-- The first version of private.recurring_cancel_unpaid kept any month that had money "against" it,
-- and an admin closing a charge without payment (a waiver) counted as money. So a rent replaced
-- after an admin had already closed some of its charges by hand kept its remaining charges
-- counting. A waiver is not money received: only a real payment, pending or confirmed and not
-- reversed, from someone charged in the month keeps it. Everything else about the rule is the same.

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
          where ch.instance_id = i.id
            and (s.covered_pence > 0 or s.pending_pence > 0)
            and exists (
              select 1 from public.rent_payments p
               where p.template_id = s.template_id and p.payer_id = s.profile_id
                 and p.kind = 'payment' and p.voided_at is null
                 and p.status in ('pending', 'confirmed')
            )
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

revoke all on function private.recurring_cancel_unpaid(uuid) from public, anon, authenticated;

-- Run the clean-up again for rents and bills that were ended before.
select private.recurring_cancel_unpaid(t.id) from public.recurring_templates t where t.ended_at is not null;
