begin;
select plan(45);

-- Leaving and account deletion with money in play (SPEC-ledger L11). A person cannot leave, or
-- delete their account, while they owe or are owed money, or have a payment waiting. If someone has
-- already gone (removed by an admin) and is owed money, a payment to them can be confirmed or
-- declined on their behalf by an admin who is not the payer.

-- alice (owner), bob, carol (admin), gina, hal, dee in Flat A; dave alone in Flat D.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'dee@example.com', '{"full_name": "Dee"}'),
  ('00000000-0000-0000-0000-000000000010', 'gina@example.com', '{"full_name": "Gina"}'),
  ('00000000-0000-0000-0000-000000000011', 'hal@example.com', '{"full_name": "Hal"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
select set_config('t.dee', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000e'), true);
select set_config('t.gina', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000010'), true);
select set_config('t.hal', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000011'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.hal')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');

-- Alice paid 40.00 for alice, bob, carol and dee (10.00 each). Dee paid 20.00 for dee and alice.
-- Gina and Hal are in no expense.
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 4000, 'Groceries', 'groceries', current_date),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   current_setting('t.dee')::uuid, current_setting('t.dee')::uuid, 2000, 'Light bulbs', 'household', current_date);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 1000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 1000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 1000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 1000),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 1000),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 1000);
set constraints all immediate;

-- Balances: alice +4000-1000-1000 = 2000; bob -1000; carol -1000; dee -1000+2000-1000 = 0; gina, hal 0.
select is(private.ledger_person_balance('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid), 2000::bigint,
  'one person''s balance is worked out from the rows');
select is(private.ledger_person_balance('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid), -1000::bigint,
  'including what they owe');
select is(private.ledger_person_balance('a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid), 0::bigint,
  'and zero for someone with no money in play');
select is(
  (select sum(private.ledger_person_balance('a0000000-0000-0000-0000-000000000001', p.id))::bigint
     from public.profiles p where p.id in (current_setting('t.alice')::uuid, current_setting('t.bob')::uuid, current_setting('t.carol')::uuid,
          current_setting('t.dee')::uuid, current_setting('t.gina')::uuid, current_setting('t.hal')::uuid)),
  0::bigint, 'and everyone''s balances add up to zero'
);

-- ---------------------------------------------------------------------------------------------
-- can_leave.
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid), false,
  'someone who owes money cannot leave');
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid), false,
  'nor someone who is owed money');
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid), true,
  'someone square can leave');
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid), true,
  'and so can someone whose expenses net to nothing');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.leave_household() $sql$, 'P0001', 'cannot_leave',
  'leaving while owing money is refused');
reset role;
select is((select count(*)::int from public.memberships where profile_id = current_setting('t.bob')::uuid and left_at is null), 1,
  'and Bob is still in the flat');

-- A pending payment also blocks leaving, even when the balance is zero: Gina pays Hal.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.gina_pays', public.record_settlement(current_setting('t.hal')::uuid, 100)::text, true);
reset role;
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid), false,
  'someone with a payment waiting for a decision cannot leave');
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.hal')::uuid), false,
  'nor can the person it was sent to');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.leave_household() $sql$, 'P0001', 'cannot_leave', 'leaving with a payment waiting is refused');
select lives_ok($sql$ select public.cancel_settlement(current_setting('t.gina_pays')::uuid) $sql$, 'the payment is cancelled');
reset role;
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.gina')::uuid), true,
  'and once it is decided Gina can leave');
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.hal')::uuid), true, 'as can Hal');

-- Settling clears the way: bob pays alice 10.00, alice confirms.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.bob_pays', public.record_settlement(current_setting('t.alice')::uuid, 1000)::text, true);
reset role;
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid), false,
  'while the payment is pending Bob still cannot leave');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.confirm_settlement(current_setting('t.bob_pays')::uuid) $sql$, 'Alice confirms');
reset role;
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid), true,
  'once it is confirmed Bob owes nothing and can leave');

-- ---------------------------------------------------------------------------------------------
-- Account deletion goes through the same rule, and changes nothing when refused.
select throws_ok(
  $sql$ select public.end_memberships_for_account('00000000-0000-0000-0000-00000000000c') $sql$,
  'P0001', 'open_balance', 'deleting an account while owing money is refused');
select is((select count(*)::int from public.memberships where profile_id = current_setting('t.carol')::uuid and left_at is null), 1,
  'and Carol is still in the flat');
select is(public.end_memberships_for_account('00000000-0000-0000-0000-00000000000b'), 'ok',
  'once Bob owes nothing his account can be deleted');
select is((select left_reason from public.memberships where profile_id = current_setting('t.bob')::uuid), 'account_deleted',
  'and his membership ends');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.leave_household() $sql$, 'someone who is square can leave');
reset role;
select is((select left_reason from public.memberships where profile_id = current_setting('t.gina')::uuid), 'left',
  'and their membership ends');

-- ---------------------------------------------------------------------------------------------
-- Dee is owed money, then removed by an admin. Dee paid 20.00 again for dee and alice.
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
values ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.dee')::uuid, current_setting('t.dee')::uuid, 2000, 'Washing line', 'household', current_date);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence) values
  ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 1000),
  ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 1000);
set constraints all immediate;
select is(private.ledger_person_balance('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid), 1000::bigint,
  'Dee is owed 10.00');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.remove_member(current_setting('t.dee')::uuid) $sql$,
  'an admin can remove Dee even though money is open (removal is not blocked)');
reset role;
select is((select left_reason from public.memberships where profile_id = current_setting('t.dee')::uuid), 'removed', 'Dee has gone');
select is(private.can_leave('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid), false,
  'and Dee still has money open');

-- A payment to someone who has gone: only if they are owed that much, and they are not notified.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.record_settlement(current_setting('t.dee')::uuid, 1001) $sql$,
  'P0001', 'not_owed', 'a payment to someone who has gone cannot be more than they are owed');
select set_config('t.to_dee_a', public.record_settlement(current_setting('t.dee')::uuid, 600)::text, true);
select set_config('t.to_dee_b', public.record_settlement(current_setting('t.dee')::uuid, 400)::text, true);
reset role;
select is((select status from public.settlements where id = current_setting('t.to_dee_a')::uuid), 'pending',
  'a payment to someone who has gone is pending, waiting for an admin');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.dee')::uuid and type = 'settlement_pending'), 0,
  'and the person who left is not notified');

-- Who may decide it on their behalf.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.to_dee_a')::uuid) $sql$,
  '42501', 'not_allowed', 'the payer cannot confirm their own payment, even as the owner');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000011", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.to_dee_a')::uuid) $sql$,
  '42501', 'not_allowed', 'a plain member cannot confirm on someone''s behalf');
select throws_ok($sql$ select public.decline_settlement(current_setting('t.to_dee_a')::uuid) $sql$,
  '42501', 'not_allowed', 'nor decline');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.to_dee_a')::uuid) $sql$,
  'P0001', 'settlement_not_found', 'an admin of another flat cannot even tell it exists');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.confirm_settlement(current_setting('t.to_dee_a')::uuid) $sql$,
  'another admin can confirm it on Dee''s behalf');
select lives_ok($sql$ select public.decline_settlement(current_setting('t.to_dee_b')::uuid) $sql$,
  'or decline one');
reset role;
select results_eq(
  $$select status, confirmed_by from public.settlements where id = current_setting('t.to_dee_a')::uuid$$,
  $$select 'confirmed'::text, current_setting('t.carol')::uuid$$,
  'the row records which admin confirmed it'
);
select is((select status from public.settlements where id = current_setting('t.to_dee_b')::uuid), 'declined', 'and that the other was declined');
select is(private.ledger_person_balance('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid), 400::bigint,
  'only the confirmed 6.00 counted against what Dee is owed');
select results_eq(
  $$select recipient_id, body from public.notifications where type = 'settlement_confirmed' and dedupe_key = 'settlement_confirmed:' || current_setting('t.to_dee_a')$$,
  $$select current_setting('t.alice')::uuid, '£6.00 now counts. Dee has left, so an admin confirmed it for them.'::text$$,
  'the payer is told an admin confirmed it for them'
);

-- It works only for someone who is really gone.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.to_hal', public.record_settlement(current_setting('t.hal')::uuid, 100)::text, true);
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.to_hal')::uuid) $sql$,
  '42501', 'not_allowed', 'an admin cannot confirm for someone who is still in the flat');
reset role;

-- A lone owner can still close their flat and delete their account, whatever former flatmates owe.
select is(public.end_memberships_for_account('00000000-0000-0000-0000-00000000000d'), 'ok',
  'a lone owner can delete their account (the flat closes)');
select is(
  (select sum(b)::bigint from (select private.ledger_person_balance('a0000000-0000-0000-0000-000000000001', p.id) b
     from public.profiles p where p.id in (current_setting('t.alice')::uuid, current_setting('t.bob')::uuid,
       current_setting('t.carol')::uuid, current_setting('t.dee')::uuid, current_setting('t.gina')::uuid, current_setting('t.hal')::uuid)) x),
  0::bigint, 'after all of that the flat still adds up to exactly zero'
);

select * from finish();
rollback;
