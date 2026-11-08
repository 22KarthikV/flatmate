begin;
select plan(13);

-- Ledger: person_ledger, the rows behind one flatmate's balance.
-- Flat A: Sam, Alice, Bob, and Dan who has left. Flat B: Zed. Nina is in no flat.
-- E1 Sam paid 90.00 for Sam, Alice and Bob (30.00 each). E2 Alice paid 20.00 for Alice and Bob.
-- E3 Sam paid 50.00 for Sam and Bob but was cancelled. E4 Sam paid 10.00 for Dan alone.
-- S1 Bob paid Sam 10.00 (confirmed). S2 Bob paid Sam 5.00 (still pending).

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'sam@example.com', '{"full_name": "Sam"}'),
  ('00000000-0000-0000-0000-000000000003', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-000000000004', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-000000000005', 'dan@example.com', '{"full_name": "Dan"}'),
  ('00000000-0000-0000-0000-000000000006', 'zed@example.com', '{"full_name": "Zed"}'),
  ('00000000-0000-0000-0000-000000000007', 'nina@example.com', '{"full_name": "Nina"}');
select set_config('t.' || split_part(u.email, '@', 1), p.id::text, true)
  from auth.users u join public.profiles p on p.user_id = u.id;

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.sam')::uuid),
  ('b0000000-0000-0000-0000-000000000001', 'Flat B', current_setting('t.zed')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dan')::uuid, 'member'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.zed')::uuid, 'owner');

set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on, voided_at, voided_by) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, current_setting('t.sam')::uuid, 9000, 'Shopping', 'groceries', current_date - 6, null, null),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 2000, 'Bin bags', 'household', current_date - 4, null, null),
  ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, current_setting('t.sam')::uuid, 5000, 'Wrong amount', 'other', current_date - 3, now(), current_setting('t.sam')::uuid),
  ('e4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, current_setting('t.sam')::uuid, 1000, 'Dan''s parcel', 'other', current_date - 2, null, null);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 3000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 3000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 3000),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 1000),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 1000),
  ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 2500),
  ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 2500),
  ('e4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.dan')::uuid, 1000);
set constraints all immediate;

insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence, status, confirmed_by, created_at, decided_at) values
  ('51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 1000, 'confirmed', current_setting('t.sam')::uuid, now() - interval '2 days', now() - interval '2 days');
insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence, created_at) values
  ('52000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 500, now() - interval '1 day');

-- Dan has now left, with money still open.
update public.memberships set left_at = now(), left_reason = 'left'
 where profile_id = current_setting('t.dan')::uuid and left_at is null;

select ok(
  not has_function_privilege('anon', 'public.person_ledger(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.person_ledger(uuid)', 'execute'),
  'for signed-in people only'
);

-- Alice asks about Bob: any flatmate can open any flatmate's list.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.person_ledger(current_setting('t.bob')::uuid)), 5,
  'Bob''s list has both settlements and every expense he is part of, cancelled one included');
select is((select array_agg(item_id::text order by item_id) from public.person_ledger(current_setting('t.bob')::uuid) where not counts),
  array['52000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000003']::text[],
  'the cancelled expense and the pending payment are marked as not counting');
select is((select sum(effect_pence)::bigint from public.person_ledger(current_setting('t.bob')::uuid) where counts),
  (select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') where profile_id = current_setting('t.bob')::uuid),
  'what counts adds up to Bob''s balance');
select is((select sum(effect_pence)::bigint from public.person_ledger(current_setting('t.alice')::uuid) where counts),
  (select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') where profile_id = current_setting('t.alice')::uuid),
  'what counts adds up to Alice''s balance');
select is((select sum(effect_pence)::bigint from public.person_ledger(current_setting('t.sam')::uuid) where counts),
  (select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') where profile_id = current_setting('t.sam')::uuid),
  'what counts adds up to Sam''s balance, including money he paid out');
select is((select sum(effect_pence)::bigint from public.person_ledger(current_setting('t.dan')::uuid) where counts), -1000::bigint,
  'a flatmate who has left can still be opened while money is open');

-- The detail of a row: Bob's share of the shopping, and Sam's own row for it.
select is((select share_pence || ':' || effect_pence || ':' || other_name from public.person_ledger(current_setting('t.bob')::uuid)
            where item_id = 'e1000000-0000-0000-0000-000000000001'), '3000:-3000:Sam',
  'Bob''s share of the shopping is 30.00, paid by Sam');
select is((select share_pence || ':' || effect_pence from public.person_ledger(current_setting('t.sam')::uuid)
            where item_id = 'e1000000-0000-0000-0000-000000000001'), '3000:6000',
  'Sam paid 90.00 and owns 30.00 of it, so it adds 60.00 to what he is owed');
select is((select effect_pence || ':' || other_name || ':' || status from public.person_ledger(current_setting('t.bob')::uuid)
            where item_id = '51000000-0000-0000-0000-000000000001'), '1000:Sam:confirmed',
  'Bob''s confirmed payment to Sam reduces what he owes');
select is((select count(*)::int from public.person_ledger(current_setting('t.bob')::uuid) where kind = 'expense' and item_id = 'e4000000-0000-0000-0000-000000000004'), 0,
  'an expense Bob is not part of is not in his list');
reset role;

-- Someone in another flat, or in no flat, cannot open it.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000006", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format('select * from public.person_ledger(%L)', current_setting('t.bob')), '42501', 'not_allowed',
  'another flat''s owner cannot read Bob''s list');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000007", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format('select * from public.person_ledger(%L)', current_setting('t.bob')), '42501', 'not_allowed',
  'someone in no flat cannot either');
reset role;

select * from finish();
rollback;
