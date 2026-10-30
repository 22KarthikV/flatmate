begin;
select plan(48);

-- Rota swaps and admin reassignment (SPEC-rota T12). A swap only changes anything once the other
-- person accepts, and never lands a chore on a day they said they are away. Nothing is rewritten:
-- the old assignment is marked replaced and a new row takes its place. An admin can move a chore
-- directly, with their name on the record.

select has_table('public', 'swap_requests', 'swap_requests exists');
select ok((select relrowsecurity from pg_class where oid = 'public.swap_requests'::regclass), 'row-level security is on');
select ok(
  not exists (select 1 from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
               where has_table_privilege('anon', 'public.swap_requests', p.priv))
  and not exists (select 1 from unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
                   where has_table_privilege('authenticated', 'public.swap_requests', p.priv))
  and has_table_privilege('authenticated', 'public.swap_requests', 'select'),
  'anon has nothing and the browser role can only read');
select ok(
  has_function_privilege('authenticated', 'public.request_swap(uuid, uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.decide_swap(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.cancel_swap(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.reassign_assignment(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.request_swap(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.reassign_assignment(uuid, uuid)', 'execute'),
  'signed-in people can call the swap functions; anon cannot');
select is((select count(*)::int from public.notification_types
            where (type, default_in_app, default_push, snoozable) in (('swap_requested', true, true, false), ('swap_decided', true, false, false))
              and (push_title is not null) = default_push),
  2, 'the swap notification types exist, with fixed push text only where they push');

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
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bins', 'weekly', 2, null, 1),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Hallway', 'weekly', 0, null, 1),
  ('c4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Windows', 'weekly', 4, null, 2);
insert into public.chore_checklist_items (chore_id, position, text) values
  ('c1000000-0000-0000-0000-000000000001', 1, 'Wipe'),
  ('c1000000-0000-0000-0000-000000000001', 2, 'Sweep');
-- Dave is away on Wednesday 11 Nov.
insert into public.availability (household_id, profile_id, on_date, available)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, '2026-11-11', false);

-- Week of 8 Nov: Kitchen (Wed) alice, Bins (Tue) bob, Hallway (Sun) dave, Windows (Thu) carol.
select private.rota_store_week('2026-11-03 12:00:00+00', 'a0000000-0000-0000-0000-000000000001', '2026-11-08', 'weekly', null,
  jsonb_build_array(
    jsonb_build_object('choreId', 'c1000000-0000-0000-0000-000000000001', 'assignee', current_setting('t.alice'), 'dueOn', '2026-11-11', 'explanation', 'x1'),
    jsonb_build_object('choreId', 'c2000000-0000-0000-0000-000000000002', 'assignee', current_setting('t.bob'), 'dueOn', '2026-11-10', 'explanation', 'x2'),
    jsonb_build_object('choreId', 'c3000000-0000-0000-0000-000000000003', 'assignee', current_setting('t.dave'), 'dueOn', '2026-11-08', 'explanation', 'x3'),
    jsonb_build_object('choreId', 'c4000000-0000-0000-0000-000000000004', 'assignee', current_setting('t.carol'), 'dueOn', '2026-11-12', 'explanation', 'x4')
  ), '[]'::jsonb);
select set_config('t.kitchen', (select id::text from public.chore_assignments where chore_name = 'Kitchen'), true);
select set_config('t.bins', (select id::text from public.chore_assignments where chore_name = 'Bins'), true);
select set_config('t.hall', (select id::text from public.chore_assignments where chore_name = 'Hallway'), true);
select set_config('t.windows', (select id::text from public.chore_assignments where chore_name = 'Windows'), true);
delete from public.notifications;

-- ---------------------------------------------------------------------------------------------
-- Asking. Alice owns Kitchen.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.request_swap('%s', '%s', null) $sql$, current_setting('t.kitchen'), current_setting('t.dave')),
  '42501', 'not_allowed', 'only the person who has the chore can ask to swap it');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.request_swap('%s', '%s', null) $sql$, current_setting('t.kitchen'), current_setting('t.dave')),
  'P0001', 'assignee_unavailable', 'a chore cannot be offered to someone who is away that day');
select throws_ok(format($sql$ select public.request_swap('%s', '%s', null) $sql$, current_setting('t.kitchen'), current_setting('t.alice')),
  '22023', 'invalid_recipient', 'you cannot swap with yourself');
select throws_ok(format($sql$ select public.request_swap('%s', '%s', null) $sql$, current_setting('t.kitchen'), current_setting('t.frank')),
  'P0001', 'not_a_member', 'nor with someone who has left');
select throws_ok(format($sql$ select public.request_swap('%s', '%s', null) $sql$, current_setting('t.kitchen'), current_setting('t.gina')),
  'P0001', 'not_a_member', 'nor with someone in another flat');
select throws_ok(format($sql$ select public.request_swap('%s', '%s', '%s') $sql$, current_setting('t.kitchen'), current_setting('t.carol'), current_setting('t.hall')),
  'P0001', 'invalid_exchange', 'the chore offered in return must be the other person''s own');
select set_config('t.swap1', public.request_swap(current_setting('t.kitchen')::uuid, current_setting('t.carol')::uuid, null)::text, true);
reset role;

select results_eq(
  $$select status, from_profile = current_setting('t.alice')::uuid, to_profile = current_setting('t.carol')::uuid, in_return_id is null, decided_at is null
      from public.swap_requests where id = current_setting('t.swap1')::uuid$$,
  $$values ('pending'::text, true, true, true, true)$$, 'a request is pending until the other person decides');
select results_eq(
  $$select type, p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id$$,
  $$values ('swap_requested'::text, 'Carol'::text)$$, 'the other person is told, and only them');
select ok((select assignee = current_setting('t.alice')::uuid and superseded_at is null from public.chore_assignments where id = current_setting('t.kitchen')::uuid),
  'nothing has changed yet');

set local role authenticated;
select throws_ok(format($sql$ select public.request_swap('%s', '%s', null) $sql$, current_setting('t.kitchen'), current_setting('t.bob')),
  'P0001', 'swap_pending', 'a chore can have only one open request');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Deciding. Only the person asked.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.decide_swap('%s', true) $sql$, current_setting('t.swap1')), '42501', 'not_allowed', 'a bystander (even an admin) cannot decide');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.decide_swap('%s', true) $sql$, current_setting('t.swap1')), '42501', 'not_allowed', 'nor can the person who asked');
reset role;

delete from public.notifications;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is(public.decide_swap(current_setting('t.swap1')::uuid, false), 'declined', 'declining says declined');
select throws_ok(format($sql$ select public.decide_swap('%s', true) $sql$, current_setting('t.swap1')), 'P0001', 'swap_not_pending', 'a decided request cannot be decided again');
reset role;
select ok((select assignee = current_setting('t.alice')::uuid and superseded_at is null from public.chore_assignments where id = current_setting('t.kitchen')::uuid),
  'a declined swap changes nothing');
select results_eq(
  $$select type, p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id$$,
  $$values ('swap_decided'::text, 'Alice'::text)$$, 'the person who asked is told');

-- Accepting. Alice asks again; Carol accepts.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.swap2', public.request_swap(current_setting('t.kitchen')::uuid, current_setting('t.carol')::uuid, null)::text, true);
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is(public.decide_swap(current_setting('t.swap2')::uuid, true), 'accepted', 'accepting says accepted');
reset role;

select results_eq(
  $$select assignee = current_setting('t.alice')::uuid, superseded_at is not null from public.chore_assignments where id = current_setting('t.kitchen')::uuid$$,
  $$values (true, true)$$, 'the old assignment is kept, marked replaced');
select results_eq(
  $$select assignee = current_setting('t.carol')::uuid, due_on, chore_name, effort::int, replaces_id = current_setting('t.kitchen')::uuid,
          changed_by = current_setting('t.carol')::uuid, superseded_at is null, explanation like '%Alice%'
     from public.chore_assignments where replaces_id = current_setting('t.kitchen')::uuid$$,
  $$values (true, '2026-11-11'::date, 'Kitchen'::text, 3, true, true, true, true)$$,
  'a new assignment takes its place: same day and chore, Carol''s, pointing back, with the reason');
select is((select count(*)::int from public.assignment_items i join public.chore_assignments a on a.id = i.assignment_id where a.replaces_id = current_setting('t.kitchen')::uuid),
  2, 'its checklist comes with it');
select ok((select status = 'accepted' and decided_at is not null from public.swap_requests where id = current_setting('t.swap2')::uuid), 'the request is recorded as accepted');
select ok(exists (select 1 from public.notifications n where n.type = 'swap_decided' and n.recipient_id = current_setting('t.alice')::uuid and n.title like '%accepted%'),
  'Alice is told it was accepted');
select is((select last_done_on from public.rotation_state where profile_id = current_setting('t.carol')::uuid and chore_id = 'c1000000-0000-0000-0000-000000000001'),
  '2026-11-11'::date, 'rotation state follows the chore');

-- The replaced assignment can no longer be ticked; the new one can, by its new owner.
select set_config('t.kitchen2', (select id::text from public.chore_assignments where replaces_id = current_setting('t.kitchen')::uuid), true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.tick_item((select id from public.assignment_items where assignment_id = '%s' limit 1)) $sql$, current_setting('t.kitchen')),
  'P0001', 'assignment_superseded', 'the old owner cannot tick the replaced assignment');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(format($sql$ select public.tick_item((select id from public.assignment_items where assignment_id = '%s' limit 1)) $sql$, current_setting('t.kitchen2')),
  'the new owner can tick the new one');
reset role;

-- ---------------------------------------------------------------------------------------------
-- An exchange: Bob gives Carol Bins (Tue) and takes her Kitchen (Wed).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.swap3', public.request_swap(current_setting('t.bins')::uuid, current_setting('t.carol')::uuid, current_setting('t.kitchen2')::uuid)::text, true);
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is(public.decide_swap(current_setting('t.swap3')::uuid, true), 'accepted', 'an exchange is accepted as one');
reset role;
select results_eq(
  $$select chore_name, a.assignee = current_setting('t.bob')::uuid from public.chore_assignments a where a.superseded_at is null and a.chore_name in ('Kitchen', 'Bins') order by 1$$,
  $$values ('Bins'::text, false), ('Kitchen', true)$$,
  'afterwards Bob has Kitchen and Carol has Bins');
select is((select count(*)::int from public.chore_assignments where superseded_at is not null), 3, 'three assignments are now marked replaced, none deleted');

-- A completed chore cannot be swapped; a chore can be withdrawn by whoever asked.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select public.complete_assignment(current_setting('t.hall')::uuid);
select throws_ok(format($sql$ select public.request_swap('%s', '%s', null) $sql$, current_setting('t.hall'), current_setting('t.carol')),
  'P0001', 'already_completed', 'a finished chore cannot be swapped');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.swap4', public.request_swap(current_setting('t.windows')::uuid, current_setting('t.dave')::uuid, null)::text, true);
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.cancel_swap('%s') $sql$, current_setting('t.swap4')), '42501', 'not_allowed', 'only the person who asked can withdraw it');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.cancel_swap(current_setting('t.swap4')::uuid);
reset role;
select is((select status from public.swap_requests where id = current_setting('t.swap4')::uuid), 'cancelled', 'the request is withdrawn');

-- ---------------------------------------------------------------------------------------------
-- Admin reassign: direct, with their name on it, and allowed on a day the person is away.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.reassign_assignment('%s', '%s') $sql$, current_setting('t.windows'), current_setting('t.dave')),
  '42501', 'not_allowed', 'a plain member cannot move a chore directly');
reset role;

-- A swap is pending on Windows when the admin moves it; the swap then lapses instead of misfiring.
set local role authenticated;
select set_config('t.swap5', public.request_swap(current_setting('t.windows')::uuid, current_setting('t.dave')::uuid, null)::text, true);
reset role;
delete from public.notifications;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($sql$ select public.reassign_assignment('%s', '%s') $sql$, current_setting('t.windows'), current_setting('t.windows')),
  'P0001', 'not_a_member', 'the new person must be an active member');
select throws_ok(format($sql$ select public.reassign_assignment('%s', '%s') $sql$, current_setting('t.windows'), current_setting('t.carol')),
  '22023', 'invalid_recipient', 'moving it to its current owner is refused');
select set_config('t.windows2', public.reassign_assignment(current_setting('t.windows')::uuid, current_setting('t.alice')::uuid)::text, true);
reset role;
select results_eq(
  $$select assignee = current_setting('t.alice')::uuid, changed_by = current_setting('t.bob')::uuid, replaces_id = current_setting('t.windows')::uuid, explanation like '%Bob%'
      from public.chore_assignments where id = current_setting('t.windows2')::uuid$$,
  $$values (true, true, true, true)$$, 'the admin''s move is a new assignment with their name on it');
select ok((select superseded_at is not null from public.chore_assignments where id = current_setting('t.windows')::uuid), 'and the old one is kept, replaced');
select results_eq(
  $$select type, p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id order by 2, 1$$,
  $$values ('chore_assigned'::text, 'Alice'::text), ('swap_decided', 'Carol')$$,
  'the new owner hears they were given it, the old owner that it was moved');
select is((select status from public.swap_requests where id = current_setting('t.swap5')::uuid), 'cancelled', 'the swap that was pending on it is cancelled');

-- Away is overridable by an admin (Dave is away Wednesday): move Kitchen to Dave.
set local role authenticated;
select lives_ok(format($sql$ select public.reassign_assignment((select id from public.chore_assignments where chore_name = 'Kitchen' and superseded_at is null), '%s') $sql$, current_setting('t.dave')),
  'an admin can give a chore to someone who is away that day');
select throws_ok(format($sql$ select public.reassign_assignment('%s', '%s') $sql$, current_setting('t.windows'), current_setting('t.carol')),
  'P0001', 'assignment_superseded', 'a replaced assignment cannot be moved again');
reset role;

-- Another flat sees none of it.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000011", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.swap_requests), 0, 'another flat sees no swaps');
select throws_ok(format($sql$ select public.reassign_assignment('%s', '%s') $sql$, current_setting('t.windows2'), current_setting('t.gina')),
  'P0002', 'assignment_not_found', 'nor can it move our chores');
select throws_ok($sql$ insert into public.swap_requests (household_id, assignment_id, from_profile, to_profile)
  select household_id, id, assignee, assignee from public.chore_assignments limit 1 $sql$, '42501', null, 'the browser role cannot write swaps directly');
reset role;

select * from finish();
rollback;
