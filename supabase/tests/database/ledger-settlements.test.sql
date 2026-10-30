begin;
select plan(55);

-- Settling up (SPEC-ledger L7, L8, L9). A payer records "I paid", which changes nobody's balance;
-- the receiver confirms (the balance moves) or declines; the payer may cancel while it is pending.

select has_function('public', 'record_settlement', array['uuid', 'bigint'], 'record_settlement exists');
select has_function('public', 'confirm_settlement', array['uuid'], 'confirm_settlement exists');
select has_function('public', 'decline_settlement', array['uuid'], 'decline_settlement exists');
select has_function('public', 'cancel_settlement', array['uuid'], 'cancel_settlement exists');
select ok(
  not has_function_privilege('anon', 'public.record_settlement(uuid, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.confirm_settlement(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.decline_settlement(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cancel_settlement(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.record_settlement(uuid, bigint)', 'execute')
  and has_function_privilege('authenticated', 'public.confirm_settlement(uuid)', 'execute'),
  'signed-in people can call the settlement functions; anon cannot'
);

-- alice (owner), bob, carol in Flat A; frank used to be; dave alone in Flat D; erin has no flat.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@example.com', '{"full_name": "Erin"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name": "Frank"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
select set_config('t.frank', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000f'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');
insert into public.memberships (household_id, profile_id, role, left_at, left_reason)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 'member', now(), 'left');

-- Both Alice and Bob have a phone, so a push is queued when their type pushes by default.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  (current_setting('t.alice')::uuid, 'https://push.example/alice', 'k', 'a'),
  (current_setting('t.bob')::uuid, 'https://push.example/bob', 'k', 'a');

-- Alice paid 30.00 for the three of them: bob and carol each owe her 10.00.
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
values ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 3000, 'Groceries', 'groceries', current_date);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 1000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 1000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 1000);
set constraints all immediate;

-- ---------------------------------------------------------------------------------------------
-- Recording a payment.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.s1', public.record_settlement(current_setting('t.alice')::uuid, 600)::text, true);
reset role;

select results_eq(
  $$select from_profile, to_profile, amount_pence, status, confirmed_by, decided_at
      from public.settlements where id = current_setting('t.s1')::uuid$$,
  $$select current_setting('t.bob')::uuid, current_setting('t.alice')::uuid, 600::bigint, 'pending'::text, null::uuid, null::timestamptz$$,
  'a recorded payment is pending, from the payer to the receiver'
);
select is((select household_id from public.settlements where id = current_setting('t.s1')::uuid),
  'a0000000-0000-0000-0000-000000000001'::uuid, 'and belongs to the payer''s flat');

select results_eq(
  $$select recipient_id, type, title, body, href, dedupe_key from public.notifications
     where type = 'settlement_pending'$$,
  $$select current_setting('t.alice')::uuid, 'settlement_pending'::text, 'Bob says they paid you'::text,
           'Confirm it when you have received £6.00.'::text, '/money'::text, 'settlement:' || current_setting('t.s1')$$,
  'the receiver is told, with the amount, and where to confirm'
);
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.bob')::uuid), 0,
  'the payer is not told about their own action');

create temp table claimed_pending as select * from public.claim_push_outbox(10);
select is(
  (select count(*)::int from claimed_pending where title = 'Payment to confirm'
     and body = 'Someone says they paid you. Open FlatMate to confirm.'),
  1, 'the receiver''s phone gets the generic push text'
);
select is((select count(*)::int from claimed_pending where title ~ '[£0-9]' or body ~ '[£0-9]'), 0,
  'with no amount in it');

-- Pending changes nothing: bob still owes 10.00.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') order by profile_id$$,
  $$select b from (values (current_setting('t.alice')::uuid, 2000::bigint), (current_setting('t.bob')::uuid, -1000::bigint),
                          (current_setting('t.carol')::uuid, -1000::bigint)) v(p, b) order by p$$,
  'a pending payment changes nobody''s balance'
);
reset role;

-- Refusals.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.record_settlement(current_setting('t.alice')::uuid, 0) $sql$,
  '22023', 'invalid_amount', 'a payment of 0p is refused');
select throws_ok($sql$ select public.record_settlement(current_setting('t.alice')::uuid, 1000001) $sql$,
  '22023', 'invalid_amount', 'a payment over £10,000.00 is refused');
select throws_ok($sql$ select public.record_settlement(current_setting('t.bob')::uuid, 100) $sql$,
  '22023', 'invalid_recipient', 'a person cannot pay themselves');
select throws_ok($sql$ select public.record_settlement(current_setting('t.dave')::uuid, 100) $sql$,
  'P0001', 'not_a_member', 'a payment to someone in another flat is refused');
select throws_ok($sql$ select public.record_settlement(current_setting('t.frank')::uuid, 100) $sql$,
  'P0001', 'not_a_member', 'a payment to someone who has left is refused');
select throws_ok($sql$ select public.record_settlement(null, 100) $sql$,
  '22023', 'invalid_recipient', 'a payment to nobody is refused');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.record_settlement(current_setting('t.alice')::uuid, 100) $sql$,
  '42501', 'not_allowed', 'someone with no flat cannot record a payment');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Confirming: only the receiver, and then the balances move.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.s1')::uuid) $sql$,
  '42501', 'not_allowed', 'the payer cannot confirm their own payment');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.s1')::uuid) $sql$,
  '42501', 'not_allowed', 'a third flatmate cannot confirm it');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.s1')::uuid) $sql$,
  'P0001', 'settlement_not_found', 'someone in another flat cannot tell it exists');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.confirm_settlement(current_setting('t.s1')::uuid) $sql$, 'the receiver can confirm');
select results_eq(
  $$select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') order by profile_id$$,
  $$select b from (values (current_setting('t.alice')::uuid, 1400::bigint), (current_setting('t.bob')::uuid, -400::bigint),
                          (current_setting('t.carol')::uuid, -1000::bigint)) v(p, b) order by p$$,
  'confirming moves both balances'
);
select is(
  (select sum(balance_pence)::bigint from public.household_balances('a0000000-0000-0000-0000-000000000001')),
  0::bigint, 'and the flat still adds up to exactly zero'
);
reset role;
select results_eq(
  $$select status, confirmed_by, decided_at is not null from public.settlements where id = current_setting('t.s1')::uuid$$,
  $$select 'confirmed'::text, current_setting('t.alice')::uuid, true$$,
  'it records who confirmed it and when'
);
select results_eq(
  $$select recipient_id, title, body, href from public.notifications where type = 'settlement_confirmed'$$,
  $$select current_setting('t.bob')::uuid, 'Alice confirmed your payment'::text, '£6.00 now counts towards what you owe.'::text, '/money'::text$$,
  'the payer is told it was confirmed'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.confirm_settlement(current_setting('t.s1')::uuid) $sql$, 'confirming again is harmless');
reset role;
select is((select count(*)::int from public.notifications where type = 'settlement_confirmed'), 1,
  'and does not tell the payer twice');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.alice')::uuid
            and type = 'settlement_confirmed'), 0, 'the receiver is not told about their own confirmation');

-- A confirmed payment can no longer be declined or cancelled.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.decline_settlement(current_setting('t.s1')::uuid) $sql$,
  'P0001', 'settlement_not_pending', 'a confirmed payment cannot be declined');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.cancel_settlement(current_setting('t.s1')::uuid) $sql$,
  'P0001', 'settlement_not_pending', 'nor cancelled');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Declining.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.s2', public.record_settlement(current_setting('t.alice')::uuid, 300)::text, true);
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.decline_settlement(current_setting('t.s2')::uuid) $sql$,
  '42501', 'not_allowed', 'the payer cannot decline their own payment');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.decline_settlement(current_setting('t.s2')::uuid) $sql$,
  '42501', 'not_allowed', 'a third flatmate cannot decline it');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.decline_settlement(current_setting('t.s2')::uuid) $sql$, 'the receiver can decline');
select is(
  (select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001')
    where profile_id = current_setting('t.carol')::uuid),
  -1000::bigint, 'a declined payment changes no balance');
reset role;
select results_eq(
  $$select status, confirmed_by, decided_at is not null from public.settlements where id = current_setting('t.s2')::uuid$$,
  $$select 'declined'::text, null::uuid, true$$,
  'it is marked declined, with no confirmer'
);
select results_eq(
  $$select recipient_id, title, body from public.notifications where type = 'settlement_declined'$$,
  $$select current_setting('t.carol')::uuid, 'Alice did not confirm your payment'::text,
           'They have not counted your £3.00 payment. Check with them if it should have been.'::text$$,
  'the payer is told it was declined'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.decline_settlement(current_setting('t.s2')::uuid) $sql$, 'declining again is harmless');
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.s2')::uuid) $sql$,
  'P0001', 'settlement_not_pending', 'a declined payment cannot then be confirmed');
reset role;
select is((select count(*)::int from public.notifications where type = 'settlement_declined'), 1,
  'declining twice tells the payer once');

-- ---------------------------------------------------------------------------------------------
-- Cancelling: only the payer, only while pending.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.s3', public.record_settlement(current_setting('t.alice')::uuid, 1000)::text, true);
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.cancel_settlement(current_setting('t.s3')::uuid) $sql$,
  '42501', 'not_allowed', 'the receiver cannot cancel it (they confirm or decline)');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.cancel_settlement(current_setting('t.s3')::uuid) $sql$,
  '42501', 'not_allowed', 'a third flatmate cannot cancel it');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.cancel_settlement(current_setting('t.s3')::uuid) $sql$, 'the payer can cancel while it is pending');
select lives_ok($sql$ select public.cancel_settlement(current_setting('t.s3')::uuid) $sql$, 'cancelling again is harmless');
reset role;
select results_eq(
  $$select status, confirmed_by, decided_at is not null from public.settlements where id = current_setting('t.s3')::uuid$$,
  $$select 'cancelled'::text, null::uuid, true$$,
  'it is marked cancelled'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_settlement(current_setting('t.s3')::uuid) $sql$,
  'P0001', 'settlement_not_pending', 'a cancelled payment cannot be confirmed');
select throws_ok($sql$ select public.decline_settlement(current_setting('t.s3')::uuid) $sql$,
  'P0001', 'settlement_not_pending', 'nor declined');
select is(
  (select sum(balance_pence)::bigint from public.household_balances('a0000000-0000-0000-0000-000000000001')),
  0::bigint, 'after all of that the flat still adds up to exactly zero');
reset role;

-- A payment can be confirmed or declined by the receiver even if the payer has since left, and a
-- payment to someone who has left can no longer be confirmed by them.
set constraints all deferred;
insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence)
values ('54000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.carol')::uuid, current_setting('t.alice')::uuid, 100);
set constraints all immediate;
update public.memberships set left_at = now(), left_reason = 'left'
 where profile_id = current_setting('t.carol')::uuid and left_at is null;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.confirm_settlement('54000000-0000-0000-0000-000000000004') $sql$,
  'a payment from someone who has since left can still be confirmed');
reset role;
select is((select count(*)::int from public.notifications where dedupe_key = 'settlement_confirmed:54000000-0000-0000-0000-000000000004'), 0,
  'without trying to tell the person who left');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.record_settlement(current_setting('t.alice')::uuid, 100) $sql$,
  '42501', 'not_allowed', 'someone who has left cannot record a new payment');
reset role;

-- Everything stayed inside Flat A.
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.dave')::uuid), 0,
  'nothing reached Flat D');
select is((select count(distinct household_id)::int from public.settlements), 1, 'every settlement belongs to Flat A');
select is((select count(*)::int from public.notifications where type like 'settlement%' and household_id <> 'a0000000-0000-0000-0000-000000000001'), 0,
  'every settlement notification belongs to Flat A');

select * from finish();
rollback;
