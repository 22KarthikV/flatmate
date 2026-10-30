begin;
select plan(63);

-- Rota when someone leaves (SPEC-rota T15, T16). Every way of leaving (leaving, being removed, account
-- deletion) records a rebuild through one trigger on memberships. Applying it moves the leaver's
-- future chores to people who stay, locks what is about to start, tells people once, and an admin
-- can undo it for 24 hours. Flats that do not use the rota are left alone.

select has_table('public', 'rota_rebuilds', 'rota_rebuilds exists');
select has_table('public', 'rota_rebuild_moves', 'rota_rebuild_moves exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rota_rebuilds'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.rota_rebuild_moves'::regclass),
  'row-level security is on for both');
select ok(
  not exists (select 1 from unnest(array['rota_rebuilds', 'rota_rebuild_moves']) t(tbl), unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
               where has_table_privilege('anon', 'public.' || t.tbl, p.priv))
  and not exists (select 1 from unnest(array['rota_rebuilds', 'rota_rebuild_moves']) t(tbl), unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
                   where has_table_privilege('authenticated', 'public.' || t.tbl, p.priv))
  and has_table_privilege('authenticated', 'public.rota_rebuilds', 'select')
  and has_table_privilege('authenticated', 'public.rota_rebuild_moves', 'select'),
  'anon has nothing and the browser role can only read');
select ok(
  not has_function_privilege('authenticated', 'public.rota_pending_rebuilds()', 'execute')
  and not has_function_privilege('authenticated', 'public.rota_rebuild_input(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.rota_apply_rebuild(uuid, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.rota_pending_rebuilds()', 'execute')
  and has_function_privilege('service_role', 'public.rota_rebuild_input(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.rota_apply_rebuild(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.undo_rota_rebuild(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.undo_rota_rebuild(uuid)', 'execute'),
  'the job functions are service-role only; undo is for signed-in people (and checks they are admins)');
select is((select count(*)::int from public.notification_types
            where type = 'rota_rebuilt' and default_in_app and default_push and not snoozable and push_title is not null),
  1, 'the rebuilt notification type exists, with fixed push text');
select is((select count(*)::int from cron.job where jobname = 'rota-rebalance' and schedule = '*/10 * * * *'),
  1, 'the rebuild job runs every ten minutes');
select is((select count(*)::int from pg_trigger where tgname = 'rota_note_member_left' and not tgisinternal),
  1, 'one trigger on memberships notices a leaving');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@example.com', '{"full_name": "Erin"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name": "Frank"}'),
  ('00000000-0000-0000-0000-000000000011', 'gina@example.com', '{"full_name": "Gina"}'),
  ('00000000-0000-0000-0000-000000000012', 'hugh@example.com', '{"full_name": "Hugh"}'),
  ('00000000-0000-0000-0000-000000000013', 'ivy@example.com', '{"full_name": "Ivy"}'),
  ('00000000-0000-0000-0000-000000000014', 'jon@example.com', '{"full_name": "Jon"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
select set_config('t.erin', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000e'), true);
select set_config('t.frank', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000f'), true);
select set_config('t.gina', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000011'), true);
select set_config('t.hugh', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000012'), true);
select set_config('t.ivy', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000013'), true);
select set_config('t.jon', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000014'), true);

-- Next week's Sunday, whatever day the tests run.
select set_config('t.w', (((now() at time zone 'Europe/London')::date - extract(dow from (now() at time zone 'Europe/London')::date)::int) + 7)::text, true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('90000000-0000-0000-0000-000000000001', 'Flat G', current_setting('t.gina')::uuid),
  ('80000000-0000-0000-0000-000000000001', 'Flat H', current_setting('t.hugh')::uuid),
  ('70000000-0000-0000-0000-000000000001', 'Flat I', current_setting('t.ivy')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.erin')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 'member'),
  ('90000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid, 'owner'),
  ('80000000-0000-0000-0000-000000000001', current_setting('t.hugh')::uuid, 'owner'),
  ('80000000-0000-0000-0000-000000000001', current_setting('t.jon')::uuid, 'member'),
  ('70000000-0000-0000-0000-000000000001', current_setting('t.ivy')::uuid, 'owner');

insert into public.chores (id, household_id, name, cadence, preferred_dow, every_n_days, effort) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Kitchen', 'weekly', 3, null, 3),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bins', 'weekly', 2, null, 1),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Hallway', 'weekly', 0, null, 1),
  ('c4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Windows', 'weekly', 4, null, 2),
  ('c5000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Laundry', 'weekly', 1, null, 2),
  ('c6000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000001', 'Bins', 'weekly', 2, null, 1),
  ('c7000000-0000-0000-0000-000000000007', '80000000-0000-0000-0000-000000000001', 'Bins', 'weekly', 2, null, 1);
insert into public.chore_checklist_items (chore_id, position, text) values
  ('c4000000-0000-0000-0000-000000000004', 1, 'Inside'),
  ('c4000000-0000-0000-0000-000000000004', 2, 'Outside');

-- Week of next Sunday: Kitchen (Wed) alice, Bins (Tue) bob, Hallway (Sun) carol, Windows (Thu) dave,
-- Laundry (Mon) erin. Frank holds nothing. Flat H has chores but Jon holds none. Flat I has none.
select private.rota_store_week(now(), 'a0000000-0000-0000-0000-000000000001', current_setting('t.w')::date, 'weekly', null,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', current_setting('t.alice'), 'dueOn', (current_setting('t.w')::date + 3)::text, 'explanation', 'x1'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.bob'), 'dueOn', (current_setting('t.w')::date + 2)::text, 'explanation', 'x2'),
    jsonb_build_object('choreId', 'c3000000-0000-0000-0000-000000000003', 'assignee', current_setting('t.carol'), 'dueOn', current_setting('t.w'), 'explanation', 'x3'),
    jsonb_build_object('choreId', 'c4000000-0000-0000-0000-000000000004', 'assignee', current_setting('t.dave'), 'dueOn', (current_setting('t.w')::date + 4)::text, 'explanation', 'x4'),
    jsonb_build_object('choreId', 'c5000000-0000-0000-0000-000000000005', 'assignee', current_setting('t.erin'), 'dueOn', (current_setting('t.w')::date + 1)::text, 'explanation', 'x5')
  ), '[]'::jsonb);
select private.rota_store_week(now(), '90000000-0000-0000-0000-000000000001', current_setting('t.w')::date, 'weekly', null,
  jsonb_build_array(jsonb_build_object('choreId', 'c6000000-0000-0000-0000-000000000006', 'assignee', current_setting('t.gina'), 'dueOn', (current_setting('t.w')::date + 2)::text, 'explanation', 'g1')),
  '[]'::jsonb);
select private.rota_store_week(now(), '80000000-0000-0000-0000-000000000001', current_setting('t.w')::date, 'weekly', null,
  jsonb_build_array(jsonb_build_object('choreId', 'c7000000-0000-0000-0000-000000000007', 'assignee', current_setting('t.hugh'), 'dueOn', (current_setting('t.w')::date + 2)::text, 'explanation', 'h1')),
  '[]'::jsonb);
select set_config('t.kitchen', (select id::text from public.chore_assignments where chore_name = 'Kitchen'), true);
select set_config('t.bins', (select id::text from public.chore_assignments where chore_name = 'Bins' and household_id = 'a0000000-0000-0000-0000-000000000001'), true);
select set_config('t.windows', (select id::text from public.chore_assignments where chore_name = 'Windows'), true);
select set_config('t.laundry', (select id::text from public.chore_assignments where chore_name = 'Laundry'), true);
select set_config('t.hall', (select id::text from public.chore_assignments where chore_name = 'Hallway'), true);
delete from public.notifications;

-- ---------------------------------------------------------------------------------------------
-- Nothing to rebuild: a flat without chores, a leaver with nothing upcoming, a flat closing.
select is((select count(*)::int from public.rota_rebuilds), 0, 'no rebuilds yet');

update public.memberships set left_at = now(), left_reason = 'left'
 where household_id = '70000000-0000-0000-0000-000000000001' and profile_id = current_setting('t.ivy')::uuid;
select is((select count(*)::int from public.rota_rebuilds), 0, 'a flat with no chores is left alone');

update public.memberships set left_at = now(), left_reason = 'left'
 where household_id = '80000000-0000-0000-0000-000000000001' and profile_id = current_setting('t.jon')::uuid;
select is((select count(*)::int from public.rota_rebuilds), 0, 'someone with no upcoming chores leaves without a rebuild');

update public.memberships set left_at = now(), left_reason = 'flat_closed'
 where household_id = '90000000-0000-0000-0000-000000000001' and profile_id = current_setting('t.gina')::uuid;
select is((select count(*)::int from public.rota_rebuilds), 0, 'a flat closing needs no rebuild');

update public.memberships set left_at = now(), left_reason = 'left'
 where household_id = 'a0000000-0000-0000-0000-000000000001' and profile_id = current_setting('t.frank')::uuid;
select is((select count(*)::int from public.rota_rebuilds), 0, 'Frank holds nothing, so his leaving needs no rebuild');

-- ---------------------------------------------------------------------------------------------
-- The three paths. Dave leaves, Erin is removed, Carol's account is deleted.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.leave_household()$$, 'Dave leaves');
reset role;
select results_eq(
  $$select left_profile = current_setting('t.dave')::uuid, left_reason, status from public.rota_rebuilds$$,
  $$values (true, 'left'::text, 'pending'::text)$$, 'leaving records one pending rebuild');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(format($sql$select public.remove_member('%s')$sql$, current_setting('t.erin')), 'Alice removes Erin');
reset role;
select is((select count(*)::int from public.rota_rebuilds where left_profile = current_setting('t.erin')::uuid and left_reason = 'removed' and status = 'pending'),
  1, 'removing someone records one pending rebuild');

select is(public.end_memberships_for_account('00000000-0000-0000-0000-00000000000c'), 'ok', 'Carol''s account is deleted');
select is((select count(*)::int from public.rota_rebuilds where left_profile = current_setting('t.carol')::uuid and left_reason = 'account_deleted' and status = 'pending'),
  1, 'account deletion records one pending rebuild');
select is((select count(*)::int from public.rota_rebuilds), 3, 'exactly one rebuild per leaving');
select is((select count(*)::int from public.rota_pending_rebuilds()), 3, 'the job sees all three');

select set_config('t.rb_dave', (select id::text from public.rota_rebuilds where left_profile = current_setting('t.dave')::uuid), true);
select set_config('t.rb_erin', (select id::text from public.rota_rebuilds where left_profile = current_setting('t.erin')::uuid), true);
select set_config('t.rb_carol', (select id::text from public.rota_rebuilds where left_profile = current_setting('t.carol')::uuid), true);

-- ---------------------------------------------------------------------------------------------
-- The job's input, and the 24-hour lock.
select is(private.rota_rebuild_input(now(), current_setting('t.rb_dave')::uuid) ->> 'leaver', current_setting('t.dave'), 'the input names the leaver');
select is(private.rota_rebuild_input(now(), current_setting('t.rb_dave')::uuid) ->> 'leaverName', 'Dave', 'and their name');
select is((private.rota_rebuild_input(now(), current_setting('t.rb_dave')::uuid) -> 'remaining') @> to_jsonb(array[current_setting('t.alice'), current_setting('t.bob')])
  and not ((private.rota_rebuild_input(now(), current_setting('t.rb_dave')::uuid) -> 'remaining') @> to_jsonb(array[current_setting('t.dave')])),
  true, 'those who stay are listed and the leaver is not');
select is(jsonb_array_length(private.rota_rebuild_input(now(), current_setting('t.rb_dave')::uuid) -> 'tasks'), 5,
  'the upcoming unfinished chores of the flat are listed, including those of people whose rebuilds are still waiting');
select is(
  (select (t ->> 'locked')::boolean from jsonb_array_elements(private.rota_rebuild_input(
      (current_setting('t.w')::date + 1)::timestamp at time zone 'Europe/London' - interval '12 hours',
      current_setting('t.rb_dave')::uuid) -> 'tasks') t where t ->> 'choreName' = 'Laundry'),
  true, 'a chore starting within 24 hours is locked');
select is(
  (select (t ->> 'locked')::boolean from jsonb_array_elements(private.rota_rebuild_input(
      (current_setting('t.w')::date + 1)::timestamp at time zone 'Europe/London' - interval '12 hours',
      current_setting('t.rb_dave')::uuid) -> 'tasks') t where t ->> 'choreName' = 'Windows'),
  false, 'one further off is not');
select is(
  (select (t ->> 'locked')::boolean from jsonb_array_elements(private.rota_rebuild_input(
      (current_setting('t.w')::date + 1)::timestamp at time zone 'Europe/London' - interval '12 hours',
      current_setting('t.rb_dave')::uuid) -> 'tasks') t where t ->> 'choreName' = 'Kitchen'),
  false, 'Kitchen, three days out, is not');
-- Ticking a step starts a chore, which locks it.
update public.assignment_items set done_at = now(), done_by = current_setting('t.alice')::uuid
 where assignment_id = current_setting('t.windows')::uuid and position = 1;
select is(
  (select (t ->> 'started')::boolean and (t ->> 'locked')::boolean
     from jsonb_array_elements(private.rota_rebuild_input(now(), current_setting('t.rb_dave')::uuid) -> 'tasks') t
    where t ->> 'choreName' = 'Windows'),
  true, 'a chore someone has ticked is started and locked');
update public.assignment_items set done_at = null, done_by = null where assignment_id = current_setting('t.windows')::uuid;

-- ---------------------------------------------------------------------------------------------
-- Applying. Dave's Windows goes to Bob; Alice's Kitchen is moved to Bob to even things out.
select throws_ok(
  format($sql$select private.rota_apply_rebuild(now(), '%s', '[{"taskId": "%s", "to": "%s", "reason": "leaver", "explanation": "x"}]'::jsonb)$sql$,
    current_setting('t.rb_dave'), current_setting('t.windows'), current_setting('t.dave')),
  'P0001', 'not_a_member', 'a chore cannot go back to the leaver');
select throws_ok(
  format($sql$select private.rota_apply_rebuild(now(), '%s', '[{"taskId": "%s", "to": "%s", "reason": "leaver", "explanation": "x"}]'::jsonb)$sql$,
    current_setting('t.rb_dave'), current_setting('t.windows'), current_setting('t.frank')),
  'P0001', 'not_a_member', 'nor to someone who has also gone');
select throws_ok(
  format($sql$select private.rota_apply_rebuild(now(), '%s', '[{"taskId": "%s", "to": "%s", "reason": "other", "explanation": "x"}]'::jsonb)$sql$,
    current_setting('t.rb_dave'), current_setting('t.windows'), current_setting('t.bob')),
  '22023', 'invalid_move', 'a made-up reason is refused');
insert into public.availability (household_id, profile_id, on_date, available)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.w')::date + 4, false);
select throws_ok(
  format($sql$select private.rota_apply_rebuild(now(), '%s', '[{"taskId": "%s", "to": "%s", "reason": "leaver", "explanation": "x"}]'::jsonb)$sql$,
    current_setting('t.rb_dave'), current_setting('t.windows'), current_setting('t.bob')),
  'P0001', 'assignee_unavailable', 'a chore does not land on someone who is away that day');
delete from public.availability where profile_id = current_setting('t.bob')::uuid;
select is((select count(*)::int from public.rota_rebuild_moves), 0, 'a refused call changes nothing');

select is(private.rota_apply_rebuild(now(), current_setting('t.rb_dave')::uuid,
  jsonb_build_array(
    jsonb_build_object('taskId', current_setting('t.windows'), 'to', current_setting('t.bob'), 'reason', 'leaver', 'explanation', 'Moved to you because Dave left.'),
    jsonb_build_object('taskId', current_setting('t.kitchen'), 'to', current_setting('t.bob'), 'reason', 'balance', 'explanation', 'Moved to you to even out the work after Dave left.')
  )), 'applied', 'the rebuild is applied');
select results_eq(
  $$select status, applied_at is not null, undo_until - applied_at, unassigned from public.rota_rebuilds where id = current_setting('t.rb_dave')::uuid$$,
  $$values ('applied'::text, true, interval '24 hours', 0)$$, 'it is applied, with an undo point 24 hours out');
select results_eq(
  $$select a.chore_name, a.assignee = current_setting('t.bob')::uuid, a.replaces_id is not null, a.explanation
      from public.chore_assignments a where a.superseded_at is null and a.chore_name in ('Windows', 'Kitchen') order by a.chore_name$$,
  $$values ('Kitchen'::text, true, true, 'Moved to you to even out the work after Dave left.'::text),
           ('Windows'::text, true, true, 'Moved to you because Dave left.'::text)$$,
  'the new assignments carry the reason');
select is((select count(*)::int from public.chore_assignments where chore_name in ('Windows', 'Kitchen') and superseded_at is not null), 2,
  'the old ones are marked replaced, not rewritten');
select is((select count(*)::int from public.assignment_items i join public.chore_assignments a on a.id = i.assignment_id
            where a.chore_name = 'Windows' and a.superseded_at is null), 2, 'the checklist came along');
select is((select count(*)::int from public.rota_rebuild_moves where rebuild_id = current_setting('t.rb_dave')::uuid), 2, 'both moves are recorded');
select is(private.rota_apply_rebuild(now(), current_setting('t.rb_dave')::uuid, '[]'::jsonb), 'applied', 'applying again does nothing');
select is((select count(*)::int from public.rota_rebuild_moves), 2, 'and adds no moves');
select throws_ok($$update public.rota_rebuild_moves set reason = 'leaver'$$, '42501', null, 'recorded moves cannot be edited');

select results_eq(
  $$select p.display_name, n.type from public.notifications n join public.profiles p on p.id = n.recipient_id where n.type = 'rota_rebuilt' order by p.display_name$$,
  $$values ('Alice'::text, 'rota_rebuilt'::text), ('Bob'::text, 'rota_rebuilt'::text)$$,
  'the new holder and each admin are told once, and nobody else (not the leaver)');
select is((select count(*)::int from public.notifications where type = 'rota_rebuilt' and recipient_id = current_setting('t.bob')::uuid and body like 'You now have%'), 1,
  'the new holder is told what they got');

-- ---------------------------------------------------------------------------------------------
-- Undo.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$select public.undo_rota_rebuild('%s')$sql$, current_setting('t.rb_dave')), '42501', 'not_allowed', 'someone who is not an admin cannot undo');
reset role;

select throws_ok(format($sql$select private.rota_undo_rebuild(now() + interval '25 hours', 'a0000000-0000-0000-0000-000000000001', '%s', '%s')$sql$, current_setting('t.bob'), current_setting('t.rb_dave')),
  'P0001', 'undo_expired', 'after 24 hours it can no longer be undone');
select throws_ok(format($sql$select private.rota_undo_rebuild(now(), '90000000-0000-0000-0000-000000000001', '%s', '%s')$sql$, current_setting('t.gina'), current_setting('t.rb_dave')),
  'P0002', 'not_found', 'another flat''s admin cannot reach it');
select throws_ok(format($sql$select private.rota_undo_rebuild(now(), 'a0000000-0000-0000-0000-000000000001', '%s', '%s')$sql$, current_setting('t.bob'), current_setting('t.rb_erin')),
  'P0001', 'nothing_to_undo', 'a rebuild that has not been applied cannot be undone');

delete from public.notifications;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select is(public.undo_rota_rebuild(current_setting('t.rb_dave')::uuid), '{"kept": 1, "status": "undone", "restored": 1}'::jsonb,
  'an admin undoes it: Kitchen goes back, Windows stays because Dave is no longer there');
select is(public.undo_rota_rebuild(current_setting('t.rb_dave')::uuid), '{"kept": 0, "status": "undone", "restored": 0}'::jsonb, 'undoing twice does nothing more');
reset role;
select results_eq(
  $$select a.chore_name, a.assignee from public.chore_assignments a where a.superseded_at is null and a.chore_name in ('Windows', 'Kitchen') order by a.chore_name$$,
  format($sql$values ('Kitchen'::text, '%s'::uuid), ('Windows'::text, '%s'::uuid)$sql$, current_setting('t.alice'), current_setting('t.bob')),
  'Kitchen is back with Alice and Windows stays with Bob');
select results_eq(
  $$select status, undone_by = current_setting('t.bob')::uuid from public.rota_rebuilds where id = current_setting('t.rb_dave')::uuid$$,
  $$values ('undone'::text, true)$$, 'the undo is recorded with the admin''s name');
select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id order by p.display_name$$,
  $$values ('Alice'::text)$$, 'the people affected are told, except the admin who did it');

-- ---------------------------------------------------------------------------------------------
-- Erin (removed) and Carol (account deleted) go through the same function. Nobody is left to take
-- Laundry on a day when everyone staying is away: it stays unassigned and admins are told.
insert into public.availability (household_id, profile_id, on_date, available)
select 'a0000000-0000-0000-0000-000000000001', p::uuid, current_setting('t.w')::date + 1, false
  from unnest(array[current_setting('t.alice'), current_setting('t.bob')]) p;
delete from public.notifications;
select is(private.rota_apply_rebuild(now(), current_setting('t.rb_erin')::uuid,
  jsonb_build_array(jsonb_build_object('taskId', current_setting('t.laundry'), 'to', null, 'reason', 'leaver', 'explanation', 'Nobody is around for this one.'))),
  'applied', 'Erin''s rebuild is applied');
select results_eq(
  $$select assignee is null, replaces_id is not null from public.chore_assignments where chore_name = 'Laundry' and superseded_at is null$$,
  $$values (true, true)$$, 'Laundry is unassigned rather than lost');
select is((select unassigned from public.rota_rebuilds where id = current_setting('t.rb_erin')::uuid), 1, 'the count is kept');
select is((select count(*)::int from public.notifications where type = 'chore_unassigned'), 2, 'both admins are told nobody is around');

select is(private.rota_apply_rebuild(now(), current_setting('t.rb_carol')::uuid,
  jsonb_build_array(jsonb_build_object('taskId', current_setting('t.hall'), 'to', current_setting('t.alice'), 'reason', 'leaver', 'explanation', 'Moved to you because Carol left.'))),
  'applied', 'Carol''s rebuild is applied');
select is((select assignee from public.chore_assignments where chore_name = 'Hallway' and superseded_at is null), current_setting('t.alice')::uuid,
  'her Hallway chore has a new holder');

-- Nothing to move any more: the rebuild closes without noise.
select is(private.rota_apply_rebuild(now(), current_setting('t.rb_carol')::uuid, '[]'::jsonb), 'applied', 'an applied rebuild stays applied');
select is((select count(*)::int from public.rota_pending_rebuilds()), 0, 'nothing is pending any more');

-- A rebuild that finds nothing left to move closes as such.
insert into public.rota_rebuilds (household_id, left_profile, left_reason)
values ('80000000-0000-0000-0000-000000000001', current_setting('t.jon')::uuid, 'left');
select is(private.rota_apply_rebuild(now(), (select id from public.rota_rebuilds where left_profile = current_setting('t.jon')::uuid), '[]'::jsonb),
  'nothing', 'a rebuild with no moves closes as nothing');

select * from finish();
rollback;
