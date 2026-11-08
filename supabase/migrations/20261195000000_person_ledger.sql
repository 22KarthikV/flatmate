-- Ledger: the items that add up to one person's balance, for the Money screen.
--
-- household_balances gives each person's net position. This lists the rows behind it: every
-- expense the person paid or shares in, and every settlement they are part of. The rows that
-- count (expenses not cancelled, settlements confirmed) sum to exactly that person's balance, so
-- the screen can show how the number is made up. Cancelled expenses and settlements that were
-- never confirmed are returned too, marked as not counting, so nothing looks like it went missing.
--
-- Shared expenses and settlements are already readable by every member of the flat, so any member
-- can open any current or former flatmate's list. Rent is a separate private ledger and is not in
-- here. The caller is derived from the sign-in; the person asked about must belong to the same flat.

create or replace function public.person_ledger(p_person uuid)
returns table (
  kind text,
  item_id uuid,
  occurred_on date,
  created_at timestamptz,
  description text,
  other_id uuid,
  other_name text,
  amount_pence bigint,
  share_pence bigint,
  effect_pence bigint,
  counts boolean,
  status text
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
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships m where m.household_id = v_household and m.profile_id = p_person
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
  select x.kind, x.item_id, x.occurred_on, x.created_at, x.description, x.other_id, x.other_name,
         x.amount_pence, x.share_pence, x.effect_pence, x.counts, x.status
    from (
      select 'expense'::text as kind, e.id as item_id, e.occurred_on as occurred_on,
             e.created_at as created_at, e.description as description,
             e.paid_by as other_id, payer.display_name as other_name,
             e.amount_pence as amount_pence, coalesce(sh.share_pence, 0)::bigint as share_pence,
             ((case when e.paid_by = p_person then e.amount_pence else 0 end)
               - coalesce(sh.share_pence, 0))::bigint as effect_pence,
             (e.voided_at is null) as counts,
             (case when e.voided_at is null then 'active' else 'cancelled' end)::text as status
        from public.expenses e
        join public.profiles payer on payer.id = e.paid_by
        left join public.expense_shares sh on sh.expense_id = e.id and sh.profile_id = p_person
       where e.household_id = v_household
         and (e.paid_by = p_person or sh.profile_id is not null)
      union all
      select 'settlement'::text, st.id, (coalesce(st.decided_at, st.created_at) at time zone 'Europe/London')::date,
             st.created_at, ''::text,
             (case when st.from_profile = p_person then st.to_profile else st.from_profile end),
             other.display_name,
             st.amount_pence, 0::bigint,
             (case when st.from_profile = p_person then st.amount_pence else -st.amount_pence end)::bigint,
             (st.status = 'confirmed'), st.status::text
        from public.settlements st
        join public.profiles other
          on other.id = (case when st.from_profile = p_person then st.to_profile else st.from_profile end)
       where st.household_id = v_household
         and (st.from_profile = p_person or st.to_profile = p_person)
    ) x
   order by x.occurred_on desc, x.created_at desc, x.item_id;
end;
$$;

revoke all on function public.person_ledger(uuid) from public, anon;
grant execute on function public.person_ledger(uuid) to authenticated;

comment on function public.person_ledger(uuid) is
  'The expenses and settlements behind one flatmate''s balance. Rows with counts = true sum to that balance. Rent is not included.';
