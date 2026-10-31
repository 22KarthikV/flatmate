begin;
select plan(30);

-- Extras A: the shopping list (SPEC-extras A). One shared list per flat, written only by functions.

select has_table('public', 'shopping_items', 'shopping_items exists');
select ok((select relrowsecurity from pg_class where oid = 'public.shopping_items'::regclass),
  'row-level security is enabled');
select ok(
  not exists (select 1 from unnest(array['select','insert','update','delete','truncate']) p(priv)
               where has_table_privilege('anon', 'public.shopping_items', p.priv)),
  'anon has no privileges on the list');
select ok(
  not exists (select 1 from unnest(array['insert','update','delete','truncate']) p(priv)
               where has_table_privilege('authenticated', 'public.shopping_items', p.priv))
  and has_table_privilege('authenticated', 'public.shopping_items', 'select'),
  'the browser role can only read the list');
select ok(
  not has_function_privilege('anon', 'public.add_shopping_item(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.set_shopping_bought(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.remove_shopping_item(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.clear_bought_items()', 'execute')
  and has_function_privilege('authenticated', 'public.add_shopping_item(text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.set_shopping_bought(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.remove_shopping_item(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.clear_bought_items()', 'execute'),
  'signed-in people can call the list functions; anon cannot');

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
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');

-- Bob adds items.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.milk', public.add_shopping_item('  Milk ', '  semi-skimmed ')::text, true);
select set_config('t.milk2', public.add_shopping_item('MILK', null)::text, true);
select set_config('t.bread', public.add_shopping_item('Bread', null)::text, true);
select throws_ok($$ select public.add_shopping_item('   ', null) $$, '22023', 'invalid_name', 'an empty name is refused');
select throws_ok($$ select public.add_shopping_item(repeat('x', 61), null) $$, '22023', 'invalid_name', 'a 61 character name is refused');
select throws_ok($$ select public.add_shopping_item('Eggs', repeat('x', 41)) $$, '22023', 'invalid_note', 'a 41 character note is refused');
reset role;

select results_eq(
  $$select name, note, added_by, household_id from public.shopping_items where id = current_setting('t.milk')::uuid$$,
  $$select 'Milk'::text, 'semi-skimmed'::text, current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid$$,
  'name and note are trimmed and the item belongs to the caller''s flat');
select is(current_setting('t.milk2'), current_setting('t.milk'), 'a repeat name (any case) returns the existing item');
select is((select count(*)::int from public.shopping_items), 2, 'and no second row is added');

-- Cross-flat: Dave sees nothing and cannot touch Flat A's items.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.shopping_items), 0, 'another flat sees none of the list');
select throws_ok(format($$ select public.set_shopping_bought(%L, true) $$, current_setting('t.milk')),
  'P0001', 'item_not_found', 'ticking another flat''s item is "not found"');
select throws_ok(format($$ select public.remove_shopping_item(%L) $$, current_setting('t.milk')),
  'P0001', 'item_not_found', 'removing another flat''s item is "not found"');
select is(public.clear_bought_items(), 0, 'clearing in another flat touches nothing');
reset role;

-- Ticking.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.set_shopping_bought(current_setting('t.milk')::uuid, true);
reset role;
select results_eq(
  $$select bought_by, bought_at is not null from public.shopping_items where id = current_setting('t.milk')::uuid$$,
  $$select current_setting('t.carol')::uuid, true$$, 'any member can tick an item, and it records who');
set local role authenticated;
select public.set_shopping_bought(current_setting('t.milk')::uuid, false);
reset role;
select is((select bought_at from public.shopping_items where id = current_setting('t.milk')::uuid), null,
  'and un-tick it');

-- Removing: adder or admin, not another member.
set local role authenticated;
select throws_ok(format($$ select public.remove_shopping_item(%L) $$, current_setting('t.bread')),
  '42501', 'not_allowed', 'another member cannot remove someone else''s item');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.remove_shopping_item(current_setting('t.bread')::uuid);
reset role;
select is((select count(*)::int from public.shopping_items where id = current_setting('t.bread')::uuid), 0,
  'an admin can remove any item');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.remove_shopping_item(current_setting('t.milk')::uuid);
reset role;
select is((select count(*)::int from public.shopping_items), 0, 'the adder can remove their own item');

-- The cap: 100 open items.
set local role authenticated;
select public.add_shopping_item('item ' || n) from generate_series(1, 100) n;
select throws_ok($$ select public.add_shopping_item('one too many') $$, 'P0001', 'list_full', 'the 101st open item is refused');
reset role;

-- Clearing only touches the caller's flat.
set local role authenticated;
select public.set_shopping_bought(id, true) from public.shopping_items where name in ('item 1', 'item 2');
reset role;
insert into public.shopping_items (household_id, name, added_by, bought_at, bought_by)
values ('d0000000-0000-0000-0000-000000000001', 'Dave''s tea', current_setting('t.dave')::uuid, now(), current_setting('t.dave')::uuid);
set local role authenticated;
select is(public.clear_bought_items(), 2, 'clear_bought_items clears this flat''s bought items');
reset role;
select is((select cleared_at is null from public.shopping_items where name = 'Dave''s tea'), true,
  'and leaves another flat''s alone');

-- Cleared items make room again.
set local role authenticated;
select lives_ok($$ select public.add_shopping_item('after clearing') $$, 'a cleared item no longer counts toward the cap');
reset role;

-- Account deletion: unbought items go, bought ones stay.
select public.anonymise_profile('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.shopping_items
            where added_by = current_setting('t.bob')::uuid and bought_at is null), 0,
  'deleting an account removes the person''s unbought items');
select is((select count(*)::int from public.shopping_items
            where added_by = current_setting('t.bob')::uuid and bought_at is not null), 2,
  'but items already bought stay');

-- Retention.
insert into public.shopping_items (household_id, name, added_by, bought_at, bought_by, cleared_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'old cleared', current_setting('t.alice')::uuid, now() - interval '200 days', current_setting('t.alice')::uuid, now() - interval '100 days'),
  ('a0000000-0000-0000-0000-000000000001', 'recent cleared', current_setting('t.alice')::uuid, now(), current_setting('t.alice')::uuid, now() - interval '10 days');
insert into public.shopping_items (household_id, name, added_by, bought_at, bought_by)
values ('a0000000-0000-0000-0000-000000000001', 'old bought', current_setting('t.alice')::uuid, now() - interval '100 days', current_setting('t.alice')::uuid);
select private.run_shopping_retention(now());
select private.run_shopping_retention(now());
select is((select count(*)::int from public.shopping_items where name in ('old cleared', 'old bought')), 0,
  'old cleared and old never-cleared bought items are purged');
select is((select count(*)::int from public.shopping_items where name = 'recent cleared'), 1,
  'recent ones are kept');
select is((select count(*)::int from public.job_runs where job_name = 'shopping-retention'), 1,
  'the purge is recorded once however often it runs');
select ok(exists (select 1 from cron.job where jobname = 'shopping-retention' and schedule = '22 3 * * *'),
  'the purge is scheduled at 03:22 UTC');

select * from finish();
rollback;
