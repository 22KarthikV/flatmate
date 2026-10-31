begin;
select plan(28);

-- Rota overdue chores: fairness counts effort that was done. An old chore can be covered by a later
-- one of the same kind (no credit), or excused by an admin (counts as done).

select has_column('public', 'chore_assignments', 'covered_by', 'a chore can say what covered it');
select has_column('public', 'chore_assignments', 'excused_by', 'a chore can say who excused it');
select ok(
  has_function_privilege('authenticated', 'public.cover_assignment(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.excuse_assignment(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cover_assignment(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.excuse_assignment(uuid)', 'execute'),
  'signed-in people can call the new functions; anon cannot');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
-- This week's Sunday, and last week's.
select set_config('t.tw', ((now() at time zone 'Europe/London')::date - extract(dow from (now() at time zone 'Europe/London')::date)::int)::text, true);
select set_config('t.lw', (current_setting('t.tw')::date - 7)::text, true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member');
insert into public.chores (id, household_id, name, cadence, preferred_dow, every_n_days, effort) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Kitchen', 'weekly', 3, null, 3),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bins', 'weekly', 2, null, 1),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Hallway', 'weekly', 5, null, 1);

-- Last week: Kitchen bob, Bins carol, Hallway carol. This week: Kitchen bob, Bins bob.
select private.rota_store_week(now() - interval '7 days', 'a0000000-0000-0000-0000-000000000001', current_setting('t.lw')::date, 'weekly', null,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', current_setting('t.bob'), 'dueOn', (current_setting('t.lw')::date + 3)::text, 'explanation', 'x1'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.carol'), 'dueOn', (current_setting('t.lw')::date + 2)::text, 'explanation', 'x2'),
    jsonb_build_object('choreId', 'c3000000-0000-0000-0000-000000000003', 'assignee', current_setting('t.carol'), 'dueOn', (current_setting('t.lw')::date + 5)::text, 'explanation', 'x3')
  ), '[]'::jsonb);
select private.rota_store_week(now(), 'a0000000-0000-0000-0000-000000000001', current_setting('t.tw')::date, 'weekly', null,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', current_setting('t.bob'), 'dueOn', (current_setting('t.tw')::date + 3)::text, 'explanation', 'y1'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.bob'), 'dueOn', (current_setting('t.tw')::date + 2)::text, 'explanation', 'y2')
  ), '[]'::jsonb);
select set_config('t.old_kitchen', (select a.id::text from public.chore_assignments a join public.rota_weeks w on w.id = a.rota_week_id where a.chore_name = 'Kitchen' and w.week_start = current_setting('t.lw')::date), true);
select set_config('t.old_bins', (select a.id::text from public.chore_assignments a join public.rota_weeks w on w.id = a.rota_week_id where a.chore_name = 'Bins' and w.week_start = current_setting('t.lw')::date), true);
select set_config('t.old_hall', (select a.id::text from public.chore_assignments a join public.rota_weeks w on w.id = a.rota_week_id where a.chore_name = 'Hallway' and w.week_start = current_setting('t.lw')::date), true);
select set_config('t.new_kitchen', (select a.id::text from public.chore_assignments a join public.rota_weeks w on w.id = a.rota_week_id where a.chore_name = 'Kitchen' and w.week_start = current_setting('t.tw')::date), true);
select set_config('t.new_bins', (select a.id::text from public.chore_assignments a join public.rota_weeks w on w.id = a.rota_week_id where a.chore_name = 'Bins' and w.week_start = current_setting('t.tw')::date), true);

create function pg_temp.history(p_done boolean) returns integer language sql as $$
  select count(*)::int
    from jsonb_array_elements(private.rota_generation_input('a0000000-0000-0000-0000-000000000001', current_setting('t.tw')::date + 7) -> 'history') w,
         jsonb_array_elements(w -> 'assignments') a
   where (a ->> 'done')::boolean = p_done;
$$;

-- ---------------------------------------------------------------------------------------------
-- History: nothing is done yet, so nothing is credited.
select is(pg_temp.history(true), 0, 'chores nobody has finished are not credited');
select is(pg_temp.history(false), 5, 'every assignment in past weeks is in the history, marked not done');

-- Carol finishes the bins from last week, late: it is credited.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(format($sql$select public.complete_assignment('%s')$sql$, current_setting('t.old_bins')), 'a chore from an earlier week can still be finished');
reset role;
select is(pg_temp.history(true), 1, 'a chore finished late counts as done');

-- ---------------------------------------------------------------------------------------------
-- Covering.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$select public.cover_assignment('%s', '%s')$sql$, current_setting('t.old_kitchen'), current_setting('t.new_kitchen')),
  '42501', 'not_allowed', 'only the person who has the chore, or an admin, can cover it');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$select public.cover_assignment('%s', '%s')$sql$, current_setting('t.old_kitchen'), current_setting('t.new_bins')),
  'P0001', 'cannot_cover', 'a different chore cannot cover it');
select throws_ok(format($sql$select public.cover_assignment('%s', '%s')$sql$, current_setting('t.new_kitchen'), current_setting('t.new_bins')),
  'P0001', 'not_overdue', 'a chore from this week is not overdue');
select throws_ok(format($sql$select public.cover_assignment('%s', '%s')$sql$, current_setting('t.old_bins'), current_setting('t.new_bins')),
  '42501', 'not_allowed', 'a finished chore of someone else is not yours to cover');
select lives_ok(format($sql$select public.cover_assignment('%s', '%s')$sql$, current_setting('t.old_kitchen'), current_setting('t.new_kitchen')),
  'the same person can cover it with this week''s same chore');
select throws_ok(format($sql$select public.cover_assignment('%s', '%s')$sql$, current_setting('t.old_kitchen'), current_setting('t.new_kitchen')),
  'P0001', 'not_overdue', 'a covered chore is closed');
reset role;

select is((select covered_by from public.chore_assignments where id = current_setting('t.old_kitchen')::uuid), current_setting('t.new_kitchen')::uuid,
  'the old chore says what covered it');
select is(pg_temp.history(true), 1, 'a covered chore earns no credit');

-- Doing the later one earns credit once.
set local role authenticated;
select lives_ok(format($sql$select public.complete_assignment('%s')$sql$, current_setting('t.new_kitchen')), 'the later chore is finished');
reset role;
select is(pg_temp.history(true), 2, 'doing the later chore earns credit once, for it alone');
update public.chore_assignments set completed_at = now() where id = current_setting('t.old_kitchen')::uuid;
select is(pg_temp.history(true), 2, 'even if the covered chore is later ticked, it is still no credit');

-- ---------------------------------------------------------------------------------------------
-- Excusing.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$select public.excuse_assignment('%s')$sql$, current_setting('t.old_hall')),
  '42501', 'not_allowed', 'a member cannot excuse a chore, not even their own');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$select public.excuse_assignment('%s')$sql$, current_setting('t.new_bins')),
  'P0001', 'not_overdue', 'a chore from this week cannot be excused yet');
select throws_ok(format($sql$select public.excuse_assignment('%s')$sql$, current_setting('t.old_bins')),
  'P0001', 'not_overdue', 'a finished chore does not need excusing');
select lives_ok(format($sql$select public.excuse_assignment('%s')$sql$, current_setting('t.old_hall')), 'an owner can excuse an unfinished chore');
select throws_ok(format($sql$select public.excuse_assignment('%s')$sql$, current_setting('t.old_hall')),
  'P0001', 'not_overdue', 'it cannot be excused twice');
reset role;

select is((select excused_by from public.chore_assignments where id = current_setting('t.old_hall')::uuid), current_setting('t.alice')::uuid,
  'it records who excused it');
select is(pg_temp.history(true), 3, 'an excused chore counts as done');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$select public.cover_assignment('%s', '%s')$sql$, current_setting('t.old_hall'), current_setting('t.new_kitchen')),
  'P0001', 'not_overdue', 'an excused chore cannot also be covered');
reset role;

-- History is still never rewritten.
select throws_ok(format($sql$update public.chore_assignments set effort = 5 where id = '%s'$sql$, current_setting('t.old_hall')),
  'P0001', 'rota_is_append_only', 'effort cannot be rewritten');
select throws_ok(format($sql$update public.chore_assignments set covered_at = null where id = '%s'$sql$, current_setting('t.old_kitchen')),
  '23514', null, 'covered_at and covered_by must be set together');

select * from finish();
rollback;
