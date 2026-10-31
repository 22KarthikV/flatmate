begin;
select plan(18);

-- Extras A: turning bought items into an expense (SPEC-extras A, X4).

select ok(
  not has_function_privilege('anon', 'public.shopping_to_expense(uuid[], bigint, text, text, date, uuid, uuid[], bigint[])', 'execute')
  and has_function_privilege('authenticated', 'public.shopping_to_expense(uuid[], bigint, text, text, date, uuid, uuid[], bigint[])', 'execute'),
  'signed-in people can call shopping_to_expense; anon cannot');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');

insert into public.shopping_items (id, household_id, name, added_by, bought_at, bought_by) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Milk', current_setting('t.alice')::uuid, now(), current_setting('t.bob')::uuid),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bin bags', current_setting('t.alice')::uuid, now(), current_setting('t.bob')::uuid),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Eggs', current_setting('t.alice')::uuid, null, null),
  ('b0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000001', 'Dave''s tea', current_setting('t.dave')::uuid, now(), current_setting('t.dave')::uuid);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;

-- Failures leave nothing behind.
select throws_ok($$ select public.shopping_to_expense(array['b0000000-0000-0000-0000-000000000003']::uuid[], 600,
  'Shopping: Eggs', 'groceries', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid], array[300, 300]::bigint[]) $$,
  'P0001', 'not_bought', 'an unbought item cannot be turned into an expense');
select throws_ok($$ select public.shopping_to_expense(array['b0000000-0000-0000-0000-000000000009']::uuid[], 600,
  'Shopping: tea', 'groceries', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid], array[300, 300]::bigint[]) $$,
  'P0001', 'item_not_found', 'another flat''s item is "not found"');
select throws_ok($$ select public.shopping_to_expense('{}'::uuid[], 600,
  'Shopping', 'groceries', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[600]::bigint[]) $$,
  '22023', 'invalid_items', 'at least one item is needed');
select throws_ok($$ select public.shopping_to_expense(array['b0000000-0000-0000-0000-000000000001']::uuid[], 600,
  'Shopping: Milk', 'groceries', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid], array[300, 200]::bigint[]) $$,
  '23514', 'shares_must_add_up', 'shares that do not add up are refused by the ledger''s own rules');
select throws_ok($$ select public.shopping_to_expense(array['b0000000-0000-0000-0000-000000000001']::uuid[], 600,
  'Shopping: Milk', 'groceries', current_date, current_setting('t.dave')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.dave')::uuid], array[300, 300]::bigint[]) $$,
  null, null, 'a payer outside the flat is refused');
reset role;

select is((select count(*)::int from public.expenses), 0, 'no expense exists after the failures');
select is((select count(*)::int from public.shopping_items where expense_id is not null), 0,
  'and no item was changed (rolled back)');

-- Success.
set local role authenticated;
select set_config('t.exp', public.shopping_to_expense(
  array['b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002']::uuid[], 600,
  'Shopping: Milk, Bin bags', 'groceries', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid], array[300, 300]::bigint[])::text, true);
reset role;

select is((select count(*)::int from public.expenses where id = current_setting('t.exp')::uuid and amount_pence = 600
            and created_by = current_setting('t.bob')::uuid), 1, 'one ordinary expense is created');
select is((select sum(share_pence)::bigint from public.expense_shares where expense_id = current_setting('t.exp')::uuid),
  600::bigint, 'with shares that add up');
select is((select count(*)::int from public.shopping_items where expense_id = current_setting('t.exp')::uuid), 2,
  'both items point at it');
select is((select expense_id is null from public.shopping_items where name = 'Eggs'), true, 'other items are untouched');
select is((select count(*)::int from public.notifications where type = 'expense_added'
            and recipient_id = current_setting('t.alice')::uuid and dedupe_key = 'expense:' || current_setting('t.exp')), 1,
  'Alice gets the ledger''s one expense_added notification');

-- Second attempt and edits (Alice, who added the items).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.shopping_to_expense(array['b0000000-0000-0000-0000-000000000001']::uuid[], 600,
  'Shopping: Milk', 'groceries', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid], array[300, 300]::bigint[]) $$,
  'P0001', 'already_in_expense', 'the same items cannot be turned into a second expense');
select throws_ok($$ select public.set_shopping_bought('b0000000-0000-0000-0000-000000000001', false) $$,
  'P0001', 'already_in_expense', 'an item behind an expense cannot be un-ticked');
select throws_ok($$ select public.remove_shopping_item('b0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'already_in_expense', 'or removed');
select throws_ok($$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
  values ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.bob')::uuid, 100, 'x', 'other', current_date) $$,
  '42501', null, 'the ledger tables still cannot be written by the browser role');
reset role;
select is((select count(*)::int from public.expenses), 1, 'only the one expense exists at the end');

select * from finish();
rollback;
