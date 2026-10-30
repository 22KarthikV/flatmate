begin;
select plan(73);

-- Recurring: rent payments, status, my rent and the dashboard (SPEC-recurring R14, R21 to R23).
-- Flat A: Sam (owner and collector), Dee (admin who also pays rent), Alice, Bob, Cara (members).
-- Flat B: Zed (owner). Charges: Alice 600.00 for each of Sep, Oct and Nov; Bob 600.00, Cara 550.00
-- and Dee 100.00 for Nov.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'sam@example.com', '{"full_name": "Sam"}'),
  ('00000000-0000-0000-0000-000000000002', 'dee@example.com', '{"full_name": "Dee"}'),
  ('00000000-0000-0000-0000-000000000003', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-000000000004', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-000000000005', 'cara@example.com', '{"full_name": "Cara"}'),
  ('00000000-0000-0000-0000-000000000006', 'zed@example.com', '{"full_name": "Zed"}');
select set_config('t.' || split_part(u.email, '@', 1), p.id::text, true)
  from auth.users u join public.profiles p on p.user_id = u.id;

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.sam')::uuid),
  ('b0000000-0000-0000-0000-000000000001', 'Flat B', current_setting('t.zed')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, 'member'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.zed')::uuid, 'owner');

insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'rent', 'Rent', current_setting('t.sam')::uuid, 6, 'fixed', null, 'amounts', current_setting('t.sam')::uuid);
insert into public.recurring_instances (id, template_id, household_id, period, due_on, status) values
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-09-01', '2026-09-06', 'posted'),
  ('e2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-10-01', '2026-10-06', 'posted'),
  ('e3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-06', 'posted');
insert into public.rent_charges (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on, room_name)
select 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', i.id, i.period, current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 60000, i.due_on, 'Big room'
  from public.recurring_instances i;
insert into public.rent_charges (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on, room_name) values
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000003', '2026-11-01', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 60000, '2026-11-06', 'Big room'),
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000003', '2026-11-01', current_setting('t.cara')::uuid, current_setting('t.sam')::uuid, 55000, '2026-11-06', 'Box room'),
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000003', '2026-11-01', current_setting('t.dee')::uuid, current_setting('t.sam')::uuid, 10000, '2026-11-06', 'Attic');

select ok(
  not has_function_privilege('anon', 'public.record_rent_payment(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.my_rent()', 'execute')
  and not has_function_privilege('anon', 'public.rent_dashboard(date)', 'execute')
  and has_function_privilege('authenticated', 'public.confirm_rent_payment(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.rent_charge_status(uuid, uuid)', 'execute'),
  'the rent functions are for signed-in people only, and the status function is private'
);

-- The status numbers (R14): confirmed payments cover the oldest charge first; pending ones show next.
insert into public.rent_payments (id, household_id, template_id, payer_id, collector_id, amount_pence, status, decided_by, decided_at) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 90000, 'confirmed', current_setting('t.sam')::uuid, now());
insert into public.rent_payments (id, household_id, template_id, payer_id, collector_id, amount_pence, status) values
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 40000, 'pending');
select is((select array_agg(covered_pence order by period) from private.rent_charge_status('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid)),
  array[60000, 30000, 0]::bigint[], 'a confirmed 900.00 covers September in full and 300.00 of October');
select is((select array_agg(pending_pence order by period) from private.rent_charge_status('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid)),
  array[0, 30000, 10000]::bigint[], 'and a pending 400.00 lands on the oldest unpaid: the rest of October, then November');
select is((select array_agg(outstanding_pence order by period) from private.rent_charge_status('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid)),
  array[0, 0, 50000]::bigint[], 'leaving 500.00 outstanding');
update public.rent_payments set voided_at = now(), voided_by = current_setting('t.sam')::uuid where id = 'a1000000-0000-0000-0000-000000000001';
select is((select array_agg(covered_pence order by period) from private.rent_charge_status('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid)),
  array[0, 0, 0]::bigint[], 'a voided payment covers nothing');
update public.rent_payments set status = 'cancelled', decided_by = current_setting('t.alice')::uuid, decided_at = now()
 where id = 'a2000000-0000-0000-0000-000000000002';
select is((select sum(outstanding_pence)::bigint from private.rent_charge_status('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid)),
  180000::bigint, 'and a cancelled one shows nothing: all 1,800.00 is outstanding again');
select is(private.rent_status_label(60000, 60000, 0) || private.rent_status_label(60000, 0, 60000) || private.rent_status_label(60000, 10000, 20000) || private.rent_status_label(60000, 0, 0),
  'paidpendingpart_paidoutstanding', 'the status words');

-- Recording a payment.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.record_rent_payment(200000) $sql$, 'P0001', 'amount_exceeds_owed', 'a payment cannot be more than is owed');
select throws_ok($sql$ select public.record_rent_payment(0) $sql$, '22023', 'invalid_amount', 'or less than 1p');
select set_config('t.p1', public.record_rent_payment(70000)::text, true);
select is((select status from public.rent_payments where id = current_setting('t.p1')::uuid), 'pending', 'a payment starts pending');
select is((select array_agg(status order by period desc) from public.my_rent()), array['outstanding', 'part_paid', 'pending']::text[], 'it shows as pending on the oldest charges');
select is((select array_agg(outstanding_pence order by period desc) from public.my_rent()), array[60000, 50000, 0]::bigint[], 'with the rest outstanding');
select throws_ok($sql$ select public.confirm_rent_payment(current_setting('t.p1')::uuid) $sql$, '42501', 'not_allowed', 'a member cannot confirm, not even their own');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_rent_payment(current_setting('t.p1')::uuid) $sql$, '42501', 'not_allowed', 'another member cannot confirm it');
select throws_ok($sql$ select public.cancel_rent_payment(current_setting('t.p1')::uuid) $sql$, '42501', 'not_allowed', 'or cancel it');
select is((select count(*)::int from public.rent_payments), 0, 'and cannot even see it');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000006", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.confirm_rent_payment(current_setting('t.p1')::uuid) $sql$, 'P0001', 'payment_not_found', 'an admin of another flat finds nothing');
select throws_ok($sql$ select public.void_rent_payment(current_setting('t.p1')::uuid) $sql$, 'P0001', 'payment_not_found', 'to void either');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.confirm_rent_payment(current_setting('t.p1')::uuid) $sql$, 'an admin who is not the payer confirms');
select throws_ok($sql$ select public.confirm_rent_payment(current_setting('t.p1')::uuid) $sql$, 'P0001', 'already_decided', 'a decision is made once');
select throws_ok($sql$ select public.decline_rent_payment(current_setting('t.p1')::uuid) $sql$, 'P0001', 'already_decided', 'and cannot be reversed by declining');
reset role;
select is((select status || ':' || decided_by::text from public.rent_payments where id = current_setting('t.p1')::uuid), 'confirmed:' || current_setting('t.dee'), 'who decided is recorded');
select is((select count(*)::int from public.notifications where type = 'rent_payment_pending' and dedupe_key = 'rent_payment:' || current_setting('t.p1')), 2, 'the collector and the other admin were asked to confirm');
select is((select count(*)::int from public.notifications where type = 'rent_payment_pending' and recipient_id in (current_setting('t.alice')::uuid, current_setting('t.bob')::uuid, current_setting('t.cara')::uuid)), 0, 'and no member was told about it');
select is((select count(*)::int from public.notifications where type = 'rent_payment_decided' and recipient_id = current_setting('t.alice')::uuid), 1, 'the payer is told it was confirmed');
select ok((select title from public.notifications where type = 'rent_payment_decided' and recipient_id = current_setting('t.alice')::uuid) like 'Dee confirmed%', 'by name');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select array_agg(status order by period desc) from public.my_rent()), array['outstanding', 'part_paid', 'paid']::text[], 'once confirmed the oldest month is paid and October part paid');
select throws_ok($sql$ select public.record_rent_payment(110001) $sql$, 'P0001', 'amount_exceeds_owed', 'what is owed now is 1,100.00');
select set_config('t.p2', public.record_rent_payment(110000)::text, true);
select throws_ok($sql$ select public.record_rent_payment(1) $sql$, 'P0001', 'nothing_owed', 'with a pending payment covering everything there is nothing more to record');
select throws_ok($sql$ select public.cancel_rent_payment(current_setting('t.p1')::uuid) $sql$, 'P0001', 'already_decided', 'a decided payment cannot be cancelled');
select lives_ok($sql$ select public.cancel_rent_payment(current_setting('t.p2')::uuid) $sql$, 'the payer cancels a pending one');
select throws_ok($sql$ select public.cancel_rent_payment(current_setting('t.p2')::uuid) $sql$, 'P0001', 'already_decided', 'once');
select set_config('t.p3', public.record_rent_payment(1000)::text, true);
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.decline_rent_payment(current_setting('t.p3')::uuid) $sql$, 'the collector declines one');
select throws_ok($sql$ select public.record_rent_payment(100) $sql$, 'P0001', 'nothing_owed', 'the collector owes no rent to record');
reset role;
select is((select status from public.rent_payments where id = current_setting('t.p3')::uuid), 'declined', 'it is declined');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select array_agg(outstanding_pence order by period desc) from public.my_rent()), array[60000, 50000, 0]::bigint[], 'declined and cancelled payments change nothing');
reset role;

-- An admin who pays rent cannot confirm their own payment.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.p4', public.record_rent_payment(5000)::text, true);
select throws_ok($sql$ select public.confirm_rent_payment(current_setting('t.p4')::uuid) $sql$, '42501', 'not_allowed', 'an admin cannot confirm their own rent payment');
reset role;
select is((select array_agg(recipient_id::text) from public.notifications where dedupe_key = 'rent_payment:' || current_setting('t.p4')), array[current_setting('t.sam')], 'only the other admin is asked');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.confirm_rent_payment(current_setting('t.p4')::uuid) $sql$, 'the collector confirms it');
select throws_ok($sql$ select public.void_rent_payment(current_setting('t.p3')::uuid) $sql$, 'P0001', 'not_confirmed', 'only a confirmed payment can be voided');
select lives_ok($sql$ select public.void_rent_payment(current_setting('t.p4')::uuid) $sql$, 'an admin voids a confirmed payment');
select throws_ok($sql$ select public.void_rent_payment(current_setting('t.p4')::uuid) $sql$, 'P0001', 'already_voided', 'once');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.void_rent_payment(current_setting('t.p1')::uuid) $sql$, '42501', 'not_allowed', 'a member cannot void');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select outstanding_pence from public.my_rent()), 10000::bigint, 'a voided payment is outstanding again for the payer');
select throws_ok($sql$ select public.waive_rent(current_setting('t.dee')::uuid, 100, 'x') $sql$, '42501', 'not_allowed', 'an admin cannot waive their own rent');
reset role;

-- Waivers.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.waive_rent(current_setting('t.bob')::uuid, 100, 'x') $sql$, '42501', 'not_allowed', 'a member cannot waive');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.waive_rent(current_setting('t.bob')::uuid, 2000, '  ') $sql$, '22023', 'invalid_reason', 'a waiver needs a reason');
select throws_ok($sql$ select public.waive_rent(current_setting('t.bob')::uuid, 70000, 'Too much') $sql$, 'P0001', 'amount_exceeds_owed', 'and cannot be more than is owed');
select throws_ok($sql$ select public.waive_rent(current_setting('t.sam')::uuid, 100, 'x') $sql$, '42501', 'not_allowed', 'nor can one waive one''s own');
select set_config('t.w1', public.waive_rent(current_setting('t.bob')::uuid, 20000, 'Agreed with the landlord')::text, true);
reset role;
select is((select kind || ':' || status || ':' || decided_by::text from public.rent_payments where id = current_setting('t.w1')::uuid), 'waiver:confirmed:' || current_setting('t.sam'), 'a waiver is confirmed at once, by the admin');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is((select covered_pence || ':' || outstanding_pence || ':' || status from public.my_rent()), '20000:40000:part_paid', 'it counts towards what Bob owes');
reset role;

-- Privacy of the screens' functions.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.my_rent()), 3, 'Alice sees only her own three months');
select is((select sum(amount_pence)::bigint from public.my_rent()), 180000::bigint, 'and nobody else''s');
select throws_ok($sql$ select * from public.rent_dashboard(date '2026-11-01') $sql$, '42501', 'not_allowed', 'the dashboard is refused to members');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is((select amount_pence from public.my_rent()), 55000::bigint, 'Cara sees only her own');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000006", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.my_rent()), 0, 'someone in another flat has no rent');
select is((select count(*)::int from public.rent_dashboard(date '2026-11-01')), 0, 'and an admin of another flat sees none of this flat''s');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.my_rent()), 0, 'the collector is not charged');
select is((select array_agg(display_name || ':' || amount_pence || ':' || outstanding_pence || ':' || status order by display_name) from public.rent_dashboard(date '2026-11-01')),
  array['Alice:60000:60000:outstanding', 'Bob:60000:40000:part_paid', 'Cara:55000:55000:outstanding', 'Dee:10000:10000:outstanding']::text[],
  'the collector sees everyone''s amounts and statuses for the month');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_dashboard(date '2026-11-01')), 4, 'and so does an admin');
reset role;

-- Rent never touches the shared ledger.
select is((select count(*)::int from public.expenses) + (select count(*)::int from public.expense_shares) + (select count(*)::int from public.settlements), 0,
  'paying, confirming, voiding and waiving rent wrote nothing to the ledger');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.household_balances('a0000000-0000-0000-0000-000000000001') where balance_pence <> 0), 0, 'and every balance is still zero');
reset role;

-- Leaving with unpaid rent is not blocked; admins are told the amount, once.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.leave_household() $sql$, 'someone with unpaid rent can leave');
select is((select count(*)::int from public.my_rent()), 0, 'their rent screen is gone with their membership');
select is((select count(*)::int from public.rent_charges), 0, 'and they can no longer read their charges');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.leave_household() $sql$, 'so can another');
reset role;
select private.recurring_notify_leavers(now());
select private.recurring_notify_leavers(now());
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.sam')::uuid and dedupe_key like 'rent_left_unpaid:%'), 2, 'the collector is told once for each person who left owing');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.dee')::uuid and dedupe_key like 'rent_left_unpaid:%'), 2, 'and so is the other admin');
select is((select count(*)::int from public.notifications where dedupe_key like 'rent_left_unpaid:%' and recipient_id = current_setting('t.alice')::uuid), 0, 'but no member is');
select ok((select string_agg(body, ' ' order by body) from public.notifications where recipient_id = current_setting('t.sam')::uuid and dedupe_key like 'rent_left_unpaid:%') like '%£400.00%£550.00%', 'with the amounts outstanding');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select array_agg(display_name || ':' || still_in_flat::text order by display_name) from public.rent_dashboard(date '2026-11-01')),
  array['Alice:true', 'Bob:false', 'Cara:false', 'Dee:true']::text[], 'the dashboard marks who left, with their rent still on record');
reset role;

-- Deleting an account keeps the charge, shown as "Deleted user".
select public.anonymise_profile('00000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.rent_charges where profile_id = current_setting('t.cara')::uuid), 1, 'the charge stays after the account is deleted');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select display_name from public.rent_dashboard(date '2026-11-01') where amount_pence = 55000), 'Deleted user', 'and an admin sees it as Deleted user');
reset role;

select * from finish();
rollback;
