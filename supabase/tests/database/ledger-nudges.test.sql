begin;
select plan(48);

-- Gentle money reminders (SPEC-ledger L7, L10). A daily job nudges people who have owed more than
-- £1 for at least their flat's interval (default 7 days), once per period, and reminds the receiver
-- of a payment nobody has decided for 2 days, once a day, at most 3 times. The job functions take
-- the time as a parameter so these tests can move through time.

select has_function('public', 'set_nudge_interval', array['integer'], 'set_nudge_interval exists');
select ok(
  not has_function_privilege('anon', 'public.set_nudge_interval(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.set_nudge_interval(integer)', 'execute'),
  'signed-in people can call it; anon cannot'
);
select ok(
  exists (select 1 from cron.job where jobname = 'ledger-reminders' and schedule = '0 8 * * *'),
  'the daily job is scheduled'
);
select ok(
  not has_function_privilege('authenticated', 'private.run_ledger_reminders()', 'execute')
  and not has_function_privilege('anon', 'private.run_ledger_reminders()', 'execute'),
  'and nobody in the browser can run it'
);

-- alice (owner), bob, carol, gina, hal, frank in Flat A; ivy and jon in Flat B (nudges off); dave alone in D.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-000000000010', 'gina@example.com', '{"full_name": "Gina"}'),
  ('00000000-0000-0000-0000-000000000011', 'hal@example.com', '{"full_name": "Hal"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name": "Frank"}'),
  ('00000000-0000-0000-0000-000000000012', 'ivy@example.com', '{"full_name": "Ivy"}'),
  ('00000000-0000-0000-0000-000000000013', 'jon@example.com', '{"full_name": "Jon"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.gina', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000010'), true);
select set_config('t.hal', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000011'), true);
select set_config('t.frank', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000f'), true);
select set_config('t.ivy', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000012'), true);
select set_config('t.jon', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000013'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('b0000000-0000-0000-0000-000000000001', 'Flat B', current_setting('t.ivy')::uuid);
update public.households set nudge_after_days = null where id = 'b0000000-0000-0000-0000-000000000001';
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.hal')::uuid, 'member'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.ivy')::uuid, 'owner'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.jon')::uuid, 'member');
insert into public.memberships (household_id, profile_id, role)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 'member');

-- Alice has a phone, so a pushing reminder queues a push.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.alice')::uuid, 'https://push.example/alice', 'k', 'a');

-- Expenses, all paid by alice. How old each is decides who gets nudged.
--   bob:   owes 10.00, from 10 days ago      -> nudged
--   carol: owes 0.50,  from 10 days ago      -> too little to nudge
--   gina:  owes 10.00, from 2 days ago       -> too recent (7-day interval)
--   hal:   owes 10.00 from 10 days ago, but paid back 9.50 five days ago -> owes 0.50 now
--   frank: owes 10.00 from 10 days ago, but has left -> never nudged
--   jon:   owes 10.00 from 10 days ago, in a flat with nudges off -> never nudged
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on, created_at) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 2000, 'Old shop', 'groceries', current_date - 10, now() - interval '10 days'),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 1050, 'Old small', 'other', current_date - 10, now() - interval '10 days'),
  ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 1000, 'Recent', 'other', current_date - 2, now() - interval '2 days'),
  ('e4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 2000, 'Old for hal and frank', 'other', current_date - 10, now() - interval '10 days'),
  ('e5000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', current_setting('t.ivy')::uuid, current_setting('t.ivy')::uuid, 1000, 'Flat B', 'other', current_date - 10, now() - interval '10 days');
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 1000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 1000),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 50),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 1000),
  ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid, 1000),
  ('e4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.hal')::uuid, 1000),
  ('e4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 1000),
  ('e5000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', current_setting('t.jon')::uuid, 1000);
set constraints all immediate;

-- Hal paid back 9.50 five days ago.
insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence, status, confirmed_by, created_at, decided_at)
values ('51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.hal')::uuid, current_setting('t.alice')::uuid, 950, 'confirmed', current_setting('t.alice')::uuid,
        now() - interval '5 days', now() - interval '5 days');

-- Frank owed money and then left.
update public.memberships set left_at = now(), left_reason = 'left'
 where profile_id = current_setting('t.frank')::uuid and left_at is null;

-- ---------------------------------------------------------------------------------------------
-- The interval setting.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.set_nudge_interval(3) $sql$, '42501', 'not_allowed', 'a plain member cannot change it');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.set_nudge_interval(3) $sql$, '42501', 'not_allowed', 'nor can someone with no flat');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.set_nudge_interval(5) $sql$, '22023', 'invalid_interval', 'only 3, 7 or 14 days (or off) are allowed');
select throws_ok($sql$ select public.set_nudge_interval(0) $sql$, '22023', 'invalid_interval', 'not 0 either');
select lives_ok($sql$ select public.set_nudge_interval(14) $sql$, 'the owner can set 14 days');
reset role;
select is((select nudge_after_days from public.households where id = 'a0000000-0000-0000-0000-000000000001'), 14::smallint, 'and it is saved');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.set_nudge_interval(null) $sql$, 'null switches nudges off');
reset role;
select is((select nudge_after_days from public.households where id = 'a0000000-0000-0000-0000-000000000001'), null::smallint, 'which is saved as off');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.set_nudge_interval(7) $sql$, 'and 7 days is the usual setting');
reset role;
select is((select nudge_after_days from public.households where id = 'b0000000-0000-0000-0000-000000000001'), null::smallint,
  'another flat''s setting is untouched');

-- ---------------------------------------------------------------------------------------------
-- Balance as it stood at an earlier time.
select is(private.ledger_person_balance_at('a0000000-0000-0000-0000-000000000001', current_setting('t.hal')::uuid, now() - interval '6 days'),
  -1000::bigint, 'six days ago Hal owed the full 10.00');
select is(private.ledger_person_balance_at('a0000000-0000-0000-0000-000000000001', current_setting('t.hal')::uuid, now()),
  -50::bigint, 'and now only 0.50, after paying 9.50');
select is(private.ledger_person_balance_at('a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid, now() - interval '5 days'),
  0::bigint, 'Gina owed nothing before her expense existed');
select is(private.ledger_person_balance_at('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, now()),
  private.ledger_person_balance('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid),
  'and "now" agrees with the ordinary balance');

-- ---------------------------------------------------------------------------------------------
-- Nudges.
select private.ledger_send_nudges(now());

select results_eq(
  $$select recipient_id, type, title, href from public.notifications where type = 'payment_nudge'$$,
  $$select current_setting('t.bob')::uuid, 'payment_nudge'::text, 'Gentle reminder: you owe £10.00'::text, '/money'::text$$,
  'only Bob, who has owed over £1 for 7 days, is nudged'
);
select is((select body from public.notifications where type = 'payment_nudge'),
  'That is what you owe across Flat A. When you have paid, record it on the Money screen.', 'with a kind explanation');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.carol')::uuid), 0,
  'Carol, who owes 0.50, is not nudged');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.gina')::uuid), 0,
  'Gina, whose debt is 2 days old, is not nudged yet');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.hal')::uuid), 0,
  'Hal, who paid most of it back, is not nudged');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.frank')::uuid), 0,
  'someone who has left is never nudged');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.jon')::uuid), 0,
  'a flat with nudges off is left alone');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.alice')::uuid), 0,
  'and the person who is owed money is not nudged');
select is((select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id where n.type = 'payment_nudge'), 0,
  'a nudge does not push unless the person turns that on');

select private.ledger_send_nudges(now());
select is((select count(*)::int from public.notifications where type = 'payment_nudge'), 1,
  'running it again in the same period nudges nobody twice');

-- Off means off.
update public.households set nudge_after_days = null where id = 'a0000000-0000-0000-0000-000000000001';
select private.ledger_send_nudges(now() + interval '30 days');
select is((select count(*)::int from public.notifications where type = 'payment_nudge'), 1, 'with nudges off nobody is nudged');

-- A shorter interval brings Gina in once her debt is old enough, and Bob gets a fresh nudge in the new period.
update public.households set nudge_after_days = 3 where id = 'a0000000-0000-0000-0000-000000000001';
select private.ledger_send_nudges(now() + interval '2 days');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.gina')::uuid), 1,
  'with a 3-day interval Gina, who has owed for 3 days by then, is nudged');
select is((select title from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.gina')::uuid),
  'Gentle reminder: you owe £10.00', 'for her whole balance');

-- A closed flat is not nudged.
update public.households set closed_at = now() where id = 'a0000000-0000-0000-0000-000000000001';
update public.notifications set dedupe_key = dedupe_key || ':old' where type = 'payment_nudge';
select private.ledger_send_nudges(now() + interval '2 days');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and dedupe_key not like '%:old'), 0,
  'a closed flat is not nudged');
update public.households set closed_at = null where id = 'a0000000-0000-0000-0000-000000000001';
delete from public.notifications where type = 'payment_nudge';

-- ---------------------------------------------------------------------------------------------
-- Reminders about payments nobody has decided.
-- Bob says he paid Alice 6.00 three days ago; Carol says she paid Alice 1.00 one day ago; Gina's was
-- cancelled; Hal's payment was to Frank, who has left.
insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence, created_at) values
  ('52000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.alice')::uuid, 600, now() - interval '3 days'),
  ('53000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, current_setting('t.alice')::uuid, 100, now() - interval '1 day');
insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence, status, created_at, decided_at) values
  ('54000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid, current_setting('t.alice')::uuid, 100, 'cancelled', now() - interval '3 days', now() - interval '2 days');

select private.ledger_remind_pending(now());
select results_eq(
  $$select recipient_id, type, title, body, href from public.notifications where dedupe_key like 'settlement_reminder:%'$$,
  $$select current_setting('t.alice')::uuid, 'settlement_pending'::text, 'Reminder: Bob says they paid you'::text,
           'Confirm £6.00 if it has arrived, or say it has not.'::text, '/money'::text$$,
  'a payment waiting 3 days reminds the receiver, with the amount'
);
select is((select dedupe_key from public.notifications where dedupe_key like 'settlement_reminder:%'),
  'settlement_reminder:52000000-0000-0000-0000-000000000002:' || to_char(now() at time zone 'utc', 'YYYYMMDD'),
  'one reminder per day, keyed by the date');
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:%53000000%'), 0,
  'a payment only a day old is not reminded about yet');
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:%54000000%'), 0,
  'nor one that was cancelled');

create temp table claimed_reminder as select * from public.claim_push_outbox(10);
select is((select count(*)::int from claimed_reminder where title = 'Payment to confirm' and body !~ '[£0-9]'), 1,
  'the reminder''s push uses the generic text, with no amount');

select private.ledger_remind_pending(now());
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:%'), 1,
  'running it again the same day does not remind twice');
select private.ledger_remind_pending(now() + interval '1 day');
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:52%'), 2,
  'the next day brings the second reminder');
select private.ledger_remind_pending(now() + interval '2 days');
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:52%'), 3,
  'and the day after the third');
select private.ledger_remind_pending(now() + interval '3 days');
select private.ledger_remind_pending(now() + interval '10 days');
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:52%'), 3,
  'then it stops');
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:53%'), 3,
  'Carol''s younger payment is reminded about once it is 2 days old, three times, then stops');

-- A decided payment is never reminded about, and neither is one to someone who has left.
update public.settlements set status = 'confirmed', decided_at = now(), confirmed_by = current_setting('t.alice')::uuid
 where id = '52000000-0000-0000-0000-000000000002';
delete from public.notifications where dedupe_key like 'settlement_reminder:%';
select private.ledger_remind_pending(now() + interval '1 day');
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:52%'), 0, 'a confirmed payment gets no reminder');

insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence, created_at)
values ('55000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.hal')::uuid, current_setting('t.frank')::uuid, 100, now() - interval '3 days');
select private.ledger_remind_pending(now());
select is((select count(*)::int from public.notifications where dedupe_key like 'settlement_reminder:55%'), 0,
  'a payment to someone who has left gets no reminder (an admin decides it)');

-- ---------------------------------------------------------------------------------------------
-- The daily job.
delete from public.notifications where type in ('payment_nudge', 'settlement_pending');
select private.run_ledger_reminders();
select private.run_ledger_reminders();
select is((select count(*)::int from public.job_runs where job_name = 'ledger-reminders'), 1,
  'the daily job records one run per day, however often it is triggered');
select is((select status from public.job_runs where job_name = 'ledger-reminders'), 'succeeded', 'and it succeeded');
select is((select count(*)::int from public.notifications where type = 'payment_nudge' and recipient_id = current_setting('t.bob')::uuid), 1,
  'and does the nudging');

-- Everything stayed inside its own flat.
select is((select count(*)::int from public.notifications n where n.type in ('payment_nudge', 'settlement_pending')
             and not exists (select 1 from public.memberships m where m.profile_id = n.recipient_id and m.household_id = n.household_id)), 0,
  'every reminder went to someone in the flat it is about');

select * from finish();
rollback;
