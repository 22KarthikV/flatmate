begin;
select plan(47);

-- Extras D: the fix-it log (SPEC-extras D). Reports, a permanent timeline, status and chaser rules.

select has_table('public', 'fix_reports', 'fix_reports exists');
select has_table('public', 'fix_updates', 'fix_updates exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.fix_reports'::regclass, 'public.fix_updates'::regclass)),
  'row-level security is enabled on both tables');
select ok(
  not exists (
    select 1 from unnest(array['public.fix_reports', 'public.fix_updates']) t(name)
     cross join unnest(array['select','insert','update','delete','truncate']) p(priv)
     where has_table_privilege('anon', t.name, p.priv)),
  'anon has no privileges on the fix-it tables');
select ok(
  not exists (
    select 1 from unnest(array['public.fix_reports', 'public.fix_updates']) t(name)
     cross join unnest(array['insert','update','delete','truncate']) p(priv)
     where has_table_privilege('authenticated', t.name, p.priv))
  and has_table_privilege('authenticated', 'public.fix_reports', 'select')
  and has_table_privilege('authenticated', 'public.fix_updates', 'select'),
  'the browser role can only read the fix-it tables');
select ok(
  not has_function_privilege('anon', 'public.report_fix(text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.add_fix_note(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.set_fix_status(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.take_fix_chase(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.set_fix_chaser(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.hide_fix_report(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.report_fix(text, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.add_fix_note(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.set_fix_status(uuid, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.take_fix_chase(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.set_fix_chaser(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.hide_fix_report(uuid)', 'execute'),
  'signed-in people can call the fix-it functions; anon cannot');
select results_eq(
  $$select type, default_in_app, default_push, snoozable, push_title, push_body from public.notification_types
     where type like 'fix\_%' order by type$$,
  $$values
    ('fix_reported'::text, true, false, false, 'New fix-it report'::text, 'A flatmate reported a problem. Open FlatMate to see it.'::text),
    ('fix_stale', true, true, true, 'Fix-it reminder', 'A problem is still waiting. Open FlatMate to see it.'),
    ('fix_status', true, true, false, 'Fix-it update', 'A problem you follow has an update. Open FlatMate to see it.')$$,
  'the three fix-it types are registered with their fixed push text');

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
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');

-- Bob reports.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.r1', public.report_fix('  Extractor fan not working ', ' It rattles then stops ', 'Bathroom')::text, true);
select throws_ok($$ select public.report_fix('  ', null, null) $$, '22023', 'invalid_title', 'an empty title is refused');
select throws_ok($$ select public.report_fix(repeat('x', 81), null, null) $$, '22023', 'invalid_title', 'a long title is refused');
select throws_ok($$ select public.report_fix('x', repeat('x', 501), null) $$, '22023', 'invalid_details', 'long details are refused');
select throws_ok($$ select public.report_fix('x', null, repeat('x', 41)) $$, '22023', 'invalid_location', 'a long room is refused');
reset role;

select results_eq(
  $$select title, details, location, status, reported_by, chaser_id is null, household_id from public.fix_reports where id = current_setting('t.r1')::uuid$$,
  $$select 'Extractor fan not working'::text, 'It rattles then stops'::text, 'Bathroom'::text, 'open'::text, current_setting('t.bob')::uuid, true, 'a0000000-0000-0000-0000-000000000001'::uuid$$,
  'a report is stored trimmed, open, with nobody chasing');
select is((select count(*)::int from public.notifications where dedupe_key = 'fix_reported:' || current_setting('t.r1')), 3,
  'everyone else in the flat is told');
select is((select count(*)::int from public.notifications where dedupe_key = 'fix_reported:' || current_setting('t.r1')
            and recipient_id = current_setting('t.bob')::uuid), 0, 'but not the reporter');
select ok(not exists (select 1 from public.notifications where type = 'fix_reported' and (title || body) ilike '%extractor%'),
  'the inbox row does not carry the problem''s words');

-- Cross-flat.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.fix_reports), 0, 'another flat sees no reports');
select is((select count(*)::int from public.fix_updates), 0, 'and no timeline');
select throws_ok(format($$ select public.add_fix_note(%L, 'hi') $$, current_setting('t.r1')), 'P0001', 'report_not_found', 'a note on another flat''s report is "not found"');
select throws_ok(format($$ select public.take_fix_chase(%L) $$, current_setting('t.r1')), 'P0001', 'report_not_found', 'chasing another flat''s report is "not found"');
reset role;

-- Notes.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.add_fix_note(current_setting('t.r1')::uuid, '  Emailed the agent on Monday ');
select throws_ok(format($$ select public.add_fix_note(%L, '') $$, current_setting('t.r1')), '22023', 'invalid_note', 'an empty note is refused');
reset role;
select is((select body from public.fix_updates where report_id = current_setting('t.r1')::uuid and kind = 'note'),
  'Emailed the agent on Monday', 'any member can add a note, stored trimmed');

-- The timeline is permanent.
select throws_ok($$ update public.fix_updates set body = 'changed' $$, '42501', 'fix_updates_are_permanent', 'a timeline line cannot be changed');
select throws_ok($$ delete from public.fix_updates $$, '42501', 'fix_updates_are_permanent', 'or deleted');

-- Chasing.
set local role authenticated;
select public.take_fix_chase(current_setting('t.r1')::uuid);
reset role;
select is((select chaser_id from public.fix_reports where id = current_setting('t.r1')::uuid), current_setting('t.carol')::uuid,
  'a member can take the chase when nobody has it');
set local role authenticated;
select throws_ok(format($$ select public.take_fix_chase(%L) $$, current_setting('t.r1')), 'P0001', 'already_chasing', 'but not when someone already has it');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($$ select public.set_fix_chaser(%L, %L) $$, current_setting('t.r1'), current_setting('t.bob')),
  '42501', 'not_allowed', 'a member who is not the chaser cannot hand it over');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($$ select public.set_fix_chaser(%L, %L) $$, current_setting('t.r1'), current_setting('t.dave')),
  'P0001', 'not_a_member', 'the new chaser must be in the flat');
select public.set_fix_chaser(current_setting('t.r1')::uuid, current_setting('t.bob')::uuid);
reset role;
select is((select chaser_id from public.fix_reports where id = current_setting('t.r1')::uuid), current_setting('t.bob')::uuid,
  'the chaser can hand the chase over');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.set_fix_chaser(current_setting('t.r1')::uuid, current_setting('t.carol')::uuid);
reset role;
select is((select chaser_id from public.fix_reports where id = current_setting('t.r1')::uuid), current_setting('t.carol')::uuid,
  'an admin can assign anyone');
select is((select count(*)::int from public.fix_updates where report_id = current_setting('t.r1')::uuid and kind = 'chaser'), 3,
  'every chaser change is on the timeline');

-- Status: the reporter (Bob), the chaser (Carol) and an admin may; another member (Frank) may not.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($$ select public.set_fix_status(%L, 'fixed', null) $$, current_setting('t.r1')),
  '42501', 'not_allowed', 'another member cannot change the status');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($$ select public.set_fix_status(%L, 'broken', null) $$, current_setting('t.r1')),
  '22023', 'invalid_status', 'an unknown status is refused');
select public.set_fix_status(current_setting('t.r1')::uuid, 'in_progress', 'Engineer booked');
reset role;
select is((select status from public.fix_reports where id = current_setting('t.r1')::uuid), 'in_progress', 'the chaser can move it to in progress');
select is((select count(*)::int from public.notifications where type = 'fix_status' and recipient_id = current_setting('t.bob')::uuid), 1,
  'the reporter is told');
select is((select count(*)::int from public.notifications where type = 'fix_status' and recipient_id = current_setting('t.carol')::uuid), 0,
  'the person acting is not told');
select ok(not exists (select 1 from public.notifications where type = 'fix_status' and body <> ''), 'status notices carry no body text');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.set_fix_status(current_setting('t.r1')::uuid, 'fixed', null);
reset role;
select ok((select status = 'fixed' and fixed_at is not null from public.fix_reports where id = current_setting('t.r1')::uuid),
  'the reporter can mark it fixed, which sets fixed_at');
set local role authenticated;
select public.set_fix_status(current_setting('t.r1')::uuid, 'open', null);
reset role;
select ok((select status = 'open' and fixed_at is null from public.fix_reports where id = current_setting('t.r1')::uuid),
  'reopening clears fixed_at');

-- Hiding.
set local role authenticated;
select throws_ok(format($$ select public.hide_fix_report(%L) $$, current_setting('t.r1')), '42501', 'not_allowed', 'a member cannot hide a report');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.hide_fix_report(current_setting('t.r1')::uuid);
select is((select count(*)::int from public.fix_reports), 0, 'a hidden report is invisible to members');
select is((select count(*)::int from public.fix_updates), 0, 'and so is its timeline');
select throws_ok(format($$ select public.add_fix_note(%L, 'late') $$, current_setting('t.r1')), 'P0001', 'report_not_found', 'a hidden report takes no more notes');
reset role;

-- A leaver who was chasing: the chase is cleared, a system line is written, admins are told, leaving works.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.r2', public.report_fix('Boiler leaking', null, 'Kitchen')::text, true);
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select public.take_fix_chase(current_setting('t.r2')::uuid);
reset role;
update public.memberships set left_at = now(), left_reason = 'left'
 where profile_id = current_setting('t.frank')::uuid and left_at is null;
select ok((select chaser_id is null from public.fix_reports where id = current_setting('t.r2')::uuid), 'when the chaser leaves the chase is cleared');
select is((select count(*)::int from public.fix_updates where report_id = current_setting('t.r2')::uuid and kind = 'system'), 1,
  'a system line says so');
select is((select count(*)::int from public.notifications where type = 'fix_status' and recipient_id = current_setting('t.alice')::uuid
            and href = '/more/fixes/' || current_setting('t.r2')), 1, 'and the admin is told');
select is((select count(*)::int from public.memberships where profile_id = current_setting('t.frank')::uuid and left_at is not null), 1,
  'and leaving still succeeded');

-- The cap: 50 open reports.
insert into public.fix_reports (household_id, title, reported_by)
select 'a0000000-0000-0000-0000-000000000001', 'filler ' || n, current_setting('t.bob')::uuid from generate_series(1, 49) n;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.report_fix('one too many', null, null) $$, 'P0001', 'too_many_open', 'the 51st open report is refused');
reset role;

select * from finish();
rollback;
