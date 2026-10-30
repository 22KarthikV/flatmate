begin;
select plan(50);

-- Rota chores and checklists (SPEC-rota T4, T8, assumptions 2, 3 and 6). Chores are templates that
-- only admins edit, readable by the flat and writable only through functions.

select has_table('public', 'chores', 'chores exists');
select has_table('public', 'chore_checklist_items', 'chore_checklist_items exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.chores'::regclass, 'public.chore_checklist_items'::regclass)),
  'row-level security is enabled on both tables'
);
select ok(
  not exists (
    select 1 from unnest(array['public.chores', 'public.chore_checklist_items']) t(name)
     cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
     where has_table_privilege('anon', t.name, p.priv)
  ),
  'anon has no privileges on the chore tables'
);
select ok(
  not exists (
    select 1 from unnest(array['public.chores', 'public.chore_checklist_items']) t(name)
     cross join unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
     where has_table_privilege('authenticated', t.name, p.priv)
  )
  and has_table_privilege('authenticated', 'public.chores', 'select')
  and has_table_privilege('authenticated', 'public.chore_checklist_items', 'select'),
  'the browser role can only read the chore tables'
);
select ok(
  not has_function_privilege('anon', 'public.save_chore(uuid, text, text, integer, integer, integer, boolean, text[])', 'execute')
  and not has_function_privilege('anon', 'public.archive_chore(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.load_default_chores()', 'execute')
  and has_function_privilege('authenticated', 'public.save_chore(uuid, text, text, integer, integer, integer, boolean, text[])', 'execute')
  and has_function_privilege('authenticated', 'public.archive_chore(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.load_default_chores()', 'execute'),
  'signed-in people can call the chore functions; anon cannot'
);

-- People. alice (owner), bob (admin), carol (member) share Flat A; dave is alone in Flat D.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');

-- ---------------------------------------------------------------------------------------------
-- A member cannot edit chores; an admin can.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.save_chore(null, 'Windows', 'weekly', 2, null, 3, false, array['Wipe']) $sql$,
  '42501', 'not_allowed', 'a plain member cannot add a chore');
select throws_ok($sql$ select public.load_default_chores() $sql$,
  '42501', 'not_allowed', 'a plain member cannot load the default chores');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.windows', public.save_chore(null, '  Windows  ', 'weekly', 2, null, 3, false,
  array['  Wipe the glass ', 'Dry the sills'])::text, true);
reset role;

select results_eq(
  $$select name, cadence, preferred_dow::int, every_n_days::int, effort::int, needs_signoff, household_id, archived_at is null
      from public.chores where id = current_setting('t.windows')::uuid$$,
  $$values ('Windows'::text, 'weekly'::text, 2, null::int, 3, false, 'a0000000-0000-0000-0000-000000000001'::uuid, true)$$,
  'an admin stores a trimmed chore in their own flat'
);
select results_eq(
  $$select position::int, text from public.chore_checklist_items
     where chore_id = current_setting('t.windows')::uuid order by position$$,
  $$values (1, 'Wipe the glass'::text), (2, 'Dry the sills'::text)$$,
  'its checklist is stored in order, trimmed'
);

-- Editing replaces the checklist.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.save_chore(current_setting('t.windows')::uuid, 'Windows', 'every_n_days', null, 10, 5, true,
  array['Spray', 'Wipe', 'Dry']);
reset role;
select results_eq(
  $$select cadence, preferred_dow::int, every_n_days::int, effort::int, needs_signoff from public.chores
     where id = current_setting('t.windows')::uuid$$,
  $$values ('every_n_days'::text, null::int, 10, 5, true)$$,
  'the owner edits it, changing cadence and effort'
);
select is(
  (select count(*)::int from public.chore_checklist_items where chore_id = current_setting('t.windows')::uuid),
  3, 'the checklist is replaced, not added to'
);

-- Refusals. Everything is checked again in the database.
set local role authenticated;
select throws_ok($sql$ select public.save_chore(null, '   ', 'weekly', 1, null, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'a blank name is refused');
select throws_ok($sql$ select public.save_chore(null, repeat('x', 41), 'weekly', 1, null, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'a name over 40 characters is refused');
select throws_ok($sql$ select public.save_chore(null, 'X', 'monthly', 1, null, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'an unknown cadence is refused');
select throws_ok($sql$ select public.save_chore(null, 'X', 'weekly', null, null, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'a weekly chore needs a preferred day');
select throws_ok($sql$ select public.save_chore(null, 'X', 'weekly', 7, null, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'a preferred day above 6 is refused');
select throws_ok($sql$ select public.save_chore(null, 'X', 'weekly', 1, 2, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'a weekly chore cannot also say every N days');
select throws_ok($sql$ select public.save_chore(null, 'X', 'every_n_days', null, null, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'an every-N-days chore needs N');
select throws_ok($sql$ select public.save_chore(null, 'X', 'every_n_days', null, 15, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'N above 14 is refused');
select throws_ok($sql$ select public.save_chore(null, 'X', 'every_n_days', 1, 2, 3, false, '{}') $sql$,
  '22023', 'invalid_chore', 'an every-N-days chore has no preferred day');
select throws_ok($sql$ select public.save_chore(null, 'X', 'weekly', 1, null, 0, false, '{}') $sql$,
  '22023', 'invalid_effort', 'an effort of 0 is refused');
select throws_ok($sql$ select public.save_chore(null, 'X', 'weekly', 1, null, 6, false, '{}') $sql$,
  '22023', 'invalid_effort', 'an effort of 6 is refused');
select throws_ok($sql$ select public.save_chore(null, 'X', 'weekly', 1, null, 3, false, array(select 'step ' || g from generate_series(1, 21) g)) $sql$,
  '22023', 'invalid_checklist', 'more than 20 checklist steps are refused');
select throws_ok($sql$ select public.save_chore(null, 'X', 'weekly', 1, null, 3, false, array[repeat('y', 81)]) $sql$,
  '22023', 'invalid_checklist', 'a step over 80 characters is refused');
select throws_ok($sql$ select public.save_chore(null, 'X', 'weekly', 1, null, 3, false, array['ok', '  ']) $sql$,
  '22023', 'invalid_checklist', 'a blank step is refused');
select throws_ok($sql$ select public.save_chore(null, 'windows', 'weekly', 1, null, 3, false, '{}') $sql$,
  '23505', 'duplicate_name', 'two active chores cannot share a name, whatever the case');
select throws_ok($sql$ select public.save_chore('99999999-0000-0000-0000-000000000001', 'X', 'weekly', 1, null, 3, false, '{}') $sql$,
  'P0002', 'chore_not_found', 'an unknown chore cannot be edited');
reset role;

-- A chore in another flat is invisible: editing it by id says not found.
insert into public.chores (id, household_id, name, cadence, preferred_dow, effort)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Dave''s job', 'weekly', 1, 2);
set local role authenticated;
select throws_ok($sql$ select public.save_chore('d1000000-0000-0000-0000-000000000001', 'Hacked', 'weekly', 1, null, 3, false, '{}') $sql$,
  'P0002', 'chore_not_found', 'an admin cannot edit another flat''s chore');
select throws_ok($sql$ select public.archive_chore('d1000000-0000-0000-0000-000000000001') $sql$,
  'P0002', 'chore_not_found', 'an admin cannot archive another flat''s chore');
reset role;

-- Archiving keeps the row, frees the name, and is admin only.
set local role authenticated;
select public.archive_chore(current_setting('t.windows')::uuid);
reset role;
select ok(
  (select archived_at is not null from public.chores where id = current_setting('t.windows')::uuid),
  'archiving keeps the chore and marks it'
);
set local role authenticated;
select lives_ok($sql$ select public.save_chore(null, 'Windows', 'weekly', 2, null, 3, false, '{}') $sql$,
  'an archived chore''s name can be used again');
select throws_ok($sql$ select public.save_chore(current_setting('t.windows')::uuid, 'Windows', 'weekly', 2, null, 3, false, '{}') $sql$,
  'P0001', 'chore_archived', 'an archived chore cannot be edited');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.archive_chore(current_setting('t.windows')::uuid) $sql$,
  '42501', 'not_allowed', 'a plain member cannot archive');
reset role;

-- At most 12 active chores. The new Windows is one; add 11 more.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.save_chore(null, 'Filler ' || g, 'weekly', 3, null, 1, false, '{}') from generate_series(1, 11) g;
select throws_ok($sql$ select public.save_chore(null, 'One too many', 'weekly', 3, null, 1, false, '{}') $sql$,
  'P0001', 'too_many_chores', 'a flat can have at most 12 active chores');
select throws_ok($sql$ select public.load_default_chores() $sql$,
  'P0001', 'chores_exist', 'the defaults only load into a flat with no chores');
reset role;

-- ---------------------------------------------------------------------------------------------
-- The first flat's defaults, in one tap, into an empty flat (Flat D has one chore; archive it).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select public.archive_chore('d1000000-0000-0000-0000-000000000001');
select is(public.load_default_chores(), 5, 'loading the defaults adds five chores');
select throws_ok($sql$ select public.load_default_chores() $sql$,
  'P0001', 'chores_exist', 'loading them twice is refused');
reset role;
select results_eq(
  $$select name, cadence, effort::int from public.chores
     where household_id = 'd0000000-0000-0000-0000-000000000001' and archived_at is null order by name$$,
  $$values ('Bathroom'::text, 'weekly'::text, 2), ('Bins', 'every_n_days', 1), ('Hallway', 'weekly', 1),
           ('Kitchen', 'weekly', 3), ('Living room', 'weekly', 4)$$,
  'the defaults are Bins 1, Kitchen 3, Living room 4, Bathroom 2 and Hallway 1, each its own chore'
);
select is(
  (select every_n_days::int from public.chores
    where household_id = 'd0000000-0000-0000-0000-000000000001' and name = 'Bins'),
  2, 'bins come round every 2 days'
);
select ok(
  not exists (
    select 1 from public.chores c
     where c.household_id = 'd0000000-0000-0000-0000-000000000001' and c.archived_at is null
       and not exists (select 1 from public.chore_checklist_items i where i.chore_id = c.id)
  ),
  'every default chore has a checklist'
);

-- ---------------------------------------------------------------------------------------------
-- Isolation and direct writes.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.chores where household_id = 'a0000000-0000-0000-0000-000000000001'),
  13, 'a plain member reads their flat''s chores');
select is((select count(*)::int from public.chores where household_id = 'd0000000-0000-0000-0000-000000000001'),
  0, 'and none of another flat''s');
select ok((select count(*) from public.chore_checklist_items) > 0
  and not exists (select 1 from public.chore_checklist_items i join public.chores c on c.id = i.chore_id
                   where c.household_id <> 'a0000000-0000-0000-0000-000000000001'),
  'checklist items are readable only for their own flat');
select throws_ok($sql$ insert into public.chores (household_id, name, cadence, preferred_dow)
  values ('a0000000-0000-0000-0000-000000000001', 'Direct', 'weekly', 1) $sql$,
  '42501', null, 'the browser role cannot insert a chore directly');
select throws_ok($sql$ update public.chores set effort = 5 $sql$, '42501', null, 'nor update one');
select throws_ok($sql$ delete from public.chore_checklist_items $sql$, '42501', null, 'nor delete checklist steps');
reset role;

set local role anon;
select throws_ok($sql$ select count(*) from public.chores $sql$, '42501', null, 'anon cannot read chores');
reset role;

-- Table-level integrity that does not depend on who writes.
select throws_ok($sql$ insert into public.chores (household_id, name, cadence, preferred_dow)
  values ('a0000000-0000-0000-0000-000000000001', 'Bad', 'weekly', null) $sql$,
  '23514', null, 'the table itself refuses a weekly chore with no day');
select throws_ok($sql$ insert into public.chore_checklist_items (chore_id, position, text)
  select id, 1, 'dup' from public.chores where name = 'Kitchen' and household_id = 'd0000000-0000-0000-0000-000000000001'
  union all select id, 1, 'dup2' from public.chores where name = 'Kitchen' and household_id = 'd0000000-0000-0000-0000-000000000001' $sql$,
  '23505', null, 'two steps cannot share a position');

select * from finish();
rollback;
