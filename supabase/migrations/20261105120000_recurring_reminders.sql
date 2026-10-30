-- Recurring: reminders and the daily job (SPEC-recurring R15, R16, R22).
--
-- One daily job, after the generator, tells the right people and nobody else:
--   * rent: each person with rent still unpaid, 7, 3, 2 and 1 days before it is due, on the day, and
--     then every day until it is paid (confirmed, or pending and waiting for the collector). The
--     message carries only that person's own amount.
--   * a variable bill with no amount yet: its payer, 14, 7, 3 and 1 days before it is due, on the
--     day, and then every day until the amount is entered.
--   * the collector, once a month, when someone is overdue (how many, not who: they see names as an
--     admin on the rent screen).
--   * the collector again, once a day up to 3 times, for a payment nobody has decided for 2 days.
--   * admins, every day, while a rent or bill is paused because someone left, until it is resumed.
-- Everything goes through private.notify, so each person's own settings (off, snooze) apply and
-- the dedupe keys make running the job twice harmless. Every function takes the time as a
-- parameter so tests can move through it.

create or replace function private.recurring_remind(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.recurring_london_date(p_now);
  v_key text := to_char(v_today, 'YYYYMMDD');
  r record;
  v_days integer;
  v_collector text;
begin
  -- Rent still unpaid: one message per person per rent per day, using their oldest unpaid charge to
  -- decide the day and their whole outstanding amount for the text.
  for r in
    select s.profile_id, s.template_id, h.id as household_id, ch.collector_id,
           min(s.due_on) as first_due, sum(s.outstanding_pence)::bigint as owed
      from public.households h
      cross join lateral private.rent_charge_status(h.id, null) s
      join public.rent_charges ch on ch.id = s.charge_id
     where h.closed_at is null and s.outstanding_pence > 0
     group by s.profile_id, s.template_id, h.id, ch.collector_id
     order by s.template_id, s.profile_id
  loop
    continue when not private.recurring_is_member(r.household_id, r.profile_id, false);
    v_days := r.first_due - v_today;
    continue when v_days >= 0 and v_days not in (7, 3, 2, 1, 0);
    select display_name into v_collector from public.profiles where id = r.collector_id;
    perform private.notify(
      r.profile_id, r.household_id, 'recurring_reminder',
      left('Your rent of ' || private.format_pence(r.owed) || ' to ' || coalesce(v_collector, 'the collector')
           || case when v_days < 0 then ' was due on ' else ' is due on ' end || to_char(r.first_due, 'FMDD Mon'), 80),
      case when v_days < 0 then 'When you have paid, record it on the rent screen so it can be confirmed.'
           else 'You can record your payment on the rent screen once you have paid.' end,
      '/money/rent', 'rent_reminder:' || r.template_id || ':' || r.profile_id || ':' || v_key
    );
  end loop;

  -- The payer of a variable bill that still has no amount.
  for r in
    select i.id, i.due_on, i.household_id, t.name, t.paid_by
      from public.recurring_instances i
      join public.recurring_templates t on t.id = i.template_id
     where i.status = 'awaiting_amount' and t.kind = 'bill'
       and t.ended_at is null and t.paused_at is null
     order by i.id
  loop
    continue when not private.recurring_is_member(r.household_id, r.paid_by, false);
    v_days := r.due_on - v_today;
    continue when v_days >= 0 and v_days not in (14, 7, 3, 1, 0);
    perform private.notify(
      r.paid_by, r.household_id, 'bill_amount_needed',
      left('Enter this month''s ' || r.name || ' amount', 80),
      case when v_days < 0 then 'It was due on ' else 'It is due on ' end || to_char(r.due_on, 'FMDD Mon')
        || '. Open it to type the amount from the bill or letter.',
      '/money/recurring/instances/' || r.id || '/amount', 'bill_amount:' || r.id || ':' || v_key
    );
  end loop;

  -- The collector, once a month, when someone is overdue.
  for r in
    select s.template_id, s.period, t.household_id, t.paid_by, count(distinct s.profile_id)::integer as n
      from public.households h
      cross join lateral private.rent_charge_status(h.id, null) s
      join public.recurring_templates t on t.id = s.template_id
     where h.closed_at is null and s.outstanding_pence > 0 and s.due_on < v_today
       and private.recurring_is_member(h.id, s.profile_id, false)
     group by s.template_id, s.period, t.household_id, t.paid_by
     order by s.template_id, s.period
  loop
    continue when not private.recurring_is_member(r.household_id, r.paid_by, true);
    perform private.notify(
      r.paid_by, r.household_id, 'recurring_attention',
      r.n || case when r.n = 1 then ' person has' else ' people have' end || ' not paid '
        || to_char(r.period, 'FMMonth') || ' rent',
      'Open the rent screen to see who, and confirm any payments waiting for you.',
      '/money/rent', 'rent_overdue:' || r.template_id || ':' || to_char(r.period, 'YYYYMM')
    );
  end loop;

  -- A rent payment nobody has decided for 2 days: the collector (or every admin but the payer when
  -- the collector has gone), once a day, three times.
  for r in
    select p.id, p.household_id, p.collector_id, p.payer_id, p.amount_pence, pr.display_name as payer
      from public.rent_payments p
      join public.profiles pr on pr.id = p.payer_id
     where p.status = 'pending' and p.created_at <= p_now - interval '2 days'
     order by p.id
  loop
    if private.recurring_is_member(r.household_id, r.collector_id, true) and r.collector_id <> r.payer_id then
      continue when (select count(*) from public.notifications n
                      where n.recipient_id = r.collector_id
                        and n.dedupe_key like 'rent_payment_reminder:' || r.id || ':%') >= 3;
      perform private.notify(
        r.collector_id, r.household_id, 'rent_payment_pending',
        left('Reminder: ' || r.payer || ' says they paid ' || private.format_pence(r.amount_pence) || ' rent', 80),
        'Please confirm it if it has arrived, or say it has not.',
        '/money/rent', 'rent_payment_reminder:' || r.id || ':' || v_key
      );
    end if;
  end loop;

  -- Rents and bills paused because someone left stay in front of the admins until resumed.
  for r in
    select t.id, t.household_id, t.name, t.kind
      from public.recurring_templates t
     where t.paused_at is not null and t.paused_reason in ('member_left', 'payer_left')
       and t.ended_at is null and private.recurring_london_date(t.paused_at) < v_today
     order by t.id
  loop
    perform private.recurring_notify_admins(
      r.household_id, 'recurring_attention',
      case when r.kind = 'rent' then 'The rent is still paused' else r.name || ' is still paused' end,
      'Nothing new is created until an admin checks it and resumes it.',
      '/money/recurring/' || r.id, 'recurring_paused_daily:' || r.id || ':' || v_key
    );
  end loop;
end;
$$;

-- Once per UTC day, however often it is triggered, recorded in job_runs: first the generator, then
-- the leavers' unpaid rent, then the reminders, so a month created today is in place when the
-- reminders go out.
create or replace function private.run_recurring_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('recurring-daily', to_char(now() at time zone 'utc', 'YYYY-MM-DD'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.recurring_generate(now());
    perform private.recurring_notify_leavers(now());
    perform private.recurring_remind(now());
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.recurring_remind(timestamptz) from public, anon, authenticated;
revoke all on function private.run_recurring_daily() from public, anon, authenticated;

-- 07:00 UTC, an hour before the ledger's reminders, so a newly created month is in place first.
select cron.schedule('recurring-daily', '0 7 * * *', 'select private.run_recurring_daily()');
