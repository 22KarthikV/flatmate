begin;
select plan(38);

-- Extras B: bin days (SPEC-extras B). Admins type the pattern in; everyone reads; nobody writes a table.

select has_table('public', 'bin_streams', 'bin_streams exists');
select has_table('public', 'bin_exceptions', 'bin_exceptions exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.bin_streams'::regclass, 'public.bin_exceptions'::regclass)),
  'row-level security is enabled on both tables');
select ok(
  not exists (
    select 1 from unnest(array['public.bin_streams', 'public.bin_exceptions']) t(name)
     cross join unnest(array['select','insert','update','delete','truncate']) p(priv)
     where has_table_privilege('anon', t.name, p.priv)),
  'anon has no privileges on the bin tables');
select ok(
  not exists (
    select 1 from unnest(array['public.bin_streams', 'public.bin_exceptions']) t(name)
     cross join unnest(array['insert','update','delete','truncate']) p(priv)
     where has_table_privilege('authenticated', t.name, p.priv))
  and has_table_privilege('authenticated', 'public.bin_streams', 'select')
  and has_table_privilege('authenticated', 'public.bin_exceptions', 'select'),
  'the browser role can only read the bin tables');
select ok(
  not has_function_privilege('anon', 'public.save_bin_stream(uuid, text, text, date, integer)', 'execute')
  and not has_function_privilege('anon', 'public.archive_bin_stream(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.set_bin_exception(uuid, date, text, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.clear_bin_exception(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.save_bin_stream(uuid, text, text, date, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.archive_bin_stream(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.set_bin_exception(uuid, date, text, date, text)', 'execute')
  and has_function_privilege('authenticated', 'public.clear_bin_exception(uuid)', 'execute'),
  'signed-in people can call the bin functions; anon cannot');
select ok(
  not has_function_privilege('authenticated', 'private.bin_collections_on(uuid, date)', 'execute'),
  'the browser role cannot call the SQL date maths directly');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');

-- A member cannot change anything.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.save_bin_stream(null, 'Grey bin', 'grey', current_date, 1) $$,
  '42501', 'not_allowed', 'a plain member cannot add a bin');
select throws_ok($$ select public.archive_bin_stream(gen_random_uuid()) $$,
  '42501', 'not_allowed', 'a plain member cannot archive a bin');
select throws_ok($$ select public.set_bin_exception(gen_random_uuid(), current_date, 'skip', null, null) $$,
  '42501', 'not_allowed', 'a plain member cannot add an exception');
select throws_ok($$ select public.clear_bin_exception(gen_random_uuid()) $$,
  '42501', 'not_allowed', 'a plain member cannot clear an exception');
reset role;

-- The admin sets up two bins. Anchors are built from today so the two-year rule is always met.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.grey', public.save_bin_stream(null, '  Grey bin ', 'grey', current_date, 1)::text, true);
select set_config('t.blue', public.save_bin_stream(null, 'Blue box', 'blue', current_date + 7, 2)::text, true);
select throws_ok($$ select public.save_bin_stream(null, '', 'grey', current_date, 1) $$,
  '22023', 'invalid_name', 'an empty name is refused');
select throws_ok($$ select public.save_bin_stream(null, 'X', 'pink', current_date, 1) $$,
  '22023', 'invalid_colour', 'an unknown colour is refused');
select throws_ok($$ select public.save_bin_stream(null, 'X', 'grey', current_date, 5) $$,
  '22023', 'invalid_pattern', 'a 5 week pattern is refused');
select throws_ok($$ select public.save_bin_stream(null, 'X', 'grey', current_date + 800, 1) $$,
  '22023', 'invalid_date', 'an anchor more than two years away is refused');
reset role;
select results_eq(
  $$select name, colour, every_weeks::int, household_id from public.bin_streams where id = current_setting('t.grey')::uuid$$,
  $$select 'Grey bin'::text, 'grey'::text, 1, 'a0000000-0000-0000-0000-000000000001'::uuid$$,
  'a bin is stored for the admin''s flat with its name trimmed');

-- Exceptions.
set local role authenticated;
select throws_ok(format($$ select public.set_bin_exception(%L, %L, 'skip', null, null) $$,
  current_setting('t.grey'), (current_date + 3)::text),
  'P0001', 'not_a_collection_day', 'an exception on a non-collection day is refused');
select throws_ok(format($$ select public.set_bin_exception(%L, %L, 'move', null, null) $$,
  current_setting('t.grey'), (current_date + 7)::text),
  '22023', 'invalid_exception', 'a move without a date is refused');
select throws_ok(format($$ select public.set_bin_exception(%L, %L, 'move', %L, null) $$,
  current_setting('t.grey'), (current_date + 7)::text, (current_date + 27)::text),
  '22023', 'invalid_exception', 'a move 20 days away is refused');
select set_config('t.skip', public.set_bin_exception(current_setting('t.grey')::uuid, current_date + 7, 'skip', null, 'Bank holiday')::text, true);
select set_config('t.skip2', public.set_bin_exception(current_setting('t.grey')::uuid, current_date + 7, 'move', current_date + 9, null)::text, true);
reset role;
select is(current_setting('t.skip2'), current_setting('t.skip'), 'a second exception for the same date replaces the first');
select is((select kind from public.bin_exceptions where id = current_setting('t.skip')::uuid), 'move',
  'and the newer one wins');

-- Constraints on the table itself.
select throws_ok(format($$ insert into public.bin_exceptions (household_id, stream_id, original_on, kind, moved_to, created_by)
  values ('a0000000-0000-0000-0000-000000000001', %L, %L, 'move', %L, %L) $$,
  current_setting('t.grey'), (current_date + 14)::text, (current_date + 34)::text, current_setting('t.alice')),
  '23514', null, 'the table itself refuses a move more than 14 days away');
select throws_ok(format($$ insert into public.bin_exceptions (household_id, stream_id, original_on, kind, created_by)
  values ('d0000000-0000-0000-0000-000000000001', %L, %L, 'skip', %L) $$,
  current_setting('t.grey'), (current_date + 14)::text, current_setting('t.alice')),
  '23503', null, 'an exception cannot point at another flat''s bin');
select throws_ok($$ insert into public.bin_streams (household_id, name, anchor_on, every_weeks, created_by)
  values ('a0000000-0000-0000-0000-000000000001', 'X', current_date, 6, current_setting('t.alice')::uuid) $$,
  '23514', null, 'the table refuses a 6 week pattern');

-- Cross-flat: Dave sees nothing and cannot touch Flat A.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.bin_streams), 0, 'another flat sees no bins');
select is((select count(*)::int from public.bin_exceptions), 0, 'and no exceptions');
select throws_ok(format($$ select public.save_bin_stream(%L, 'Hijack', 'grey', current_date, 1) $$, current_setting('t.grey')),
  'P0001', 'bin_not_found', 'editing another flat''s bin is "not found"');
select throws_ok(format($$ select public.archive_bin_stream(%L) $$, current_setting('t.grey')),
  'P0001', 'bin_not_found', 'archiving another flat''s bin is "not found"');
select throws_ok(format($$ select public.set_bin_exception(%L, %L, 'skip', null, null) $$, current_setting('t.grey'), current_date::text),
  'P0001', 'bin_not_found', 'an exception on another flat''s bin is "not found"');
select throws_ok(format($$ select public.clear_bin_exception(%L) $$, current_setting('t.skip')),
  'P0001', 'exception_not_found', 'clearing another flat''s exception is "not found"');
reset role;

-- A member can read.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.bin_streams), 2, 'a member of the flat sees its bins');
reset role;

-- Changing the pattern keeps only exceptions that still land on a collection day.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.set_bin_exception(current_setting('t.grey')::uuid, current_date + 14, 'skip', null, null);
select public.save_bin_stream(current_setting('t.grey')::uuid, 'Grey bin', 'grey', current_date, 2);
reset role;
select is((select count(*)::int from public.bin_exceptions where stream_id = current_setting('t.grey')::uuid), 1,
  'after moving to fortnightly, the exception still on a collection day stays and the other goes');
select is((select original_on from public.bin_exceptions where stream_id = current_setting('t.grey')::uuid), current_date + 14,
  'and it is the one on day 14');

-- Clearing, archiving.
set local role authenticated;
select public.clear_bin_exception((select id from public.bin_exceptions where stream_id = current_setting('t.grey')::uuid));
select public.archive_bin_stream(current_setting('t.blue')::uuid);
reset role;
select is((select count(*)::int from public.bin_exceptions), 0, 'clearing removes the exception');
select ok((select archived_at is not null from public.bin_streams where id = current_setting('t.blue')::uuid),
  'archiving marks the bin');

-- The cap: 20 active bins.
set local role authenticated;
select public.save_bin_stream(null, 'Bin ' || n, 'other', current_date, 1) from generate_series(1, 19) n;
select throws_ok($$ select public.save_bin_stream(null, 'One too many', 'other', current_date, 1) $$,
  'P0001', 'too_many_bins', 'the 21st active bin is refused');
reset role;

-- Shared vectors: the same cases the TypeScript tests run (src/features/bins/parity-vectors.ts).
delete from public.bin_streams where household_id = 'a0000000-0000-0000-0000-000000000001';
create temp table vectors (name text, anchor date, every int, ex_orig date, ex_kind text, ex_to date, d date, collected boolean);
insert into vectors values
  ('w1', '2026-11-03', 1, null, null, null, '2026-11-03', true),
  ('w2', '2026-11-03', 1, null, null, null, '2026-11-10', true),
  ('w3', '2026-11-03', 1, null, null, null, '2026-11-11', false),
  ('w4', '2026-11-03', 1, null, null, null, '2026-10-27', true),
  ('f1', '2026-11-03', 2, null, null, null, '2026-11-10', false),
  ('f2', '2026-11-03', 2, null, null, null, '2026-11-17', true),
  ('f3', '2026-11-03', 2, null, null, null, '2026-10-20', true),
  ('f4', '2026-11-03', 2, null, null, null, '2026-10-27', false),
  ('t1', '2026-11-03', 3, null, null, null, '2026-11-24', true),
  ('t2', '2026-11-03', 3, null, null, null, '2026-11-17', false),
  ('t3', '2026-11-03', 3, null, null, null, '2026-10-13', true),
  ('c1', '2026-10-06', 4, null, null, null, '2027-03-30', false),
  ('c2', '2026-10-06', 1, null, null, null, '2027-03-30', true),
  ('c3', '2026-10-20', 1, null, null, null, '2026-10-27', true),
  ('y1', '2026-12-29', 1, null, null, null, '2027-01-05', true),
  ('s1', '2026-11-03', 1, '2026-11-10', 'skip', null, '2026-11-10', false),
  ('s2', '2026-11-03', 1, '2026-11-10', 'skip', null, '2026-11-17', true),
  ('m1', '2026-11-03', 1, '2026-11-17', 'move', '2026-11-19', '2026-11-17', false),
  ('m2', '2026-11-03', 1, '2026-11-17', 'move', '2026-11-19', '2026-11-19', true);
-- One flat per vector would be heavy; instead one stream per vector in Flat A, checked by stream id.
create temp table vstreams as
  select v.*, gen_random_uuid() as sid from vectors v;
insert into public.bin_streams (id, household_id, name, anchor_on, every_weeks, created_by)
select sid, 'a0000000-0000-0000-0000-000000000001', name, anchor, every, current_setting('t.alice')::uuid from vstreams;
insert into public.bin_exceptions (household_id, stream_id, original_on, kind, moved_to, created_by)
select 'a0000000-0000-0000-0000-000000000001', sid, ex_orig, ex_kind, ex_to, current_setting('t.alice')::uuid
  from vstreams where ex_orig is not null;
select is((select count(*)::int from vstreams), 19, 'nineteen shared vectors');
select is(
  (select count(*)::int from vstreams v
    where exists (select 1 from private.bin_collections_on('a0000000-0000-0000-0000-000000000001', v.d) c
                   where c.stream_id = v.sid) <> v.collected),
  0, 'private.bin_collections_on agrees with every shared vector');

select * from finish();
rollback;
