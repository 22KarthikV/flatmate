-- Recurring: the rent a collector is still owed, per person, for the Totals screen.
--
-- Rent stays private: the caller sees only the charges they collect themselves, which they are
-- entitled to know. The caller is derived from the sign-in, and there is no argument to point it at
-- anyone else. "Outstanding" is rent nobody has said they paid; "pending" is rent a person says they
-- paid that is waiting for the collector to confirm. Months that were cancelled do not count.

create or replace function public.rent_owed_to_me()
returns table (payer_id uuid, payer_name text, outstanding_pence bigint, pending_pence bigint)
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
    select s.profile_id, p.display_name,
           sum(s.outstanding_pence)::bigint, sum(s.pending_pence)::bigint
      from private.rent_charge_status(v_household, null) s
      join public.rent_charges ch on ch.id = s.charge_id
      join public.profiles p on p.id = s.profile_id
     where ch.collector_id = v_caller
       and (s.outstanding_pence > 0 or s.pending_pence > 0)
     group by s.profile_id, p.display_name
     order by p.display_name, s.profile_id;
end;
$$;

revoke all on function public.rent_owed_to_me() from public, anon;
grant execute on function public.rent_owed_to_me() to authenticated;

comment on function public.rent_owed_to_me() is
  'The caller as rent collector: what each person still owes them (outstanding) and has said they paid (pending).';
