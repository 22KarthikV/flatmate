begin;
select plan(60);

-- Adding, correcting and cancelling expenses (SPEC-ledger L2, L4, L8, L9). These functions are the
-- only way an expense is written; they check who is calling, validate everything again, and write
-- the notifications in the same transaction.

select has_function('public', 'add_expense', array['bigint', 'text', 'text', 'date', 'uuid', 'uuid[]', 'bigint[]'], 'add_expense exists');
select has_function('public', 'edit_expense', array['uuid', 'bigint', 'text', 'text', 'date', 'uuid', 'uuid[]', 'bigint[]'], 'edit_expense exists');
select has_function('public', 'void_expense', array['uuid'], 'void_expense exists');
select ok(
  not has_function_privilege('anon', 'public.add_expense(bigint, text, text, date, uuid, uuid[], bigint[])', 'execute')
  and not has_function_privilege('anon', 'public.edit_expense(uuid, bigint, text, text, date, uuid, uuid[], bigint[])', 'execute')
  and not has_function_privilege('anon', 'public.void_expense(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.add_expense(bigint, text, text, date, uuid, uuid[], bigint[])', 'execute'),
  'signed-in people can call the expense functions; anon cannot'
);

-- People. alice (owner), bob, carol (members) share Flat A; frank used to; dave is alone in Flat D;
-- erin has no flat.
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

-- Carol has a phone, so a push is queued for her when her type pushes by default.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.carol')::uuid, 'https://push.example/carol', 'k', 'a');

-- ---------------------------------------------------------------------------------------------
-- Adding an expense.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.dinner', public.add_expense(
  1000, '  Dinner  ', 'takeaway', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid, current_setting('t.carol')::uuid],
  array[500, 250, 250]::bigint[])::text, true);
reset role;

select is(
  (select count(*)::int from public.expenses where id = current_setting('t.dinner')::uuid
     and created_by = current_setting('t.bob')::uuid and paid_by = current_setting('t.bob')::uuid
     and description = 'Dinner' and household_id = 'a0000000-0000-0000-0000-000000000001'),
  1, 'an expense is stored for the caller''s flat, with the description trimmed'
);
select is(
  (select sum(share_pence)::bigint from public.expense_shares where expense_id = current_setting('t.dinner')::uuid),
  1000::bigint, 'its shares add up to the amount'
);
select results_eq(
  $$select recipient_id, type, title, body, href, dedupe_key from public.notifications
     where dedupe_key = 'expense:' || current_setting('t.dinner') and recipient_id = current_setting('t.alice')::uuid$$,
  $$select current_setting('t.alice')::uuid, 'expense_added'::text, 'Bob added Dinner'::text, 'Your share is £5.00.'::text,
           '/money/expenses/' || current_setting('t.dinner'), 'expense:' || current_setting('t.dinner')$$,
  'a flatmate with a share is told who added it, and what their share is'
);
select is(
  (select count(*)::int from public.notifications where dedupe_key = 'expense:' || current_setting('t.dinner')),
  2, 'Alice and Carol are told'
);
select is(
  (select count(*)::int from public.notifications
    where dedupe_key = 'expense:' || current_setting('t.dinner') and recipient_id = current_setting('t.bob')::uuid),
  0, 'the person who added it is not told about their own action'
);
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.dedupe_key = 'expense:' || current_setting('t.dinner')),
  1, 'a push is queued for Carol''s phone (expense_added pushes by default)'
);

-- Someone else paid: the payer is told too, even with no share.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.paidbycarol', public.add_expense(
  600, 'Cleaning stuff', 'household', current_date, current_setting('t.carol')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid],
  array[300, 300]::bigint[])::text, true);
reset role;
select is(
  (select body from public.notifications where recipient_id = current_setting('t.alice')::uuid
     and dedupe_key = 'expense:' || current_setting('t.paidbycarol')),
  'Your share is £3.00. Paid by Carol.', 'the message says when someone else paid'
);
select is(
  (select body from public.notifications where recipient_id = current_setting('t.carol')::uuid
     and dedupe_key = 'expense:' || current_setting('t.paidbycarol')),
  'You paid £6.00.', 'and the payer, who has no share, is told they paid'
);

-- A share of nothing is not stored, and that person is not told.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.zero', public.add_expense(
  400, 'For Alice only', 'other', current_date, current_setting('t.alice')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.carol')::uuid],
  array[400, 0]::bigint[])::text, true);
reset role;
select is((select count(*)::int from public.expense_shares where expense_id = current_setting('t.zero')::uuid), 1,
  'a 0p share is not stored');
select is((select count(*)::int from public.notifications where dedupe_key = 'expense:' || current_setting('t.zero')), 0,
  'and nobody is told when the only share is the adder''s own');

-- Balances so far: dinner (bob paid 1000: a 500, b 250, c 250), cleaning (carol paid 600: a 300, b 300),
-- alice's own 400.  alice -500-300+400-400 = -800; bob +1000-250-300 = 450; carol -250+600 = 350.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') order by profile_id$$,
  $$select b from (values (current_setting('t.alice')::uuid, -800::bigint), (current_setting('t.bob')::uuid, 450::bigint),
                          (current_setting('t.carol')::uuid, 350::bigint)) v(p, b) order by p$$,
  'balances follow the expenses added'
);
reset role;

-- Generic push text: the worker is handed fixed text for money types and the real text for others.
create temp table claimed_expense_pushes as select * from public.claim_push_outbox(10);
select is(
  (select count(*)::int from claimed_expense_pushes
    where title = 'New expense' and body = 'Someone in your flat added an expense. Open FlatMate to see your share.'),
  2, 'the push worker is handed the generic text for both expense pushes (the dinner, and the one Carol paid)'
);
select is(
  (select count(*)::int from claimed_expense_pushes where title ~ '[£0-9]' or body ~ '[£0-9]'),
  0, 'so no amount, and no digit at all, reaches a lock screen'
);
select private.notify(current_setting('t.carol')::uuid, 'a0000000-0000-0000-0000-000000000001', 'role_changed',
  'You are now an admin', 'Your role in Flat A was changed.', '/more/flat', 'test:role');
select is(
  (select title from public.claim_push_outbox(10) where title = 'You are now an admin'),
  'You are now an admin', 'a household notification still pushes its own text');
update public.push_outbox set sent_at = now();

-- ---------------------------------------------------------------------------------------------
-- Refusals. Everything is checked again in the database.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;

select throws_ok($sql$ select public.add_expense(0, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[0]::bigint[]) $sql$, '22023', 'invalid_amount', 'an expense of 0p is refused');
select throws_ok($sql$ select public.add_expense(1000001, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[1000001]::bigint[]) $sql$, '22023', 'invalid_amount', 'an expense over £10,000.00 is refused');
select throws_ok($sql$ select public.add_expense(100, '   ', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[100]::bigint[]) $sql$, '22023', 'invalid_description', 'a blank description is refused');
select throws_ok($sql$ select public.add_expense(100, repeat('x', 81), 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[100]::bigint[]) $sql$, '22023', 'invalid_description', 'a description over 80 characters is refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'cars', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[100]::bigint[]) $sql$, '22023', 'invalid_category', 'an unknown category is refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date + 32, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[100]::bigint[]) $sql$, '22023', 'invalid_date', 'a date more than 30 days ahead is refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date - 1827, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[100]::bigint[]) $sql$, '22023', 'invalid_date', 'a date more than 5 years back is refused');
select lives_ok($sql$ select public.add_expense(100, 'Pre-booked', 'fun', current_date + 30, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid], array[100]::bigint[]) $sql$, 'a date 30 days ahead is fine');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[]::uuid[], array[]::bigint[]) $sql$, '22023', 'invalid_shares', 'no shares at all is refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid, current_setting('t.alice')::uuid], array[100]::bigint[]) $sql$,
  '22023', 'invalid_shares', 'people and amounts that do not line up are refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid, current_setting('t.bob')::uuid], array[50, 50]::bigint[]) $sql$,
  '22023', 'invalid_shares', 'the same person twice is refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid, current_setting('t.alice')::uuid], array[150, -50]::bigint[]) $sql$,
  '22023', 'invalid_shares', 'a negative share is refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid, current_setting('t.alice')::uuid], array[50, 49]::bigint[]) $sql$,
  '23514', 'shares_must_add_up', 'shares that do not add up to the amount are refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.dave')::uuid,
  array[current_setting('t.bob')::uuid], array[100]::bigint[]) $sql$, 'P0001', 'not_a_member', 'a payer from another flat is refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid, current_setting('t.dave')::uuid], array[50, 50]::bigint[]) $sql$,
  'P0001', 'not_a_member', 'a share for someone from another flat is refused');
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.bob')::uuid, current_setting('t.frank')::uuid], array[50, 50]::bigint[]) $sql$,
  'P0001', 'not_a_member', 'a share for someone who has left is refused');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.alice')::uuid,
  array[current_setting('t.alice')::uuid], array[100]::bigint[]) $sql$, '42501', 'not_allowed', 'someone with no flat cannot add an expense');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.add_expense(100, 'x', 'other', current_date, current_setting('t.alice')::uuid,
  array[current_setting('t.alice')::uuid], array[100]::bigint[]) $sql$, '42501', 'not_allowed', 'nor can someone who has left');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Correcting an expense: void the old one, add the new one, tell everyone it touches.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
-- Bob corrects the dinner to 1200 between Alice and Bob only (Carol is dropped).
select set_config('t.dinner2', public.edit_expense(
  current_setting('t.dinner')::uuid, 1200, 'Dinner (with tip)', 'takeaway', current_date, current_setting('t.bob')::uuid,
  array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid],
  array[600, 600]::bigint[])::text, true);
reset role;

select is(
  (select count(*)::int from public.expenses where id = current_setting('t.dinner')::uuid and voided_at is not null
     and voided_by = current_setting('t.bob')::uuid),
  1, 'the old expense is voided, not deleted'
);
select is(
  (select replaces_id from public.expenses where id = current_setting('t.dinner2')::uuid),
  current_setting('t.dinner')::uuid, 'and the new one records which it replaces'
);
select is((select count(*)::int from public.expense_shares where expense_id = current_setting('t.dinner')::uuid), 3,
  'the old shares are kept as history');
select is(
  (select body from public.notifications where recipient_id = current_setting('t.alice')::uuid
     and dedupe_key = 'expense_changed:' || current_setting('t.dinner2')),
  'Your share is now £6.00.', 'a person still in the expense is told their new share'
);
select is(
  (select body from public.notifications where recipient_id = current_setting('t.carol')::uuid
     and dedupe_key = 'expense_changed:' || current_setting('t.dinner2')),
  'You are no longer part of this expense.', 'a person taken out of it is told that'
);
select is(
  (select count(*)::int from public.notifications where dedupe_key = 'expense_changed:' || current_setting('t.dinner2')),
  2, 'the editor is not told about their own change');
select is(
  (select count(*)::int from public.notifications where type = 'expense_voided'),
  0, 'a correction does not also send a cancellation');

-- Balances after the correction (the 1p-style "Pre-booked" expense nets to nothing for Bob):
-- alice: dinner2 -600, cleaning -300, own +400 -400 = -900; bob: +1200 -600 -300 = 300; carol: +600. Sum 0.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') order by profile_id$$,
  $$select b from (values (current_setting('t.alice')::uuid, -900::bigint), (current_setting('t.bob')::uuid, 300::bigint),
                          (current_setting('t.carol')::uuid, 600::bigint)) v(p, b) order by p$$,
  'balances recalculate after a correction'
);
select is(
  (select sum(balance_pence)::bigint from public.household_balances('a0000000-0000-0000-0000-000000000001')),
  0::bigint, 'and still add up to exactly zero'
);
reset role;

-- Who may correct or cancel: the creator, or an admin. Not another member; not another flat.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.void_expense(current_setting('t.paidbycarol')::uuid) $sql$,
  '42501', 'not_allowed', 'a member cannot cancel an expense someone else added');
select throws_ok($sql$ select public.edit_expense(current_setting('t.paidbycarol')::uuid, 600, 'x', 'other', current_date,
  current_setting('t.carol')::uuid, array[current_setting('t.carol')::uuid], array[600]::bigint[]) $sql$,
  '42501', 'not_allowed', 'nor correct it');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.void_expense(current_setting('t.paidbycarol')::uuid) $sql$,
  'P0001', 'expense_not_found', 'someone in another flat cannot even tell it exists');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.edit_expense(current_setting('t.dinner')::uuid, 1000, 'x', 'other', current_date,
  current_setting('t.bob')::uuid, array[current_setting('t.bob')::uuid], array[1000]::bigint[]) $sql$,
  'P0001', 'already_voided', 'a voided expense cannot be corrected again');
reset role;

-- An admin can cancel someone else's expense; its people are told and the balances drop it.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.void_expense(current_setting('t.paidbycarol')::uuid) $sql$, 'an admin can cancel any expense in the flat');
reset role;
select is(
  (select body from public.notifications where recipient_id = current_setting('t.carol')::uuid and type = 'expense_voided'),
  'You paid £6.00; it no longer counts.', 'the payer is told it no longer counts'
);
select is(
  (select title from public.notifications where recipient_id = current_setting('t.bob')::uuid and type = 'expense_voided'),
  'Alice cancelled Cleaning stuff', 'and the title says who cancelled what'
);
select is((select count(*)::int from public.notifications where type = 'expense_voided'), 2,
  'the two other people involved are told; the admin is not');
select throws_ok($sql$ select public.void_expense(current_setting('t.paidbycarol')::uuid) $sql$,
  'P0001', 'already_voided', 'cancelling twice is refused');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.void_expense(current_setting('t.dinner2')::uuid) $sql$, 'the person who added an expense can cancel it');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') order by profile_id$$,
  $$select b from (values (current_setting('t.alice')::uuid, 0::bigint), (current_setting('t.bob')::uuid, 0::bigint),
                          (current_setting('t.carol')::uuid, 0::bigint)) v(p, b) order by p$$,
  'with the other expenses cancelled, everyone is square (the ones that remain net to nothing)'
);
reset role;

-- An edit by an admin on someone else's expense works, and a left member's old expense can still be
-- cancelled without trying to notify them.
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
values ('e9000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.carol')::uuid, current_setting('t.carol')::uuid, 300, 'Old shared thing', 'other', current_date);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
values ('e9000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 150);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
values ('e9000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 150);
set constraints all immediate;
update public.memberships set left_at = now(), left_reason = 'left'
 where profile_id = current_setting('t.carol')::uuid and left_at is null;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.void_expense('e9000000-0000-0000-0000-000000000009') $sql$,
  'an expense involving someone who has since left can still be cancelled by an admin');
reset role;
select is((select count(*)::int from public.notifications where dedupe_key = 'expense_voided:e9000000-0000-0000-0000-000000000009'), 0,
  'and nobody is told, because the other person has left and the admin did it');

-- Another flat's people are not notified or readable.
select is(
  (select count(*)::int from public.notifications where recipient_id = current_setting('t.dave')::uuid), 0,
  'nothing about Flat A reached Flat D');
select is(
  (select count(distinct household_id)::int from public.notifications where type like 'expense%'),
  1, 'every expense notification belongs to Flat A');

select * from finish();
rollback;
