begin;
select plan(21);

-- Extras B: the bin reminder (SPEC-extras B). Decided by the London hour, idempotent, fixed push text.

select ok(exists (select 1 from cron.job where jobname = 'bins-reminders' and schedule = '27 * * * *'),
  'the reminder runs hourly at minute 27');
select results_eq(
  $$select default_in_app, default_push, snoozable, push_title, push_body from public.notification_types where type = 'bin_reminder'$$,
  $$values (true, true, true, 'Bin night'::text, 'A bin collection is tomorrow. Open FlatMate to see which.'::text)$$,
  'bin_reminder is in the registry with its fixed push text');
select ok(
  not has_function_privilege('authenticated', 'private.run_bins_reminders(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'private.bins_remind(timestamptz)', 'execute'),
  'the job functions are not callable from the browser');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name": "Frank"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
select set_config('t.frank', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000f'), true);
insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');
insert into public.memberships (household_id, profile_id, role, left_at, left_reason)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 'member', now(), 'left');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.carol')::uuid, 'https://push.example/carol', 'k', 'a');

-- Grey bin: weekly on Tuesdays (anchor 3 Nov 2026). Blue box: fortnightly from the same day.
-- Flat D has no bins at all.
insert into public.bin_streams (id, household_id, name, colour, anchor_on, every_weeks, created_by) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Grey bin', 'grey', '2026-11-03', 1, current_setting('t.alice')::uuid),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Blue box', 'blue', '2026-11-03', 2, current_setting('t.alice')::uuid);

-- Midday the day before: too early, nothing.
select private.run_bins_reminders('2026-11-16 12:27:00+00');
select is((select count(*)::int from public.notifications where type = 'bin_reminder'), 0,
  'at 12:27 nothing is sent');

-- 18:27 London (GMT in winter) on Monday 16 Nov: bins go out Tuesday 17th (grey and blue).
select private.run_bins_reminders('2026-11-16 17:27:00+00');
select is((select count(*)::int from public.notifications where type = 'bin_reminder'), 0,
  'at 17:27 UTC in winter (17:27 London) nothing is sent yet');
select private.run_bins_reminders('2026-11-16 18:27:00+00');
select is((select count(*)::int from public.notifications where type = 'bin_reminder'), 3,
  'at 18:27 London each current member gets exactly one reminder');
select results_eq(
  $$select title, body, href from public.notifications where type = 'bin_reminder' and recipient_id = current_setting('t.alice')::uuid$$,
  $$values ('Bins out tonight: Blue box, Grey bin'::text, ''::text, '/more/bins'::text)$$,
  'the inbox row lists the bins and links to the screen');
select is((select count(*)::int from public.notifications where type = 'bin_reminder' and recipient_id = current_setting('t.frank')::uuid), 0,
  'a person who left gets nothing');
select is((select count(*)::int from public.notifications where type = 'bin_reminder' and recipient_id = current_setting('t.dave')::uuid), 0,
  'a flat with no bins gets nothing');

select private.run_bins_reminders('2026-11-16 18:27:00+00');
select private.run_bins_reminders('2026-11-16 19:27:00+00');
select private.run_bins_reminders('2026-11-16 22:27:00+00');
select is((select count(*)::int from public.notifications where type = 'bin_reminder'), 3,
  'running again, later the same evening, adds nothing');
select is((select count(*)::int from public.job_runs where job_name = 'bins-reminders'), 5,
  'the job writes one row per hour, however often it is triggered');
select is((select count(*)::int from public.notifications where type = 'bin_reminder'
            and dedupe_key = 'bin:a0000000-0000-0000-0000-000000000001:2026-11-17'), 3,
  'the dedupe key names the flat and the collection day');

-- 23:27 is too late.
select private.run_bins_reminders('2026-11-17 23:27:00+00');
select is((select count(*)::int from public.notifications where type = 'bin_reminder'), 3, 'nothing is sent at 23:27');

-- Push: Carol has a phone and the type pushes by default; the worker text is the fixed text.
select is((select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
            where n.type = 'bin_reminder'), 1, 'a push is queued for Carol''s phone only');
create temp table claimed as select * from public.claim_push_outbox(10);
select results_eq(
  $$select title, body from claimed$$,
  $$values ('Bin night'::text, 'A bin collection is tomorrow. Open FlatMate to see which.'::text)$$,
  'the push says only the fixed text, with no bin names');

-- Skipped: the 24th is skipped, so the evening of the 23rd sends nothing. The 17th is off-week for
-- blue, so on the 24th only grey would have gone; both are 24 Nov (3 Nov + 3 weeks is off for blue).
insert into public.bin_exceptions (household_id, stream_id, original_on, kind, created_by)
values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-11-24', 'skip', current_setting('t.alice')::uuid);
select private.run_bins_reminders('2026-11-23 18:27:00+00');
select is((select count(*)::int from public.notifications where type = 'bin_reminder'
            and dedupe_key like '%:2026-11-24'), 0, 'a skipped collection sends nothing');

-- Moved: the 1 Dec collection moves to Thursday 3 Dec, so the 30 Nov evening is silent and the
-- evening of 2 Dec sends. (1 Dec is also a blue-box day: 3 Nov + 4 weeks.)
insert into public.bin_exceptions (household_id, stream_id, original_on, kind, moved_to, created_by)
values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-12-01', 'move', '2026-12-03', current_setting('t.alice')::uuid);
select private.run_bins_reminders('2026-11-30 18:27:00+00');
select is((select body from public.notifications where dedupe_key = 'bin:a0000000-0000-0000-0000-000000000001:2026-12-01'
            and recipient_id = current_setting('t.alice')::uuid), '',
  'on the evening before the old date only the unmoved bin is announced');
select is((select title from public.notifications where dedupe_key = 'bin:a0000000-0000-0000-0000-000000000001:2026-12-01'
            and recipient_id = current_setting('t.alice')::uuid), 'Bins out tonight: Blue box',
  'and it does not list the moved bin');
select private.run_bins_reminders('2026-12-02 18:27:00+00');
select is((select title from public.notifications where dedupe_key = 'bin:a0000000-0000-0000-0000-000000000001:2026-12-03'
            and recipient_id = current_setting('t.alice')::uuid), 'Bins out tonight: Grey bin',
  'the moved bin is announced the evening before its new date');

-- Summer time: 18:00 London is 17:00 UTC. 14 Jul 2026 is a Tuesday and a grey-bin day.
select private.run_bins_reminders('2026-07-13 16:27:00+00');
select is((select count(*)::int from public.notifications where dedupe_key like '%:2026-07-14'), 0,
  'in summer 16:27 UTC (17:27 BST) is too early');
insert into public.notification_preferences (profile_id, type, in_app, push)
values (current_setting('t.bob')::uuid, 'bin_reminder', false, false);
select private.run_bins_reminders('2026-07-13 17:27:00+00');
select is((select count(*)::int from public.notifications where dedupe_key like '%:2026-07-14'), 2,
  'in summer 17:27 UTC (18:27 BST) sends, and Bob, who turned it off, gets nothing');

select * from finish();
rollback;
