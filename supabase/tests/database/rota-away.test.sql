begin;
select plan(46);

-- Rota away periods (SPEC-rota-away). A date range that counts as "not available" for every week it
-- touches, set by the person or an admin, visible to the flat, never touching money. A late change
-- to a generated week reuses the leaver rebuild.

select has_table('public', 'away_periods', 'away_periods exists');
select ok((select relrowsecurity from pg_class where oid = 'public.away_periods'::regclass), 'row-level security is on');
select ok(
  not exists (select 1 from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
               where has_table_privilege('anon', 'public.away_periods', p.priv))
  and not exists (select 1 from unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
                   where has_table_privilege('authenticated', 'public.away_periods', p.priv))
  and has_table_privilege('authenticated', 'public.away_periods', 'select'),
  'anon has nothing and the browser role can only read');
select ok(
  has_function_privilege('authenticated', 'public.set_away(date, date, text, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.end_away(uuid, date)', 'execute')
  and has_function_privilege('authenticated', 'public.rota_availability(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.set_away(date, date, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.end_away(uuid, date)', 'execute')
  and not has_function_privilege('anon', 'public.rota_availability(date, date)', 'execute'),
  'signed-in people can call the away functions; anon cannot');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-000000000011', 'gina@example.com', '{"full_name": "Gina"}'),
  ('00000000-0000-0000-0000-000000000012', 'hugh@example.com', '{"full_name": "Hugh"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.gina', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000011'), true);
select set_config('t.hugh', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000012'), true);
select set_config('t.w', (((now() at time zone 'Europe/London')::date - extract(dow from (now() at time zone 'Europe/London')::date)::int) + 7)::text, true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('90000000-0000-0000-0000-000000000001', 'Flat G', current_setting('t.gina')::uuid),
  ('80000000-0000-0000-0000-000000000001', 'Flat H', current_setting('t.hugh')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('90000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid, 'owner'),
  ('80000000-0000-0000-0000-000000000001', current_setting('t.hugh')::uuid, 'owner');
insert into public.chores (id, household_id, name, cadence, preferred_dow, every_n_days, effort) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Kitchen', 'weekly', 3, null, 3),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bins', 'weekly', 2, null, 1),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Hallway', 'weekly', 5, null, 1);

-- Week of next Sunday: Kitchen (Wed, w+3) bob, Bins (Tue, w+2) carol, Hallway (Fri, w+5) bob.
select private.rota_store_week(now(), 'a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date, 'weekly', null,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', current_setting('t.bob'), 'dueOn', (current_setting('t.w')::date + 3)::text, 'explanation', 'x1'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.carol'), 'dueOn', (current_setting('t.w')::date + 2)::text, 'explanation', 'x2'),
    jsonb_build_object('choreId', 'c3000000-0000-0000-0000-000000000003', 'assignee', current_setting('t.bob'), 'dueOn', (current_setting('t.w')::date + 5)::text, 'explanation', 'x3')
  ), '[]'::jsonb);
select set_config('t.kitchen', (select id::text from public.chore_assignments where chore_name = 'Kitchen'), true);
select set_config('t.hall', (select id::text from public.chore_assignments where chore_name = 'Hallway'), true);
select set_config('t.bins', (select id::text from public.chore_assignments where chore_name = 'Bins'), true);
delete from public.notifications;

-- ---------------------------------------------------------------------------------------------
-- Setting a period. Bob is away Wednesday to Thursday (w+3 to w+4); Kitchen falls inside it.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$select public.set_away('%s', '%s', null)$sql$, current_setting('t.w')::date + 4, current_setting('t.w')::date + 3),
  '22023', 'invalid_dates', 'the end cannot be before the start');
select throws_ok(format($sql$select public.set_away('%s', '%s', null)$sql$, current_setting('t.w')::date - 14, current_setting('t.w')::date + 3),
  'P0001', 'away_in_past', 'it cannot start before the current week');
select throws_ok(format($sql$select public.set_away('%s', '%s', '%s')$sql$, current_setting('t.w')::date + 3, current_setting('t.w')::date + 4, repeat('x', 101)),
  '22023', 'invalid_note', 'the note is at most 100 characters');
select throws_ok(format($sql$select public.set_away('%s', '%s', null, '%s')$sql$, current_setting('t.w')::date + 3, current_setting('t.w')::date + 4, current_setting('t.carol')),
  '42501', 'not_allowed', 'a member cannot set someone else''s period');
select set_config('t.away1', public.set_away((current_setting('t.w')::date + 3), (current_setting('t.w')::date + 4), 'Visiting family')::text, true);
select throws_ok(format($sql$select public.set_away('%s', '%s', null)$sql$, current_setting('t.w')::date + 4, current_setting('t.w')::date + 6),
  'P0001', 'away_overlap', 'it cannot overlap one that is already set');
select lives_ok(format($sql$select public.set_away('%s', '%s', null)$sql$, current_setting('t.w')::date + 5, current_setting('t.w')::date + 6),
  'one that touches but does not overlap is fine');
reset role;

select results_eq(
  $$select profile_id = current_setting('t.bob')::uuid, created_by = current_setting('t.bob')::uuid, note from public.away_periods order by starts_on$$,
  $$values (true, true, 'Visiting family'::text), (true, true, null::text)$$, 'periods are stored with the note and who set them');

-- A flatmate can read them; another flat cannot.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.away_periods), 2, 'a flatmate sees the dates and the note');
select is((select note from public.away_periods order by starts_on limit 1), 'Visiting family', 'including the note');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000011", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.away_periods), 0, 'another flat sees none of it');
select is((select count(*)::int from public.rota_availability(current_setting('t.w')::date, current_setting('t.w')::date + 6)), 0,
  'nor the availability with away days applied');
reset role;

-- An admin sets one for someone else.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(format($sql$select public.set_away('%s', '%s', 'Work trip', '%s')$sql$, current_setting('t.w')::date + 8, current_setting('t.w')::date + 9, current_setting('t.carol')),
  'an owner can set a period for a flatmate');
select throws_ok(format($sql$select public.set_away('%s', '%s', null, '%s')$sql$, current_setting('t.w')::date + 8, current_setting('t.w')::date + 9, current_setting('t.gina')),
  'P0001', 'not_a_member', 'but not for someone outside the flat');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Effect on availability. Nothing was answered, and the away days are still not available.
select is((select available from private.rota_effective_availability('a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date, current_setting('t.w')::date + 6)
            where profile_id = current_setting('t.bob')::uuid and on_date = current_setting('t.w')::date + 3),
  false, 'an away day is not available without any weekly answer');
select is((select count(*)::int from private.rota_effective_availability('a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date, current_setting('t.w')::date + 6)
            where profile_id = current_setting('t.bob')::uuid and not available), 4, 'all four away days are listed');
select is(private.rota_assume_available_for('a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date) > 0, true, 'unanswered people are filled in as around');
select is((select available from private.rota_effective_availability('a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date, current_setting('t.w')::date + 6)
            where profile_id = current_setting('t.bob')::uuid and on_date = current_setting('t.w')::date + 3),
  false, 'and that never replaces an away day');
select is((select available from private.rota_effective_availability('a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date, current_setting('t.w')::date + 6)
            where profile_id = current_setting('t.bob')::uuid and on_date = current_setting('t.w')::date + 1),
  true, 'other days are still around');
select is(private.rota_is_away('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.w')::date + 3), true,
  'swaps and reassigns see the away day');

-- The scheduler's input.
select is((private.rota_generation_input('a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date) -> 'availability' -> current_setting('t.bob') ->> ((current_setting('t.w')::date + 3)::text))::boolean,
  false, 'the scheduler input has the away day as not available');

-- Back early: the person marks one day available again, which wins.
update public.availability set available = true, assumed = false
 where profile_id = current_setting('t.bob')::uuid and on_date = current_setting('t.w')::date + 4;
select is(private.rota_is_away('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.w')::date + 4), false,
  'a day marked available again counts as around');
select is(private.rota_is_away('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.w')::date + 3), true,
  'the rest of the period still holds');
update public.availability set assumed = true where profile_id = current_setting('t.bob')::uuid and on_date = current_setting('t.w')::date + 4;

-- Storing a week refuses an away day.
select throws_ok(
  format($sql$select private.rota_store_week(now(), 'a0000000-0000-0000-0000-000000000001', '%s', 'manual', null,
    jsonb_build_array(jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', '%s', 'dueOn', '%s', 'explanation', 'x')), '[]'::jsonb)$sql$,
    current_setting('t.w'), current_setting('t.bob'), (current_setting('t.w')::date + 3)::text),
  'P0001', 'assignee_unavailable', 'a chore is never stored on an away day');

-- Fairness: the history says how many days each person was away.
select private.rota_store_week(now(), 'a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date + 7, 'weekly', null, '[]'::jsonb, '[]'::jsonb);
select is(private.rota_away_days('a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date) ->> current_setting('t.bob'), '4',
  'a week reports four away days for Bob (the day marked available again is already back to away)');

-- ---------------------------------------------------------------------------------------------
-- Late change: Bob's period covered Kitchen (Wed) and Hallway (Fri) is outside it? No: the second
-- period starts on w+5, so both are inside a period. Setting them queued one rebuild.
select is((select count(*)::int from public.rota_rebuilds where kind = 'away' and left_profile = current_setting('t.bob')::uuid and status = 'pending'),
  1, 'a late change to a generated week queues one rebuild, however many periods were set');
select is((select count(*)::int from public.rota_rebuilds where left_profile = current_setting('t.carol')::uuid), 0,
  'a period with no chore in it queues nothing');

select is(private.rota_rebuild_input(now(), (select id from public.rota_rebuilds where kind = 'away'))->> 'cause', 'away', 'the job is told this is an away period');
select is(jsonb_array_length(private.rota_rebuild_input(now(), (select id from public.rota_rebuilds where kind = 'away')) -> 'tasks'), 3,
  'it sees the flat''s chores');

select set_config('t.rb', (select id::text from public.rota_rebuilds where kind = 'away'), true);
select is(private.rota_apply_rebuild(now(), current_setting('t.rb')::uuid,
  jsonb_build_array(
    jsonb_build_object('taskId', current_setting('t.kitchen'), 'to', current_setting('t.carol'), 'reason', 'leaver', 'explanation', 'Moved to you because Bob is away.'))),
  'applied', 'the chore on an away day is moved');
select is((select assignee from public.chore_assignments where chore_name = 'Kitchen' and superseded_at is null), current_setting('t.carol')::uuid, 'Kitchen has a new holder');
select is((select title from public.notifications where recipient_id = current_setting('t.carol')::uuid and type = 'rota_rebuilt'),
  'Bob is away, so 1 chore was moved', 'the message says the person is away, not that they left');

-- Undo goes back to the person who is away (an admin''s decision).
select is(private.rota_undo_rebuild(now(), 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.rb')::uuid),
  '{"kept": 0, "status": "undone", "restored": 1}'::jsonb, 'an admin can undo it within 24 hours');
select is((select assignee from public.chore_assignments where chore_name = 'Kitchen' and superseded_at is null), current_setting('t.bob')::uuid, 'the chore is back with Bob');

-- No chores, no rebuild.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000012", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(format($sql$select public.set_away('%s', '%s', null)$sql$, current_setting('t.w')::date + 1, current_setting('t.w')::date + 2), 'a flat without chores can still record a period');
reset role;
select is((select count(*)::int from public.rota_rebuilds where household_id = '80000000-0000-0000-0000-000000000001'), 0, 'and nothing is rebuilt there');

-- ---------------------------------------------------------------------------------------------
-- Ending and shortening.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$select public.end_away('%s', null)$sql$, current_setting('t.away1')), 'P0002', 'away_not_found', 'a member cannot end someone else''s period');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(format($sql$select public.end_away('%s', '%s')$sql$, current_setting('t.away1'), current_setting('t.w')::date + 3), 'the person shortens their period');
reset role;
select is((select ends_on from public.away_periods where id = current_setting('t.away1')::uuid), current_setting('t.w')::date + 3, 'the new last day is kept');
select is(private.rota_is_away('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.w')::date + 4), false, 'the days after it are free again');
set local role authenticated;
select lives_ok(format($sql$select public.end_away('%s', null)$sql$, current_setting('t.away1')), 'and ends it');
reset role;
select is(private.rota_is_away('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.w')::date + 3), false, 'an ended period counts for nothing');

-- Leaving the flat ends whatever is open.
update public.memberships set left_at = now(), left_reason = 'left'
 where household_id = 'a0000000-0000-0000-0000-000000000001' and profile_id = current_setting('t.bob')::uuid;
select is((select count(*)::int from public.away_periods where profile_id = current_setting('t.bob')::uuid and ended_at is null), 0, 'leaving the flat ends every open period');

select * from finish();
rollback;
