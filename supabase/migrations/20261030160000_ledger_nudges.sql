-- Ledger: gentle reminders (SPEC-ledger L7, L10).
--
-- A daily job does two kind things:
--   * nudges people who have owed more than £1 for at least their flat's interval (an admin picks
--     off, 3, 7 or 14 days; the default is 7), at most once per interval;
--   * reminds the receiver of a payment nobody has decided for 2 days, once a day, three times.
-- Both go through private.notify, so each person's own settings apply (a nudge is snoozable and
-- inbox-only by default; the payment reminder reuses the payment type and its generic push text),
-- and the dedupe keys make running the job twice harmless.

-- A person's balance as it stood at a past moment, from the rows that existed then. An expense
-- counts if it had been added and not yet voided; a settlement once it had been confirmed.
create or replace function private.ledger_person_balance_at(p_household uuid, p_profile uuid, p_at timestamptz)
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
       where e.household_id = p_household and e.paid_by = p_profile
         and e.created_at <= p_at and (e.voided_at is null or e.voided_at > p_at)
      union all
      select -s.share_pence
        from public.expense_shares s
        join public.expenses e on e.id = s.expense_id
       where e.household_id = p_household and s.profile_id = p_profile
         and e.created_at <= p_at and (e.voided_at is null or e.voided_at > p_at)
      union all
      select st.amount_pence
        from public.settlements st
       where st.household_id = p_household and st.from_profile = p_profile
         and st.status = 'confirmed' and st.decided_at <= p_at
      union all
      select -st.amount_pence
        from public.settlements st
       where st.household_id = p_household and st.to_profile = p_profile
         and st.status = 'confirmed' and st.decided_at <= p_at
    ) moves;
$$;

revoke all on function private.ledger_person_balance_at(uuid, uuid, timestamptz) from public, anon, authenticated;

-- An owner or admin chooses how long someone owes before they are nudged. Null switches nudges off.
create or replace function public.set_nudge_interval(p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller and m.left_at is null and m.role in ('owner', 'admin');
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_days is not null and p_days not in (3, 7, 14) then
    raise exception 'invalid_interval' using errcode = '22023';
  end if;

  update public.households set nudge_after_days = p_days where id = v_household;
end;
$$;

revoke all on function public.set_nudge_interval(integer) from public, anon;
grant execute on function public.set_nudge_interval(integer) to authenticated;

comment on function public.set_nudge_interval(integer) is
  'Owner or admin: after how many days of owing a flatmate is nudged (3, 7 or 14), or null for never.';

-- "You owe £10.00" to each current member of a flat with nudges on who owed over £1 both now and one
-- interval ago. One nudge per person per interval-sized period. p_now is a parameter so tests can
-- move through time; the job passes now().
create or replace function private.ledger_send_nudges(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_now bigint;
  v_then bigint;
begin
  for r in
    select h.id as household_id, h.nudge_after_days as days, m.profile_id
      from public.households h
      join public.memberships m on m.household_id = h.id and m.left_at is null
     where h.closed_at is null and h.nudge_after_days is not null
  loop
    v_now := private.ledger_person_balance_at(r.household_id, r.profile_id, p_now);
    continue when v_now > -101;
    v_then := private.ledger_person_balance_at(r.household_id, r.profile_id, p_now - make_interval(days => r.days));
    continue when v_then > -101;

    perform private.notify(
      r.profile_id, r.household_id, 'payment_nudge',
      'Gentle reminder: you owe ' || private.format_pence(-v_now),
      'That is what you owe across ' || private.notification_flat(r.household_id)
        || '. When you have paid, record it on the Money screen.',
      '/money',
      'nudge:' || r.days || ':' || (((p_now at time zone 'utc')::date - date '1970-01-01') / r.days)
    );
  end loop;
end;
$$;

-- Tells the receiver about a payment that has waited 2 days for a decision: once a day, three
-- times at most. People who have left are skipped (an admin decides those).
create or replace function private.ledger_remind_pending(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  for s in
    select st.id, st.household_id, st.to_profile, st.amount_pence, p.display_name as payer
      from public.settlements st
      join public.memberships m
        on m.household_id = st.household_id and m.profile_id = st.to_profile and m.left_at is null
      join public.profiles p on p.id = st.from_profile
     where st.status = 'pending'
       and st.created_at <= p_now - interval '2 days'
       and (select count(*) from public.notifications n
             where n.dedupe_key like 'settlement_reminder:' || st.id || ':%') < 3
  loop
    perform private.notify(
      s.to_profile, s.household_id, 'settlement_pending',
      left('Reminder: ' || s.payer || ' says they paid you', 80),
      'Confirm ' || private.format_pence(s.amount_pence) || ' if it has arrived, or say it has not.',
      '/money',
      'settlement_reminder:' || s.id || ':' || to_char(p_now at time zone 'utc', 'YYYYMMDD')
    );
  end loop;
end;
$$;

-- Once per UTC day, however often it is triggered, recorded in job_runs.
create or replace function private.run_ledger_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('ledger-reminders', to_char(now() at time zone 'utc', 'YYYY-MM-DD'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.ledger_send_nudges(now());
    perform private.ledger_remind_pending(now());
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.ledger_send_nudges(timestamptz) from public, anon, authenticated;
revoke all on function private.ledger_remind_pending(timestamptz) from public, anon, authenticated;
revoke all on function private.run_ledger_reminders() from public, anon, authenticated;

-- 08:00 UTC: the morning in London, all year round give or take an hour.
select cron.schedule('ledger-reminders', '0 8 * * *', 'select private.run_ledger_reminders()');
