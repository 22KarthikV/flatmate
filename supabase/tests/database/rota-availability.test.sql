begin;
select plan(43);

-- Rota availability (SPEC-rota T5, T18, assumption 9). Everyone says which days next week they are
-- around; the window opens a week ahead and closes Saturday 18:00 London; whoever has not answered
-- is treated as around every day and marked "assumed"; two nudges go out first. Time is a
-- parameter (p_now), so these tests move through it.

select has_table('public', 'availability', 'availability exists');
select ok((select relrowsecurity from pg_class where oid = 'public.availability'::regclass), 'row-level security is on');
select ok(
  not exists (select 1 from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
               where has_table_privilege('anon', 'public.availability', p.priv))
  and not exists (select 1 from unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
                   where has_table_privilege('authenticated', 'public.availability', p.priv))
  and has_table_privilege('authenticated', 'public.availability', 'select'),
  'anon has nothing; the browser role can only read'
);
select ok(
  has_function_privilege('authenticated', 'public.set_availability(date, boolean[])', 'execute')
  and not has_function_privilege('anon', 'public.set_availability(date, boolean[])', 'execute'),
  'signed-in people can set availability; anon cannot'
);
select matches(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'households' and column_name = 'availability_deadline'),
  'saturday 18:00', 'a flat''s deadline defaults to Saturday 18:00'
);
select is(
  (select count(*)::int from public.notification_types
    where (type, default_in_app, default_push, snoozable) in (('availability_open', true, false, false), ('availability_nudge', true, false, true))),
  2, 'the two availability notification types exist, in-app only, the nudge snoozable'
);
select ok(exists (select 1 from cron.job where jobname = 'rota-availability'), 'the hourly job is scheduled');

-- People: alice (owner), bob, carol in Flat A; frank left Flat A; dave alone in Flat D; erin has no flat.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@example.com', '{"full_name": "Erin"}'),
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

-- Flat A uses the rota (it has a chore); Flat D has none, so it is left alone.
insert into public.chores (household_id, name, cadence, preferred_dow, effort)
values ('a0000000-0000-0000-0000-000000000001', 'Kitchen', 'weekly', 3, 3);

-- Week 1 starts Sunday 8 Nov 2026: its window opens 1 Nov 00:00 and closes Sat 7 Nov 18:00 (GMT).
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

select throws_ok($sql$ select private.rota_set_availability('2026-10-31 23:59:59+00', '2026-11-08',
  array[true,true,true,true,true,true,true]) $sql$, 'P0001', 'window_not_open', 'it cannot be set before the window opens');
select throws_ok($sql$ select private.rota_set_availability('2026-11-07 18:00:00+00', '2026-11-08',
  array[true,true,true,true,true,true,true]) $sql$, 'P0001', 'window_closed', 'it cannot be set once the window has closed');
select throws_ok($sql$ select private.rota_set_availability('2026-11-03 12:00:00+00', '2026-11-09',
  array[true,true,true,true,true,true,true]) $sql$, '22023', 'invalid_week', 'the week must start on a Sunday');
select throws_ok($sql$ select private.rota_set_availability('2026-11-03 12:00:00+00', '2026-11-08',
  array[true,true,true,true,true,true]) $sql$, '22023', 'invalid_days', 'it needs seven answers');
select throws_ok($sql$ select private.rota_set_availability('2026-11-03 12:00:00+00', '2026-11-08',
  array[true,true,null,true,true,true,true]) $sql$, '22023', 'invalid_days', 'a missing answer is refused');

select lives_ok($sql$ select private.rota_set_availability('2026-11-01 00:00:00+00', '2026-11-08',
  array[true,true,true,true,true,true,true]) $sql$, 'the window is open from the start of the Sunday a week ahead');
select lives_ok($sql$ select private.rota_set_availability('2026-11-07 17:59:59+00', '2026-11-08',
  array[true,false,true,true,false,true,true]) $sql$, 'and until the last second before 6pm Saturday');

select results_eq(
  $$select on_date, available, assumed from public.availability
     where profile_id = current_setting('t.bob')::uuid order by on_date$$,
  $$values ('2026-11-08'::date, true, false), ('2026-11-09', false, false), ('2026-11-10', true, false),
           ('2026-11-11', true, false), ('2026-11-12', false, false), ('2026-11-13', true, false),
           ('2026-11-14', true, false)$$,
  'answering again replaces the earlier answers: seven rows, not marked assumed'
);

-- A person with no flat cannot answer.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($sql$ select private.rota_set_availability('2026-11-03 12:00:00+00', '2026-11-08',
  array[true,true,true,true,true,true,true]) $sql$, '42501', 'not_allowed', 'someone with no flat cannot answer');

-- ---------------------------------------------------------------------------------------------
-- The public function uses the real clock; the week it names is long past, so the
-- window is shut and it says so rather than writing.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.set_availability('2020-01-05', array[true,true,true,true,true,true,true]) $sql$,
  'P0001', 'window_closed', 'the public function checks the real time');
select throws_ok($sql$ insert into public.availability (household_id, profile_id, on_date, available)
  values ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, '2026-11-08', true) $sql$,
  '42501', null, 'the browser role cannot write the table directly');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Assumed available: nothing before the close, a full week of "assumed" for the silent after it,
-- the answered left alone, flats without chores and people who left skipped, and idempotent.
select is(private.rota_assume_available('2026-11-07 17:59:59+00'), 0, 'nothing is assumed before the window closes');
select is(
  (select count(*)::int from public.availability where assumed), 0, 'and no row is marked assumed'
);
select is(private.rota_assume_available('2026-11-07 18:00:00+00'), 14, 'at the close, alice and carol get seven assumed days each');
select results_eq(
  $$select p.display_name, count(*)::int, bool_and(a.available), bool_and(a.assumed)
      from public.availability a join public.profiles p on p.id = a.profile_id
     where a.assumed group by p.display_name order by p.display_name$$,
  $$values ('Alice'::text, 7, true, true), ('Carol', 7, true, true)$$,
  'they are marked available and assumed'
);
select is(
  (select count(*)::int from public.availability where profile_id = current_setting('t.bob')::uuid and not assumed),
  7, 'bob''s own answers are untouched'
);
select is((select count(*)::int from public.availability where profile_id = current_setting('t.frank')::uuid), 0,
  'someone who has left is not filled in');
select is((select count(*)::int from public.availability where household_id = 'd0000000-0000-0000-0000-000000000001'), 0,
  'a flat with no chores is left alone');
select is(private.rota_assume_available('2026-11-07 19:00:00+00'), 0, 'running it again changes nothing');

-- ---------------------------------------------------------------------------------------------
-- Everyone in the flat can read everyone''s availability, but not another flat''s.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.availability), 21, 'a flatmate reads all three flatmates'' week');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.availability), 0, 'another flat sees none of it');
reset role;
set local role anon;
select throws_ok($sql$ select count(*) from public.availability $sql$, '42501', null, 'anon cannot read it');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Notifications for week 2 (starts Sunday 15 Nov; window opens Sun 8 Nov 00:00, closes Sat 14 Nov 18:00).
select private.rota_send_availability_notifications('2026-11-07 23:00:00+00');
select is((select count(*)::int from public.notifications where type like 'availability_%' and dedupe_key like '%2026-11-15'),
  0, 'nothing is sent before the window for that week opens');

select private.rota_send_availability_notifications('2026-11-08 09:00:00+00');
select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.type = 'availability_open' and n.dedupe_key like '%2026-11-15' order by 1$$,
  $$values ('Alice'::text), ('Bob'), ('Carol')$$,
  'when the window opens, each current member of a flat using the rota is told'
);
select private.rota_send_availability_notifications('2026-11-08 10:00:00+00');
select is((select count(*)::int from public.notifications where type = 'availability_open' and dedupe_key like '%2026-11-15'),
  3, 'sending again does not repeat it');
select ok(
  (select bool_and(body like '%Answer by Saturday 6pm. If you do not, you will be treated as available every day this week and can be given any chore.%')
     from public.notifications where type = 'availability_open' and dedupe_key like '%2026-11-15'),
  'it states the deadline and the assumed-available consequence in plain words'
);
select is((select count(*)::int from public.notifications where type = 'availability_nudge'), 0, 'no nudge yet');

-- Bob answers for week 2; only the others are nudged.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select private.rota_set_availability('2026-11-09 12:00:00+00', '2026-11-15', array[true,true,true,true,true,true,true]);

select private.rota_send_availability_notifications('2026-11-10 09:00:00+00');
select is((select count(*)::int from public.notifications where type = 'availability_nudge'), 0, 'not yet three days before the close');
select private.rota_send_availability_notifications('2026-11-11 09:00:00+00');
select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.type = 'availability_nudge' order by 1$$,
  $$values ('Alice'::text), ('Carol')$$,
  'three days before the close, those who have not answered are nudged, and bob is not'
);
select private.rota_send_availability_notifications('2026-11-14 09:00:00+00');
select is((select count(*)::int from public.notifications where type = 'availability_nudge'), 4,
  'the morning of the close they are nudged a second time');
select ok(
  (select bool_and(body like '%Answer by Saturday 6pm. If you do not, you will be treated as available every day this week and can be given any chore.%')
     from public.notifications where type = 'availability_nudge'),
  'both nudges state the deadline and the consequence'
);
select private.rota_send_availability_notifications('2026-11-14 09:30:00+00');
select is((select count(*)::int from public.notifications where type = 'availability_nudge'), 4, 'sending again repeats nothing');
select private.rota_send_availability_notifications('2026-11-14 19:00:00+00');
select is((select count(*)::int from public.notifications where type = 'availability_nudge'), 4, 'nothing goes out once the window has closed');
select is((select count(*)::int from public.notifications where type like 'availability_%' and recipient_id = current_setting('t.frank')::uuid),
  0, 'someone who left is never nudged');
select is((select count(*)::int from public.push_outbox), 0, 'nothing is queued as a push');

-- ---------------------------------------------------------------------------------------------
-- The hourly job runs once per hour and records itself.
select private.run_rota_availability();
select private.run_rota_availability();
select is((select count(*)::int from public.job_runs where job_name = 'rota-availability' and status = 'succeeded'), 1,
  'the job runs once an hour however often it is triggered');

select * from finish();
rollback;
