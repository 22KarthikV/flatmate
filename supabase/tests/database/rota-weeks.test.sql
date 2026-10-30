begin;
select plan(70);

-- Rota weeks, assignments and ticks (SPEC-rota T8, T9, T11, T18, assumptions 7 and 8). The scheduler
-- is TypeScript; the database stores what it returns, checks it again, snapshots the chore
-- templates into each assignment, keeps every revision, and lets the right people tick steps.

select has_table('public', 'rota_weeks', 'rota_weeks exists');
select has_table('public', 'chore_assignments', 'chore_assignments exists');
select has_table('public', 'assignment_items', 'assignment_items exists');
select has_table('public', 'rotation_state', 'rotation_state exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.rota_weeks'::regclass, 'public.chore_assignments'::regclass,
                  'public.assignment_items'::regclass, 'public.rotation_state'::regclass)),
  'row-level security is on for every rota week table'
);
select ok(
  not exists (
    select 1 from unnest(array['public.rota_weeks', 'public.chore_assignments', 'public.assignment_items', 'public.rotation_state']) t(name)
     cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
     where has_table_privilege('anon', t.name, p.priv)
  )
  and not exists (
    select 1 from unnest(array['public.rota_weeks', 'public.chore_assignments', 'public.assignment_items', 'public.rotation_state']) t(name)
     cross join unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
     where has_table_privilege('authenticated', t.name, p.priv)
  ),
  'anon has nothing and the browser role can only read'
);
select ok(
  has_function_privilege('authenticated', 'public.store_rota_week(date, jsonb, jsonb, text)', 'execute')
  and has_function_privilege('authenticated', 'public.tick_item(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.untick_item(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.complete_assignment(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.reopen_assignment(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.sign_off_assignment(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.store_rota_week(date, jsonb, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'public.tick_item(uuid)', 'execute'),
  'signed-in people can call the week functions; anon cannot'
);
select is(
  (select count(*)::int from public.notification_types
    where (type, default_in_app, default_push, snoozable) in
      (('rota_week_ready', true, true, false), ('chore_assigned', true, true, false), ('chore_unassigned', true, false, false))
      and (push_title is not null) = (default_push)),
  3, 'the week notification types exist, with fixed push text only where they push'
);

-- People: alice (owner), bob (admin), carol, dave (members) in Flat A; frank left; gina alone in Flat G.
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

-- Chores: Kitchen (weekly, effort 3, two steps), Bins (every 2 days, effort 1, no steps),
-- Hallway (weekly, effort 1, sign-off needed, one step). Flat G has one chore of its own.
insert into public.chores (id, household_id, name, cadence, preferred_dow, every_n_days, effort, needs_signoff) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Kitchen', 'weekly', 3, null, 3, false),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bins', 'every_n_days', null, 2, 1, false),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Hallway', 'weekly', 0, null, 1, true),
  ('c9000000-0000-0000-0000-000000000009', '90000000-0000-0000-0000-000000000001', 'Gina''s job', 'weekly', 1, null, 2, false);
insert into public.chore_checklist_items (chore_id, position, text) values
  ('c1000000-0000-0000-0000-000000000001', 1, 'Wipe the worktops'),
  ('c1000000-0000-0000-0000-000000000001', 2, 'Sweep'),
  ('c3000000-0000-0000-0000-000000000003', 1, 'Vacuum');

-- Bob is away on Friday 13 Nov.
insert into public.availability (household_id, profile_id, on_date, available)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, '2026-11-13', false);

-- ---------------------------------------------------------------------------------------------
-- Storing a week. "Now" is Tuesday 3 Nov 2026; the week starts Sunday 8 Nov.
select set_config('t.week1', private.rota_store_week(
  '2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'weekly', null,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', current_setting('t.bob'), 'dueOn', '2026-11-11', 'explanation', 'You did Kitchen longest ago.'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.carol'), 'dueOn', '2026-11-08', 'explanation', 'You have done the least effort lately.'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.dave'), 'dueOn', '2026-11-10', 'explanation', 'You have done the least effort lately.'),
    jsonb_build_object('choreId', 'c3000000-0000-0000-0000-000000000003', 'assignee', null, 'dueOn', '2026-11-08', 'explanation', 'Nobody is around for Hallway this week.')
  ),
  jsonb_build_array(jsonb_build_object('profileId', current_setting('t.alice'), 'choreId', 'c1000000-0000-0000-0000-000000000001', 'delta', 1))
)::text, true);

select results_eq(
  $$select week_start, revision, reason, created_by is null, superseded_at is null, cardinality(member_ids)
      from public.rota_weeks where id = current_setting('t.week1')::uuid$$,
  $$values ('2026-11-08'::date, 1, 'weekly'::text, true, true, 4)$$,
  'the week is stored as revision 1 for the four current members'
);
select results_eq(
  $$select chore_name, effort::int, due_on, explanation, needs_signoff from public.chore_assignments
     where rota_week_id = current_setting('t.week1')::uuid and chore_id = 'c1000000-0000-0000-0000-000000000001'$$,
  $$values ('Kitchen'::text, 3, '2026-11-11'::date, 'You did Kitchen longest ago.'::text, false)$$,
  'each assignment snapshots the chore name and effort and keeps its explanation'
);
select is(
  (select count(*)::int from public.chore_assignments where rota_week_id = current_setting('t.week1')::uuid), 4,
  'every slot is stored, including the one nobody could do'
);
select is(
  (select count(*)::int from public.chore_assignments where rota_week_id = current_setting('t.week1')::uuid and assignee is null), 1,
  'an unassigned slot is kept, not dropped'
);
select results_eq(
  $$select i.position::int, i.text, i.done_at is null from public.assignment_items i
      join public.chore_assignments a on a.id = i.assignment_id
     where a.rota_week_id = current_setting('t.week1')::uuid and a.chore_name = 'Kitchen' order by 1$$,
  $$values (1, 'Wipe the worktops'::text, true), (2, 'Sweep', true)$$,
  'the checklist is copied into the assignment, unticked'
);

-- Notifications: everyone is told the week is ready; assignees about their chores; admins about the gap.
select is((select count(*)::int from public.notifications where type = 'rota_week_ready'), 4, 'all four members are told the rota is ready');
select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.type = 'chore_assigned' order by 1$$,
  $$values ('Bob'::text), ('Carol'), ('Dave')$$,
  'people given chores are told, and only them'
);
select ok(
  (select body like '%Kitchen%Wednesday%' from public.notifications n where n.type = 'chore_assigned' and n.recipient_id = current_setting('t.bob')::uuid),
  'the inbox message names the chore and day'
);
select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.type = 'chore_unassigned' order by 1$$,
  $$values ('Alice'::text), ('Bob')$$,
  'owners and admins are told about a chore nobody could take'
);
select is((select count(*)::int from public.push_outbox), 0, 'no push is queued without a registered device');

-- Rotation state.
select results_eq(
  $$select last_done_on, owed_turns::int from public.rotation_state
     where profile_id = current_setting('t.bob')::uuid and chore_id = 'c1000000-0000-0000-0000-000000000001'$$,
  $$values ('2026-11-11'::date, 0)$$,
  'rotation state remembers when each person last had each chore'
);
select results_eq(
  $$select owed_turns::int from public.rotation_state
     where profile_id = current_setting('t.alice')::uuid and chore_id = 'c1000000-0000-0000-0000-000000000001'$$,
  $$values (1)$$,
  'and who was passed over'
);

-- ---------------------------------------------------------------------------------------------
-- Idempotency (T9): the same week again, with reason weekly, is the same revision.
select is(
  private.rota_store_week('2026-11-03 13:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'weekly', null, '[]'::jsonb, '[]'::jsonb)::text,
  current_setting('t.week1'), 'generating the same week twice returns the same revision'
);
select is((select count(*)::int from public.rota_weeks where week_start = '2026-11-08'), 1, 'and creates no second one');
select is((select count(*)::int from public.notifications where type = 'rota_week_ready'), 4, 'and tells nobody twice');

-- A manual rebuild is a new revision; the old one stays, marked superseded.
select set_config('t.week2', private.rota_store_week(
  '2026-11-04 09:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'manual', current_setting('t.alice')::uuid,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', current_setting('t.carol'), 'dueOn', '2026-11-11', 'explanation', 'It was your turn in the rotation.')
  ), '[]'::jsonb)::text, true);
select results_eq(
  $$select revision, superseded_at is null, reason, created_by is not distinct from current_setting('t.alice')::uuid
      from public.rota_weeks where week_start = '2026-11-08' order by revision$$,
  $$values (1, false, 'weekly'::text, false), (2, true, 'manual', true)$$,
  'revision 2 replaces revision 1, which is kept and marked superseded'
);
select is((select count(*)::int from public.chore_assignments where rota_week_id = current_setting('t.week1')::uuid), 4,
  'the earlier revision''s assignments are all still there');
select is((select count(*)::int from public.notifications where type = 'rota_week_ready'), 8, 'the rebuild is announced once per member');

-- ---------------------------------------------------------------------------------------------
-- Refusals. The database re-checks everything the scheduler produced.
select throws_ok($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-09', 'manual', null, '[]', '[]') $sql$,
  '22023', 'invalid_week', 'a week must start on a Sunday');
select throws_ok($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-29', 'manual', null, '[]', '[]') $sql$,
  'P0001', 'week_too_far', 'a week more than two weeks ahead is refused');
select throws_ok($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-10-25', 'manual', null, '[]', '[]') $sql$,
  'P0001', 'week_in_past', 'a week that has already finished is refused');
select throws_ok($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-15', 'whenever', null, '[]', '[]') $sql$,
  '22023', 'invalid_reason', 'an unknown reason is refused');
select throws_ok(format($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-15', 'manual', null,
  '[{"choreId": "c1000000-0000-0000-0000-000000000001", "assignee": "%s", "dueOn": "2026-11-18", "explanation": "x"}]', '[]') $sql$, current_setting('t.frank')),
  'P0001', 'not_a_member', 'someone who left cannot be given a chore');
select throws_ok(format($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-15', 'manual', null,
  '[{"choreId": "c1000000-0000-0000-0000-000000000001", "assignee": "%s", "dueOn": "2026-11-18", "explanation": "x"}]', '[]') $sql$, current_setting('t.gina')),
  'P0001', 'not_a_member', 'nor someone from another flat');
select throws_ok(format($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'manual', null,
  '[{"choreId": "c1000000-0000-0000-0000-000000000001", "assignee": "%s", "dueOn": "2026-11-13", "explanation": "x"}]', '[]') $sql$, current_setting('t.bob')),
  'P0001', 'assignee_unavailable', 'a chore cannot land on a day the person said they are away');
select throws_ok(format($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'manual', null,
  '[{"choreId": "c1000000-0000-0000-0000-000000000001", "assignee": "%s", "dueOn": "2026-11-16", "explanation": "x"}]', '[]') $sql$, current_setting('t.bob')),
  '22023', 'invalid_date', 'a due date outside the week is refused');
select throws_ok($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'manual', null,
  '[{"choreId": "c9000000-0000-0000-0000-000000000009", "assignee": null, "dueOn": "2026-11-09", "explanation": "x"}]', '[]') $sql$,
  'P0002', 'chore_not_found', 'another flat''s chore is refused');
select throws_ok($sql$ select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'manual', null,
  '[{"choreId": "c1000000-0000-0000-0000-000000000001", "assignee": null, "dueOn": "2026-11-09", "explanation": ""}]', '[]') $sql$,
  '22023', 'invalid_assignment', 'an assignment must carry its explanation');

-- Public wrapper: only admins, from a browser role.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.store_rota_week('2026-11-08', '[]', '[]', 'manual') $sql$, '42501', 'not_allowed', 'a plain member cannot store a week');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.store_rota_week('2026-11-08', '[]', '[]', 'undo') $sql$, '22023', 'invalid_reason', 'the browser cannot name an internal reason');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Templates can change without touching what was handed out (T8).
update public.chores set name = 'Kitchen deep clean', effort = 5 where id = 'c1000000-0000-0000-0000-000000000001';
delete from public.chore_checklist_items where chore_id = 'c1000000-0000-0000-0000-000000000001';
select results_eq(
  $$select chore_name, effort::int from public.chore_assignments where rota_week_id = current_setting('t.week2')::uuid$$,
  $$values ('Kitchen'::text, 3)$$, 'editing a chore later leaves a stored assignment''s name and effort alone');
select is((select count(*)::int from public.assignment_items i join public.chore_assignments a on a.id = i.assignment_id
            where a.rota_week_id = current_setting('t.week2')::uuid), 2, 'and its copied checklist');

-- ---------------------------------------------------------------------------------------------
-- Ticking. Week 2 (current): Kitchen is Carol's. Week 1 is superseded.
select set_config('t.kitchen', (select id::text from public.chore_assignments where rota_week_id = current_setting('t.week2')::uuid), true);
select set_config('t.step1', (select id::text from public.assignment_items where assignment_id = current_setting('t.kitchen')::uuid and position = 1), true);
select set_config('t.step2', (select id::text from public.assignment_items where assignment_id = current_setting('t.kitchen')::uuid and position = 2), true);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.tick_item('%s') $sql$, current_setting('t.step1')), '42501', 'not_allowed',
  'a flatmate who is neither the assignee nor an admin cannot tick');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.tick_item(current_setting('t.step1')::uuid);
reset role;
select results_eq(
  $$select done_at is not null, done_by = current_setting('t.carol')::uuid from public.assignment_items where id = current_setting('t.step1')::uuid$$,
  $$values (true, true)$$, 'the assignee ticks a step and it records who');
select ok((select completed_at is null from public.chore_assignments where id = current_setting('t.kitchen')::uuid),
  'one step of two does not complete the chore');
set local role authenticated;
select public.tick_item(current_setting('t.step2')::uuid);
reset role;
select ok((select completed_at is not null from public.chore_assignments where id = current_setting('t.kitchen')::uuid),
  'ticking every step completes it');

-- Untick: by whoever ticked, or an admin. Unticking reopens and says so.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.untick_item('%s') $sql$, current_setting('t.step2')), '42501', 'not_allowed',
  'someone else cannot untick it');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.untick_item(current_setting('t.step2')::uuid);
reset role;
select results_eq(
  $$select completed_at is null, reopened_by = current_setting('t.bob')::uuid, reopened_at is not null from public.chore_assignments where id = current_setting('t.kitchen')::uuid$$,
  $$values (true, true, true)$$, 'an admin can untick, which reopens the chore and records who');

-- Reopen a completed chore: the last step is unticked so there is something to do.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.tick_item(current_setting('t.step2')::uuid);
select public.reopen_assignment(current_setting('t.kitchen')::uuid);
reset role;
select results_eq(
  $$select a.completed_at is null, a.reopened_by = current_setting('t.carol')::uuid,
          (select done_at is null from public.assignment_items where id = current_setting('t.step2')::uuid)
     from public.chore_assignments a where a.id = current_setting('t.kitchen')::uuid$$,
  $$values (true, true, true)$$, 'the assignee can reopen a finished chore, which unticks its last step');

-- A chore with no steps is completed in one go; one with steps is not.
select set_config('t.bins', (select id::text from public.chore_assignments where rota_week_id = current_setting('t.week1')::uuid and assignee = current_setting('t.carol')::uuid), true);
set local role authenticated;
select throws_ok(format($sql$ select public.complete_assignment('%s') $sql$, current_setting('t.kitchen')), 'P0001', 'has_checklist',
  'a chore with steps is completed by ticking them');
reset role;

-- A superseded revision cannot be ticked.
select set_config('t.oldstep', (select i.id::text from public.assignment_items i join public.chore_assignments a on a.id = i.assignment_id
                                  where a.rota_week_id = current_setting('t.week1')::uuid limit 1), true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.tick_item('%s') $sql$, current_setting('t.oldstep')), 'P0001', 'assignment_superseded',
  'a step of a replaced revision cannot be ticked');
reset role;

-- Store week 3 with a step-less Bins and a sign-off Hallway to cover the rest.
select set_config('t.week3', private.rota_store_week(
  '2026-11-04 09:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-15', 'weekly', null,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.dave'), 'dueOn', '2026-11-15', 'explanation', 'It was your turn in the rotation.'),
    jsonb_build_object('choreId', 'c3000000-0000-0000-0000-000000000003', 'assignee', current_setting('t.carol'), 'dueOn', '2026-11-15', 'explanation', 'It was your turn in the rotation.')
  ), '[]'::jsonb)::text, true);
select set_config('t.bins3', (select id::text from public.chore_assignments where rota_week_id = current_setting('t.week3')::uuid and chore_name = 'Bins'), true);
select set_config('t.hall3', (select id::text from public.chore_assignments where rota_week_id = current_setting('t.week3')::uuid and chore_name = 'Hallway'), true);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select public.complete_assignment(current_setting('t.bins3')::uuid);
reset role;
select ok((select completed_at is not null from public.chore_assignments where id = current_setting('t.bins3')::uuid), 'a chore with no steps is completed directly');

-- Sign-off: only when the chore asks for it, only by someone else, only when done.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.sign_off_assignment('%s') $sql$, current_setting('t.hall3')), 'P0001', 'not_completed', 'it must be finished before it is signed off');
select public.tick_item((select id from public.assignment_items where assignment_id = current_setting('t.hall3')::uuid));
select throws_ok(format($sql$ select public.sign_off_assignment('%s') $sql$, current_setting('t.hall3')), '42501', 'not_allowed', 'you cannot sign off your own chore');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select public.sign_off_assignment(current_setting('t.hall3')::uuid);
select throws_ok(format($sql$ select public.sign_off_assignment('%s') $sql$, current_setting('t.bins3')), 'P0001', 'no_signoff_needed', 'a chore that does not ask for sign-off cannot be signed off');
reset role;
select ok((select signed_off_by = current_setting('t.dave')::uuid from public.chore_assignments where id = current_setting('t.hall3')::uuid), 'a flatmate signs it off');

-- ---------------------------------------------------------------------------------------------
-- History is never rewritten.
select throws_ok(format($sql$ update public.chore_assignments set assignee = null where id = '%s' $sql$, current_setting('t.kitchen')),
  'P0001', 'rota_is_append_only', 'an assignment''s assignee cannot be changed');
select throws_ok(format($sql$ update public.chore_assignments set explanation = 'rewritten' where id = '%s' $sql$, current_setting('t.kitchen')),
  'P0001', 'rota_is_append_only', 'nor its explanation');
select throws_ok($sql$ delete from public.chore_assignments $sql$, 'P0001', 'rota_is_append_only', 'assignments are never deleted');
select throws_ok(format($sql$ update public.assignment_items set text = 'x' where id = '%s' $sql$, current_setting('t.step1')),
  'P0001', 'rota_is_append_only', 'a copied step''s text cannot change');
select throws_ok($sql$ delete from public.assignment_items $sql$, 'P0001', 'rota_is_append_only', 'steps are never deleted');
select throws_ok(format($sql$ update public.rota_weeks set week_start = '2026-11-15' where id = '%s' $sql$, current_setting('t.week1')),
  'P0001', 'rota_is_append_only', 'a week cannot be moved');
select throws_ok($sql$ delete from public.rota_weeks $sql$, 'P0001', 'rota_is_append_only', 'weeks are never deleted');
select throws_ok($sql$ truncate public.chore_assignments cascade $sql$, 'P0001', 'rota_is_append_only', 'nor truncated');

-- ---------------------------------------------------------------------------------------------
-- Isolation.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select ok((select count(*) from public.chore_assignments) > 0 and (select count(*) from public.rota_weeks) = 3
  and (select count(*) from public.rotation_state) > 0, 'a member reads their flat''s weeks, assignments and state');
select throws_ok($sql$ insert into public.rotation_state (household_id, profile_id, chore_id) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'c1000000-0000-0000-0000-000000000001') $sql$,
  '42501', null, 'the browser role cannot write rotation state');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000011", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rota_weeks) + (select count(*)::int from public.chore_assignments)
        + (select count(*)::int from public.assignment_items) + (select count(*)::int from public.rotation_state), 0,
  'another flat sees none of it');
reset role;
set local role anon;
select throws_ok($sql$ select count(*) from public.chore_assignments $sql$, '42501', null, 'anon cannot read assignments');
reset role;

-- Table-level integrity that does not depend on who writes.
select throws_ok($sql$ insert into public.rota_weeks (household_id, week_start) values ('a0000000-0000-0000-0000-000000000001', '2026-11-09') $sql$,
  '23514', null, 'a week start must be a Sunday');
select throws_ok($sql$ insert into public.rota_weeks (household_id, week_start, revision) values ('a0000000-0000-0000-0000-000000000001', '2026-11-08', 1) $sql$,
  '23505', null, 'a week and revision are unique');
select throws_ok($sql$ insert into public.rota_weeks (household_id, week_start, revision) values ('a0000000-0000-0000-0000-000000000001', '2026-11-08', 9) $sql$,
  '23505', null, 'only one revision of a week can be the current one');
select throws_ok(format($sql$ insert into public.chore_assignments (household_id, rota_week_id, chore_id, chore_name, effort, assignee, due_on, explanation)
  values ('a0000000-0000-0000-0000-000000000001', '%s', 'c1000000-0000-0000-0000-000000000001', 'Kitchen', 3, '%s', '2026-11-11', 'x') $sql$,
  current_setting('t.week2'), current_setting('t.frank')), 'P0001', 'not_a_member', 'the table itself refuses an assignee who is not an active member');

select * from finish();
rollback;
