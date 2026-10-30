begin;
select plan(35);

-- Rota generation and reminders (SPEC-rota T10, T11, T18). The scheduler runs in the rota-generate
-- Edge Function; the database says which flats are due, hands over the inputs, and stores the
-- result. Reminders for chores due today and overdue are plain database jobs. Time is a parameter.

select ok(exists (select 1 from cron.job where jobname = 'rota-generate' and command like '%rota-generate%'),
  'the hourly generation job is registered');
select ok(exists (select 1 from cron.job where jobname = 'rota-reminders'), 'the hourly reminder job is registered');
select ok(
  (select schedule from cron.job where jobname = 'rota-generate') <> (select schedule from cron.job where jobname = 'rota-availability')
  and (select schedule from cron.job where jobname = 'rota-reminders') <> (select schedule from cron.job where jobname = 'rota-availability')
  and (select schedule from cron.job where jobname = 'rota-generate') <> (select schedule from cron.job where jobname = 'rota-reminders'),
  'each rota job runs at a different minute');
select ok(
  has_function_privilege('service_role', 'public.rota_due_generations(timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.rota_generation_input_for(uuid, date)', 'execute')
  and has_function_privilege('service_role', 'public.store_rota_week_for(uuid, date, jsonb, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.rota_due_generations(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.rota_generation_input_for(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.store_rota_week_for(uuid, date, jsonb, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.rota_due_generations(timestamptz)', 'execute'),
  'only the service role can run generation for a flat');
select ok(
  has_function_privilege('authenticated', 'public.rota_generation_input(date)', 'execute')
  and not has_function_privilege('anon', 'public.rota_generation_input(date)', 'execute'),
  'an admin can read their own flat''s inputs for Generate now');
select is((select count(*)::int from public.notification_types
            where (type, default_in_app, default_push, snoozable) in (('chore_due', true, true, false), ('chore_overdue', true, true, false))
              and push_title is not null),
  2, 'the reminder types exist and push with fixed generic text');

-- People: alice (owner), bob (admin), carol, dave in Flat A; frank left; gina alone in Flat G (no chores).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name": "Frank"}'),
  ('00000000-0000-0000-0000-000000000011', 'gina@example.com', '{"full_name": "Gina"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
select set_config('t.frank', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000f'), true);
select set_config('t.gina', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000011'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('90000000-0000-0000-0000-000000000001', 'Flat G', current_setting('t.gina')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'member'),
  ('90000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid, 'owner');
insert into public.memberships (household_id, profile_id, role, left_at, left_reason)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 'member', now(), 'left');

insert into public.chores (id, household_id, name, cadence, preferred_dow, every_n_days, effort) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Kitchen', 'weekly', 3, null, 3),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bins', 'every_n_days', null, 2, 1);
insert into public.chore_checklist_items (chore_id, position, text) values ('c1000000-0000-0000-0000-000000000001', 1, 'Wipe');
-- Flat G has only an archived chore, so it does not use the rota.
insert into public.chores (household_id, name, cadence, preferred_dow, archived_at)
values ('90000000-0000-0000-0000-000000000001', 'Old', 'weekly', 1, now());

-- Bob answered: away on Friday 13 Nov. The others have not.
insert into public.availability (household_id, profile_id, on_date, available)
select 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, d, d <> '2026-11-13'
  from generate_series('2026-11-08'::date, '2026-11-14', '1 day') d;

-- ---------------------------------------------------------------------------------------------
-- Which weeks are due. The week of Sun 8 Nov closes Sat 7 Nov 18:00.
select is((select count(*)::int from public.rota_due_generations('2026-11-07 17:59:59+00')), 0, 'nothing is due before the window closes');
select is((select count(*)::int from public.availability where assumed), 0, 'and nobody is filled in yet');

select results_eq(
  $$select household_id, week_start from public.rota_due_generations('2026-11-07 18:00:00+00')$$,
  $$values ('a0000000-0000-0000-0000-000000000001'::uuid, '2026-11-08'::date)$$,
  'once it closes, only the flat that uses the rota is due, for the right week'
);
select is((select count(*)::int from public.availability where assumed and household_id = 'a0000000-0000-0000-0000-000000000001'), 21,
  'those who did not answer were filled in as around (three people, seven days)');
select is((select count(*)::int from public.availability where household_id = '90000000-0000-0000-0000-000000000001'), 0,
  'a flat with no chores is left alone');

-- The inputs the scheduler needs.
select ok(
  (select (j -> 'members') @> to_jsonb(array[current_setting('t.alice'), current_setting('t.dave')]) and jsonb_array_length(j -> 'members') = 4
       and jsonb_array_length(j -> 'chores') = 2
       and (j #>> array['availability', current_setting('t.bob'), '2026-11-13'])::boolean = false
       and (j #>> array['availability', current_setting('t.dave'), '2026-11-13'])::boolean = true
       and jsonb_array_length(j -> 'history') = 0
     from (select public.rota_generation_input_for('a0000000-0000-0000-0000-000000000001', '2026-11-08') j) x),
  'the inputs list the four current members, two chores, everyone''s availability and no history yet'
);
select ok(
  (select (j -> 'chores' -> 0) ?& array['id', 'name', 'cadence', 'preferredDow', 'everyNDays', 'effort']
     from (select public.rota_generation_input_for('a0000000-0000-0000-0000-000000000001', '2026-11-08') j) x),
  'each chore carries what the scheduler reads');

-- Store the result as the service role would. Twice gives one revision.
select set_config('t.week', private.rota_store_week('2026-11-07 18:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'weekly', null,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', current_setting('t.carol'), 'dueOn', '2026-11-11', 'explanation', 'You did Kitchen longest ago.'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.dave'), 'dueOn', '2026-11-08', 'explanation', 'It was your turn in the rotation.'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.bob'), 'dueOn', '2026-11-10', 'explanation', 'It was your turn in the rotation.')
  ), '[]'::jsonb)::text, true);
select is(private.rota_store_week('2026-11-07 19:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'weekly', null, '[]', '[]')::text, current_setting('t.week'),
  'storing the week again returns the same one');
select is((select count(*)::int from public.rota_weeks), 1, 'so there is one revision');
select results_eq(
  $$select reason, created_by is null from public.rota_weeks$$, $$values ('weekly'::text, true)$$,
  'it is recorded as the weekly job''s work, with nobody''s name on it');
select is((select count(*)::int from public.rota_due_generations('2026-11-07 18:00:00+00')), 0, 'the week is no longer due');
select is((select count(*)::int from public.rota_due_generations('2026-11-07 23:30:00+00')), 0, 'and not later in the evening either');

select ok(
  (select (j -> 'lastDone' -> current_setting('t.carol') ->> 'c1000000-0000-0000-0000-000000000001') = '2026-11-11'
     from (select public.rota_generation_input_for('a0000000-0000-0000-0000-000000000001', '2026-11-15') j) x),
  'the next week''s inputs remember who last had what');
select results_eq(
  $$select jsonb_array_length(j -> 'history'), jsonb_array_length(j #> '{history,0,members}'), jsonb_array_length(j #> '{history,0,assignments}')
      from (select public.rota_generation_input_for('a0000000-0000-0000-0000-000000000001', '2026-11-15') j) x$$,
  $$values (1, 4, 3)$$,
  'and carry last week as history: its four members and three assignments'
);

-- The admin's own view for Generate now: derived from the caller, so no other flat's data.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.rota_generation_input('2026-11-15') $sql$, '42501', 'not_allowed', 'a plain member cannot read the inputs');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select is(jsonb_array_length(public.rota_generation_input('2026-11-15') -> 'members'), 4, 'an admin reads their own flat''s inputs');
select throws_ok($sql$ select public.rota_generation_input('2026-11-16') $sql$, '22023', 'invalid_week', 'the week must start on a Sunday');
reset role;
set local role authenticated;
select throws_ok($sql$ select public.rota_due_generations(now()) $sql$, '42501', null, 'the browser cannot ask which flats are due');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Reminders. Carol has Kitchen on Wed 11 Nov; Bob has Bins on Tue 10 Nov and Dave on Sun 8 Nov.
select set_config('t.kitchen', (select id::text from public.chore_assignments where chore_name = 'Kitchen'), true);
select private.rota_send_reminders('2026-11-11 07:59:00+00');
select is((select count(*)::int from public.notifications where type = 'chore_due'), 0, 'nothing is due before 8am');
select private.rota_send_reminders('2026-11-11 08:00:00+00');
select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id where n.type = 'chore_due'$$,
  $$values ('Carol'::text)$$,
  'at 8am on the day, the person with a chore due is reminded'
);
select private.rota_send_reminders('2026-11-11 09:00:00+00');
select is((select count(*)::int from public.notifications where type = 'chore_due'), 1, 'only once');
select ok((select title like '%Kitchen%' from public.notifications where type = 'chore_due'), 'the inbox message names the chore');

-- Overdue: Bins (Dave, 8 Nov; Bob, 10 Nov) are past due on the morning of the 11th. Carol's Kitchen is due, not overdue.
select is((select count(*)::int from public.notifications where type = 'chore_overdue'), 2, 'chores past their day and not finished are flagged, once');
select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id where n.type = 'chore_overdue' order by 1$$,
  $$values ('Bob'::text), ('Dave')$$, 'to the people they are overdue for');

-- Finished chores are not chased; the next day Carol's Kitchen is overdue unless she has finished it.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.tick_item((select id from public.assignment_items where assignment_id = current_setting('t.kitchen')::uuid));
reset role;
select private.rota_send_reminders('2026-11-12 08:00:00+00');
select is((select count(*)::int from public.notifications where type = 'chore_overdue' and recipient_id = current_setting('t.carol')::uuid), 0,
  'a finished chore is never chased');
select is((select count(*)::int from public.notifications where type = 'chore_overdue'), 2, 'and nothing already sent is sent again');

-- Someone who left is not chased; neither is a superseded revision.
update public.chore_assignments set superseded_at = now() where chore_name = 'Bins' and assignee = current_setting('t.bob')::uuid;
update public.memberships set left_at = now(), left_reason = 'left' where profile_id = current_setting('t.dave')::uuid;
delete from public.notifications where type in ('chore_due', 'chore_overdue');
select private.rota_send_reminders('2026-11-13 08:00:00+00');
select is((select count(*)::int from public.notifications where type in ('chore_due', 'chore_overdue')), 0,
  'leavers and replaced assignments are not chased');

-- The jobs record themselves once an hour.
select private.run_rota_reminders();
select private.run_rota_reminders();
select is((select count(*)::int from public.job_runs where job_name = 'rota-reminders' and status = 'succeeded'), 1,
  'the reminder job runs once an hour however often it is triggered');
select is((select count(*)::int from public.push_outbox), 0, 'no push was queued without a registered device');

select * from finish();
rollback;
