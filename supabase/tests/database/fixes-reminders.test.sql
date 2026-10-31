begin;
select plan(15);

-- Extras D: the weekly nudge and retention (SPEC-extras D). Idempotent, fixed push text, clock-driven.

select ok(exists (select 1 from cron.job where jobname = 'fix-stale' and schedule = '32 9 * * *'),
  'the fix-it job runs daily at 09:32 UTC');
select ok(
  not has_function_privilege('authenticated', 'private.run_fix_stale(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'private.fix_remind(timestamptz)', 'execute'),
  'the job functions are not callable from the browser');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name": "Frank"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.frank', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000f'), true);
insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member');
insert into public.memberships (household_id, profile_id, role, left_at, left_reason)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 'member', now(), 'left');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.carol')::uuid, 'https://push.example/carol', 'k', 'a');

-- "Now" for the job. Reports are made 8 days before it.
-- A: chased by Carol, quiet 8 days.      B: nobody chasing, quiet 8 days.
-- C: a note 2 days ago.                  D: fixed.        E: hidden.
-- F: its chaser (Frank) has left, quiet 8 days.
insert into public.fix_reports (id, household_id, title, reported_by, chaser_id, status, fixed_at, hidden_at, created_at, status_changed_at, last_activity_at)
values
  ('f0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'Leaky tap', current_setting('t.bob')::uuid, current_setting('t.carol')::uuid, 'open', null, null, '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00'),
  ('f0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'Broken lock', current_setting('t.bob')::uuid, null, 'open', null, null, '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00'),
  ('f0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001', 'Noisy pipe', current_setting('t.bob')::uuid, null, 'in_progress', null, null, '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00', '2026-11-18 09:00:00+00'),
  ('f0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000001', 'Fixed already', current_setting('t.bob')::uuid, null, 'fixed', '2026-11-15 09:00:00+00', null, '2026-11-12 09:00:00+00', '2026-11-15 09:00:00+00', '2026-11-12 09:00:00+00'),
  ('f0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-000000000001', 'Hidden one', current_setting('t.bob')::uuid, null, 'open', null, '2026-11-14 09:00:00+00', '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00'),
  ('f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-000000000001', 'Chaser left', current_setting('t.bob')::uuid, current_setting('t.frank')::uuid, 'open', null, null, '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00', '2026-11-12 09:00:00+00');

select private.run_fix_stale('2026-11-20 09:32:00+00');

select is((select count(*)::int from public.notifications where dedupe_key like 'fix_stale:f0000000-0000-0000-0000-00000000000a:%'
            and recipient_id = current_setting('t.carol')::uuid), 1, 'the chaser of a stale report is nudged');
select is((select count(*)::int from public.notifications where dedupe_key like 'fix_stale:f0000000-0000-0000-0000-00000000000a:%'
            and recipient_id <> current_setting('t.carol')::uuid), 0, 'and nobody else is');
select is((select count(*)::int from public.notifications where dedupe_key like 'fix_stale:f0000000-0000-0000-0000-00000000000b:%'
            and recipient_id = current_setting('t.alice')::uuid), 1, 'with no chaser the admins are nudged');
select is((select count(*)::int from public.notifications where dedupe_key like 'fix_stale:f0000000-0000-0000-0000-00000000000f:%'
            and recipient_id = current_setting('t.alice')::uuid), 1, 'and also when the chaser has left');
select is((select count(*)::int from public.notifications where dedupe_key ~ ':f0000000-0000-0000-0000-00000000000[cde]:'), 0,
  'a recent note, a fixed report and a hidden one send nothing');
select is((select count(*)::int from public.notifications where type = 'fix_stale'), 3, 'three nudges in all');

select private.run_fix_stale('2026-11-20 09:32:00+00');
select private.run_fix_stale('2026-11-21 09:32:00+00');
select is((select count(*)::int from public.notifications where type = 'fix_stale'), 3,
  'running again, even the next day, adds nothing in the same week');
select is((select count(*)::int from public.job_runs where job_name = 'fix-stale'), 2, 'one job_runs row per London day');

select private.run_fix_stale('2026-11-27 09:32:00+00');
select is((select count(*)::int from public.notifications where type = 'fix_stale' and dedupe_key like 'fix_stale:f0000000-0000-0000-0000-00000000000a:%'), 2,
  'the next week sends again');

-- The push text is the fixed text.
create temp table claimed as select * from public.claim_push_outbox(10);
select results_eq(
  $$select distinct title, body from claimed$$,
  $$values ('Fix-it reminder'::text, 'A problem is still waiting. Open FlatMate to see it.'::text)$$,
  'the push says only the fixed text, with no problem title');

-- A recent note resets the clock.
update public.fix_reports set last_activity_at = '2026-12-01 09:00:00+00' where id = 'f0000000-0000-0000-0000-00000000000b';
select private.run_fix_stale('2026-12-04 09:32:00+00');
select is((select count(*)::int from public.notifications where dedupe_key like 'fix_stale:f0000000-0000-0000-0000-00000000000b:%'), 2,
  'a note made inside the last 7 days stops further nudges (the two earlier weeks stay)');

-- Retention.
insert into public.fix_reports (id, household_id, title, reported_by, status, fixed_at, hidden_at, created_at)
values
  ('f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'old hidden', current_setting('t.bob')::uuid, 'open', null, '2026-10-01 00:00:00+00', '2026-09-01 00:00:00+00'),
  ('f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'recent hidden', current_setting('t.bob')::uuid, 'open', null, '2026-11-30 00:00:00+00', '2026-09-01 00:00:00+00'),
  ('f1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'ancient fixed', current_setting('t.bob')::uuid, 'fixed', '2024-01-01 00:00:00+00', null, '2023-12-01 00:00:00+00'),
  ('f1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'year old fixed', current_setting('t.bob')::uuid, 'fixed', '2026-01-01 00:00:00+00', null, '2025-12-01 00:00:00+00');
insert into public.fix_updates (household_id, report_id, kind, body, author_id)
values ('a0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'note', 'n', current_setting('t.bob')::uuid);
select private.run_fix_stale('2026-12-05 09:32:00+00');
select is((select string_agg(title, ',' order by title) from public.fix_reports where title in ('old hidden', 'recent hidden', 'ancient fixed', 'year old fixed')),
  'recent hidden,year old fixed', 'retention removes hidden reports after 30 days and fixed ones after 2 years');
select is((select count(*)::int from public.fix_updates where report_id = 'f1000000-0000-0000-0000-000000000001'), 0,
  'with their timelines');

select * from finish();
rollback;
