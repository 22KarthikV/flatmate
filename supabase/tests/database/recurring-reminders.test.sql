begin;
select plan(25);

-- Recurring: reminders and the daily job (SPEC-recurring R15, R16, R22). The reminder function takes
-- the time as a parameter, so each test day is a plain call. Rent is due 6 Nov 2026 and the gas
-- (a variable bill, paid by Alice) 12 Nov. Flat A: Sam (owner, collector), Dee (admin who also
-- pays rent), Alice, Bob and Cara. Alice has unpaid rent; Bob has paid in full; Cara has a payment
-- waiting for the collector; Dee has unpaid rent but has turned the reminders off.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'sam@example.com', '{"full_name": "Sam"}'),
  ('00000000-0000-0000-0000-000000000002', 'dee@example.com', '{"full_name": "Dee"}'),
  ('00000000-0000-0000-0000-000000000003', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-000000000004', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-000000000005', 'cara@example.com', '{"full_name": "Cara"}');
select set_config('t.' || split_part(u.email, '@', 1), p.id::text, true)
  from auth.users u join public.profiles p on p.user_id = u.id;

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.sam')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, 'member');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.alice')::uuid, 'https://push.example/alice', 'k', 'a');
insert into public.notification_preferences (profile_id, type, in_app, push)
values (current_setting('t.dee')::uuid, 'recurring_reminder', false, false);

create function pg_temp.at(d date) returns timestamptz language sql as
  $$ select ((d + time '12:00') at time zone 'Europe/London') $$;

insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'rent', 'Rent', current_setting('t.sam')::uuid, 6, 'fixed', null, 'amounts', current_setting('t.sam')::uuid),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Gas', current_setting('t.alice')::uuid, 12, 'variable', null, 'equal', current_setting('t.sam')::uuid);
insert into public.recurring_instances (id, template_id, household_id, period, due_on, status) values
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-06', 'posted'),
  ('e2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-12', 'awaiting_amount');
insert into public.rent_charges (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on) values
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 60000, '2026-11-06'),
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 60000, '2026-11-06'),
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.cara')::uuid, current_setting('t.sam')::uuid, 55000, '2026-11-06'),
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.dee')::uuid, current_setting('t.sam')::uuid, 10000, '2026-11-06');
insert into public.rent_payments (household_id, template_id, payer_id, collector_id, amount_pence, status, decided_by, decided_at) values
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 60000, 'confirmed', current_setting('t.sam')::uuid, '2026-11-01');
insert into public.rent_payments (id, household_id, template_id, payer_id, collector_id, amount_pence, status, created_at) values
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, current_setting('t.sam')::uuid, 55000, 'pending', '2026-11-01 12:00:00+00');

-- Walk through every day from 29 Oct to 14 Nov, running the reminders each day, twice.
select private.recurring_remind(pg_temp.at(d::date)) from generate_series(date '2026-10-29', date '2026-11-14', interval '1 day') d;
select private.recurring_remind(pg_temp.at(d::date)) from generate_series(date '2026-10-29', date '2026-11-14', interval '1 day') d;

-- Rent: 7, 3, 2 and 1 days before, the day, then every day.
select is(
  (select array_agg(right(dedupe_key, 8) order by dedupe_key) from public.notifications
    where recipient_id = current_setting('t.alice')::uuid and type = 'recurring_reminder'),
  array['20261030', '20261103', '20261104', '20261105', '20261106', '20261107', '20261108', '20261109', '20261110', '20261111', '20261112', '20261113', '20261114']::text[],
  'Alice, who has not paid, is reminded 7, 3, 2 and 1 days before, on the day, then daily, and only once a day however often the job runs'
);
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.bob')::uuid and type = 'recurring_reminder'), 0, 'Bob, who paid in full, is never reminded');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.cara')::uuid and type = 'recurring_reminder'), 0, 'nor is Cara, whose payment is waiting for the collector');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.dee')::uuid and type = 'recurring_reminder'), 0, 'nor is Dee, who turned the reminders off');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.sam')::uuid and type = 'recurring_reminder'), 0, 'the collector owes no rent and gets no rent reminder');
select ok((select bool_and(title like 'Your rent of £600.00 to Sam %') from public.notifications where recipient_id = current_setting('t.alice')::uuid and type = 'recurring_reminder'), 'a reminder carries the recipient''s own amount and the collector');
select is((select count(*)::int from public.notifications where type = 'recurring_reminder' and (title || body) ~ '(550|100\.00|60000)'), 0, 'and nobody else''s amount');
select ok((select title from public.notifications where recipient_id = current_setting('t.alice')::uuid and dedupe_key like '%20261106') like '%is due on 6 Nov', 'worded as due before the day');
select ok((select title from public.notifications where recipient_id = current_setting('t.alice')::uuid and dedupe_key like '%20261108') like '%was due on 6 Nov', 'and as overdue after it');
select is((select count(*)::int from public.notifications n join public.push_outbox o on o.notification_id = n.id where n.type = 'recurring_reminder'), 13, 'a rent reminder pushes to the person''s phone (generic text, set on the type)');

-- A variable bill: 14, 7, 3 and 1 days before, the day, then daily, until the amount is entered.
select is(
  (select array_agg(right(dedupe_key, 8) order by dedupe_key) from public.notifications
    where recipient_id = current_setting('t.alice')::uuid and type = 'bill_amount_needed'),
  array['20261029', '20261105', '20261109', '20261111', '20261112', '20261113', '20261114']::text[],
  'the payer of a variable bill is reminded 14, 7, 3 and 1 days before, on the day, then daily'
);
select is((select count(*)::int from public.notifications where type = 'bill_amount_needed' and recipient_id <> current_setting('t.alice')::uuid), 0, 'and nobody else is');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select public.enter_bill_amount('e2000000-0000-0000-0000-000000000002', 8450);
reset role;
select private.recurring_remind(pg_temp.at(date '2026-11-15'));
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.alice')::uuid and type = 'bill_amount_needed' and dedupe_key like '%20261115'), 0, 'once the amount is entered the reminders stop');

-- The collector: one message about overdue rent per month, and the pending payment, up to three times.
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.sam')::uuid and dedupe_key = 'rent_overdue:c1000000-0000-0000-0000-000000000001:202611'), 1, 'the collector is told once that rent is overdue');
select is((select title from public.notifications where recipient_id = current_setting('t.sam')::uuid and dedupe_key like 'rent_overdue:%'), '2 people have not paid November rent', 'with how many, not who');
select is((select count(*)::int from public.notifications where dedupe_key like 'rent_overdue:%' and recipient_id <> current_setting('t.sam')::uuid), 0, 'and nobody else is');
select is((select array_agg(right(dedupe_key, 8) order by dedupe_key) from public.notifications where recipient_id = current_setting('t.sam')::uuid and dedupe_key like 'rent_payment_reminder:%'),
  array['20261103', '20261104', '20261105']::text[], 'a payment nobody has decided for 2 days reminds the collector once a day, three times');
select is((select count(*)::int from public.notifications where dedupe_key like 'rent_payment_reminder:%' and recipient_id <> current_setting('t.sam')::uuid), 0, 'and only the collector');

-- A paused rent stays in front of the admins daily until resumed (but not on the day it was paused).
update public.recurring_templates set paused_at = '2026-11-12 08:00:00+00', paused_reason = 'member_left' where id = 'c1000000-0000-0000-0000-000000000001';
update public.recurring_templates set paused_at = '2026-11-12 08:00:00+00', paused_reason = 'admin' where id = 'c2000000-0000-0000-0000-000000000002';
select private.recurring_remind(pg_temp.at(date '2026-11-12'));
select private.recurring_remind(pg_temp.at(date '2026-11-13'));
select private.recurring_remind(pg_temp.at(date '2026-11-14'));
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.sam')::uuid and dedupe_key like 'recurring_paused_daily:%'), 2, 'the admins are reminded on each day after the pause, not on the day');
select is((select count(*)::int from public.notifications where dedupe_key like 'recurring_paused_daily:c2%'), 0, 'and not about something an admin paused on purpose');
select is((select count(*)::int from public.notifications where dedupe_key like 'recurring_paused_daily:%' and recipient_id in (current_setting('t.alice')::uuid, current_setting('t.bob')::uuid, current_setting('t.cara')::uuid)), 0, 'and not members');

-- No notice this module sends carries a currency amount in its push text, and the types are generic.
select is((select count(*)::int from public.notification_types
            where type in ('recurring_reminder', 'bill_amount_needed', 'rent_payment_pending', 'recurring_attention') and (push_title ~ '[£0-9]' or push_body ~ '[£0-9]')), 0, 'push text is fixed and has no amount');

-- The daily job: scheduled, recorded once a day, and not callable from the browser.
select ok(exists (select 1 from cron.job where jobname = 'recurring-daily' and schedule = '0 7 * * *'), 'the daily job is scheduled at 07:00 UTC');
select ok(not has_function_privilege('authenticated', 'private.run_recurring_daily()', 'execute') and not has_function_privilege('anon', 'private.run_recurring_daily()', 'execute')
  and not has_function_privilege('authenticated', 'private.recurring_remind(timestamptz)', 'execute'), 'nobody in the browser can run it');
select private.run_recurring_daily();
select private.run_recurring_daily();
select is((select count(*)::int from public.job_runs where job_name = 'recurring-daily' and status = 'succeeded'), 1, 'it runs once per day however often it is triggered, and is recorded');

select * from finish();
rollback;
