begin;
select plan(40);

-- Extras C: meter readings (SPEC-extras C). A quiet, append-only log; no money, no notifications.

select has_table('public', 'meters', 'meters exists');
select has_table('public', 'meter_readings', 'meter_readings exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.meters'::regclass, 'public.meter_readings'::regclass)),
  'row-level security is enabled on both tables');
select ok(
  not exists (
    select 1 from unnest(array['public.meters', 'public.meter_readings']) t(name)
     cross join unnest(array['select','insert','update','delete','truncate']) p(priv)
     where has_table_privilege('anon', t.name, p.priv)),
  'anon has no privileges on the meter tables');
select ok(
  not exists (
    select 1 from unnest(array['public.meters', 'public.meter_readings']) t(name)
     cross join unnest(array['insert','update','delete','truncate']) p(priv)
     where has_table_privilege('authenticated', t.name, p.priv))
  and has_table_privilege('authenticated', 'public.meters', 'select')
  and has_table_privilege('authenticated', 'public.meter_readings', 'select'),
  'the browser role can only read the meter tables');
select ok(
  not has_function_privilege('anon', 'public.save_meter(uuid, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.archive_meter(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.record_meter_reading(uuid, date, numeric, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.void_meter_reading(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.save_meter(uuid, text, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.archive_meter(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.record_meter_reading(uuid, date, numeric, text, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.void_meter_reading(uuid)', 'execute'),
  'signed-in people can call the meter functions; anon cannot');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
select set_config('t.today', ((now() at time zone 'Europe/London')::date)::text, true);
insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');

-- A member cannot add or archive meters.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.save_meter(null, 'gas', null, 'kWh') $$, '42501', 'not_allowed', 'a plain member cannot add a meter');
select throws_ok($$ select public.archive_meter(gen_random_uuid()) $$, '42501', 'not_allowed', 'a plain member cannot archive a meter');
reset role;

-- The admin adds meters.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.elec', public.save_meter(null, 'electricity', '  Hall  ', 'kWh')::text, true);
select set_config('t.gas', public.save_meter(null, 'gas', null, 'm3')::text, true);
select throws_ok($$ select public.save_meter(null, 'electricity', null, 'm3') $$, '22023', 'invalid_unit', 'electricity cannot be m3');
select throws_ok($$ select public.save_meter(null, 'steam', null, 'kWh') $$, '22023', 'invalid_kind', 'an unknown kind is refused');
select throws_ok($$ select public.save_meter(null, 'water', repeat('x', 31), 'm3') $$, '22023', 'invalid_label', 'a long label is refused');
reset role;
select results_eq(
  $$select kind, label, unit, household_id from public.meters where id = current_setting('t.elec')::uuid$$,
  $$select 'electricity'::text, 'Hall'::text, 'kWh'::text, 'a0000000-0000-0000-0000-000000000001'::uuid$$,
  'a meter is stored for the admin''s flat with its label trimmed');

-- Cross-flat: Dave sees nothing and cannot record against Flat A's meter.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.meters), 0, 'another flat sees no meters');
select is((select count(*)::int from public.meter_readings), 0, 'and no readings');
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 100, null, false) $$, current_setting('t.elec'), current_setting('t.today')),
  'P0001', 'meter_not_found', 'recording against another flat''s meter is "not found"');
select throws_ok(format($$ select public.save_meter(%L, 'electricity', 'x', 'kWh') $$, current_setting('t.elec')),
  'P0001', 'meter_not_found', 'another flat''s admin cannot edit it either');
reset role;

-- Any member records readings.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.r1', public.record_meter_reading(current_setting('t.elec')::uuid, (current_setting('t.today')::date - 60), 1000, '  First of the month ', false)::text, true);
select set_config('t.r2', public.record_meter_reading(current_setting('t.elec')::uuid, (current_setting('t.today')::date - 30), 1214.5, null, false)::text, true);
reset role;
select results_eq(
  $$select value, note, recorded_by, is_reset from public.meter_readings where id = current_setting('t.r1')::uuid$$,
  $$select 1000.000::numeric, 'First of the month'::text, current_setting('t.bob')::uuid, false$$,
  'a member can record a reading; the note is trimmed');

set local role authenticated;
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 1300, null, false) $$, current_setting('t.elec'), (current_setting('t.today')::date + 1)::text),
  '22023', 'invalid_date', 'a future date is refused');
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 1300, null, false) $$, current_setting('t.elec'), (current_setting('t.today')::date - 400)::text),
  '22023', 'invalid_date', 'a date over a year old is refused');
select throws_ok(format($$ select public.record_meter_reading(%L, %L, -1, null, false) $$, current_setting('t.elec'), current_setting('t.today')),
  '22023', 'invalid_value', 'a negative value is refused');
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 10000000, null, false) $$, current_setting('t.elec'), current_setting('t.today')),
  '22023', 'invalid_value', 'a value over 9,999,999.999 is refused');
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 1300, repeat('x', 101), false) $$, current_setting('t.elec'), current_setting('t.today')),
  '22023', 'invalid_note', 'a long note is refused');
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 1300, null, false) $$, current_setting('t.elec'), (current_setting('t.today')::date - 30)::text),
  'P0001', 'already_recorded', 'a second reading on the same day is refused');
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 900, null, false) $$, current_setting('t.elec'), (current_setting('t.today')::date - 10)::text),
  'P0001', 'lower_than_previous', 'a lower value than the previous reading is refused');
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 1300, null, false) $$, current_setting('t.elec'), (current_setting('t.today')::date - 45)::text),
  'P0001', 'higher_than_later', 'a higher value than a later reading is refused');
select lives_ok(format($$ select public.record_meter_reading(%L, %L, 1100, null, false) $$, current_setting('t.elec'), (current_setting('t.today')::date - 45)::text),
  'a reading between two others keeps the order');
select lives_ok(format($$ select public.record_meter_reading(%L, %L, 50, 'New meter fitted', true) $$, current_setting('t.elec'), (current_setting('t.today')::date - 5)::text),
  'a lower value is accepted when it is marked as a reset');
reset role;

-- Readings cannot be edited or deleted.
select throws_ok($$ update public.meter_readings set value = 1 $$, '42501', 'meter_readings_are_permanent', 'a reading cannot be edited');
select throws_ok($$ delete from public.meter_readings $$, '42501', 'meter_readings_are_permanent', 'or deleted');

-- Cancelling: the recorder or an admin; it frees the day.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($$ select public.void_meter_reading(%L) $$, current_setting('t.r2')), '42501', 'not_allowed', 'another member cannot cancel a reading');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.void_meter_reading(current_setting('t.r2')::uuid);
select throws_ok(format($$ select public.void_meter_reading(%L) $$, current_setting('t.r2')), 'P0001', 'reading_not_found', 'a cancelled reading cannot be cancelled again');
select lives_ok(format($$ select public.record_meter_reading(%L, %L, 1200, null, false) $$, current_setting('t.elec'), (current_setting('t.today')::date - 30)::text),
  'a cancelled reading frees its day');
reset role;
select ok((select voided_by = current_setting('t.bob')::uuid and value = 1214.5 from public.meter_readings where id = current_setting('t.r2')::uuid),
  'the cancelled row is kept, with who cancelled it');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.void_meter_reading(current_setting('t.r1')::uuid);
reset role;
select ok((select voided_by = current_setting('t.alice')::uuid from public.meter_readings where id = current_setting('t.r1')::uuid),
  'an admin can cancel anyone''s reading');

-- Editing and archiving meters.
set local role authenticated;
select throws_ok(format($$ select public.save_meter(%L, 'gas', 'Hall', 'kWh') $$, current_setting('t.elec')),
  'P0001', 'meter_has_readings', 'kind and unit are fixed once a meter has readings');
select lives_ok(format($$ select public.save_meter(%L, 'electricity', 'Hall meter', 'kWh') $$, current_setting('t.elec')),
  'but the label can change');
select public.archive_meter(current_setting('t.gas')::uuid);
select throws_ok(format($$ select public.record_meter_reading(%L, %L, 5, null, false) $$, current_setting('t.gas'), current_setting('t.today')),
  'P0001', 'meter_not_found', 'an archived meter takes no more readings');
reset role;
select ok((select archived_at is not null from public.meters where id = current_setting('t.gas')::uuid), 'archiving marks the meter');
select is((select count(*)::int from public.meter_readings where meter_id = current_setting('t.elec')::uuid), 5,
  'and readings stay readable');

-- The cap: 10 active meters.
set local role authenticated;
select public.save_meter(null, 'water', 'W' || n, 'm3') from generate_series(1, 9) n;
select throws_ok($$ select public.save_meter(null, 'water', 'one too many', 'm3') $$, 'P0001', 'too_many_meters', 'the 11th active meter is refused');
reset role;

select * from finish();
rollback;
