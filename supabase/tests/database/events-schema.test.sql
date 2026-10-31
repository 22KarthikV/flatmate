begin;
select plan(37);

-- Events: tables, constraints, row-level security and the guards (SPEC-events E1). Members read,
-- nobody writes directly, and a vote can only land on an open event.

select has_table('public', 'events', 'events exists');
select has_table('public', 'event_options', 'event_options exists');
select has_table('public', 'event_votes', 'event_votes exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.events'::regclass, 'public.event_options'::regclass, 'public.event_votes'::regclass)),
  'row-level security is on for all three tables');
select ok(
  not exists (
    select 1 from unnest(array['events', 'event_options', 'event_votes']) t(tbl),
                  unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
     where has_table_privilege('anon', 'public.' || t.tbl, p.priv))
  and not exists (
    select 1 from unnest(array['events', 'event_options', 'event_votes']) t(tbl),
                  unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
     where has_table_privilege('authenticated', 'public.' || t.tbl, p.priv))
  and has_table_privilege('authenticated', 'public.events', 'select')
  and has_table_privilege('authenticated', 'public.event_options', 'select')
  and has_table_privilege('authenticated', 'public.event_votes', 'select'),
  'anon has nothing and the browser role can only read');
select ok(
  not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('events', 'event_options', 'event_votes')),
  'no event table is published to realtime');
select col_is_pk('public', 'event_votes', array['option_id', 'profile_id'], 'one answer per person per date');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dan@example.com', '{"full_name": "Dan"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dan', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('b0000000-0000-0000-0000-000000000001', 'Flat B', current_setting('t.carol')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'owner');
-- Dan used to be in flat A.
insert into public.memberships (household_id, profile_id, role, left_at, left_reason) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dan')::uuid, 'member', now(), 'left');

insert into public.events (id, household_id, organiser_id, title, vote_deadline) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'Pizza night', now() + interval '2 days'),
  ('e2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'Secret party', now() + interval '2 days');
insert into public.event_options (id, event_id, household_id, starts_at) values
  ('f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '5 days'),
  ('f1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '6 days'),
  ('f1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '7 days'),
  ('f2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', now() + interval '5 days');
insert into public.event_votes (option_id, event_id, household_id, profile_id, answer) values
  ('f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'yes'),
  ('f2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'maybe');

-- ---------------------------------------------------------------------------------------------
-- Constraints (as the table owner, to prove the data rules and not only the grants).
select throws_ok(
  $sql$insert into public.events (household_id, organiser_id, title, vote_deadline)
       values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, '', now())$sql$,
  '23514', null, 'an empty title is refused');
select throws_ok(
  $sql$insert into public.events (household_id, organiser_id, title, vote_deadline)
       values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, repeat('x', 81), now())$sql$,
  '23514', null, 'a title over 80 characters is refused');
select throws_ok(
  $sql$insert into public.events (household_id, organiser_id, title, description, vote_deadline)
       values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'x', repeat('x', 501), now())$sql$,
  '23514', null, 'a description over 500 characters is refused');
select throws_ok(
  $sql$insert into public.events (household_id, organiser_id, title, status, vote_deadline)
       values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'x', 'confirmed', now())$sql$,
  '23514', null, 'a confirmed event needs a confirmed date');
select throws_ok(
  $sql$insert into public.events (household_id, organiser_id, title, status, vote_deadline)
       values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'x', 'tiebreak', now())$sql$,
  '23514', null, 'a tiebreak needs its start time');
select throws_ok(
  $sql$insert into public.events (household_id, organiser_id, title, status, vote_deadline)
       values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'x', 'cancelled', now())$sql$,
  '23514', null, 'a cancelled event needs its time');
select throws_ok(
  $sql$insert into public.event_options (event_id, household_id, starts_at, ends_at)
       values ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '9 days', now() + interval '8 days')$sql$,
  '23514', null, 'a date must end after it starts');
select throws_ok(
  $sql$insert into public.event_options (event_id, household_id, starts_at)
       select 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', starts_at
         from public.event_options where id = 'f1000000-0000-0000-0000-000000000001'$sql$,
  '23505', null, 'the same time cannot be offered twice');
select throws_ok(
  $sql$insert into public.event_votes (option_id, event_id, household_id, profile_id, answer)
       values ('f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'no')$sql$,
  '23505', null, 'a person has one answer per date');
select throws_ok(
  $sql$insert into public.event_votes (option_id, event_id, household_id, profile_id, answer)
       values ('f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'definitely')$sql$,
  '23514', null, 'an answer is yes, maybe or no');
select throws_ok(
  $sql$insert into public.event_votes (option_id, event_id, household_id, profile_id, answer)
       values ('f2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'yes')$sql$,
  'P0001', 'event_vote_mismatch', 'a vote cannot name a date from another event');

-- ---------------------------------------------------------------------------------------------
-- Guards. A vote only lands on an open event, on a date still offered, with matching ids.
select throws_ok(
  $sql$insert into public.event_votes (option_id, event_id, household_id, profile_id, answer)
       values ('f1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'yes')$sql$,
  'P0001', 'event_vote_mismatch', 'a vote must carry the same flat as its date');

update public.event_options set removed_at = now() where id = 'f1000000-0000-0000-0000-000000000003';
select throws_ok(
  $sql$insert into public.event_votes (option_id, event_id, household_id, profile_id, answer)
       values ('f1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'yes')$sql$,
  'P0001', 'event_not_open', 'nobody can vote on a dropped date');
select throws_ok(
  $sql$update public.event_options set removed_at = null where id = 'f1000000-0000-0000-0000-000000000003'$sql$,
  'P0001', 'event_is_fixed', 'a dropped date cannot be brought back');

update public.events set status = 'cancelled', cancelled_at = now() where id = 'e1000000-0000-0000-0000-000000000001';
select throws_ok(
  $sql$insert into public.event_votes (option_id, event_id, household_id, profile_id, answer)
       values ('f1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'yes')$sql$,
  'P0001', 'event_not_open', 'nobody can vote on a cancelled event');
select throws_ok(
  $sql$update public.event_votes set answer = 'no' where option_id = 'f1000000-0000-0000-0000-000000000001'$sql$,
  'P0001', 'event_not_open', 'an answer cannot change once voting is over');
update public.events set status = 'voting', cancelled_at = null where id = 'e1000000-0000-0000-0000-000000000001';

select throws_ok(
  $sql$update public.events set household_id = 'b0000000-0000-0000-0000-000000000001' where id = 'e1000000-0000-0000-0000-000000000001'$sql$,
  'P0001', 'event_is_fixed', 'an event cannot move to another flat');
select throws_ok(
  $sql$update public.events set organiser_id = current_setting('t.bob')::uuid where id = 'e1000000-0000-0000-0000-000000000001'$sql$,
  'P0001', 'event_is_fixed', 'the organiser cannot be swapped except by the hand-over');
select throws_ok(
  $sql$update public.event_options set starts_at = starts_at + interval '1 day' where id = 'f1000000-0000-0000-0000-000000000001'$sql$,
  'P0001', 'event_is_fixed', 'a date cannot be moved, only dropped');
select throws_ok(
  $sql$delete from public.events where id = 'e1000000-0000-0000-0000-000000000001'$sql$,
  'P0001', 'event_is_fixed', 'events are never deleted');

-- ---------------------------------------------------------------------------------------------
-- Row-level security.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.events), 1, 'Bob sees only his own flat''s event');
select is((select count(*)::int from public.event_options), 3, 'Bob sees only his own flat''s dates');
select is((select count(*)::int from public.event_votes), 1, 'Bob sees only his own flat''s answers');
select throws_ok(
  $sql$insert into public.events (household_id, organiser_id, title, vote_deadline)
       values ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'x', now())$sql$,
  '42501', null, 'the browser role cannot insert an event');
select throws_ok(
  $sql$update public.event_votes set answer = 'no'$sql$,
  '42501', null, 'the browser role cannot change an answer');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.events), 1, 'Carol sees only flat B''s event');
select is((select title from public.events), 'Secret party', 'and it is not flat A''s');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.events), 0, 'someone who left sees no events');
select is((select count(*)::int from public.event_votes), 0, 'and no answers');
reset role;

set local role anon;
select throws_ok($sql$select count(*) from public.events$sql$, '42501', null, 'anon cannot read events');
reset role;

select * from finish();
rollback;
