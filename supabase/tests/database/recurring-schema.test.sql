begin;
select plan(105);

-- Recurring: tables, rent privacy, append-only rows and the SQL bill split (SPEC-recurring R2, R6,
-- R9, R16, R18, R21). Flat A: Sam (owner and rent collector), Dee (admin), Alice and Bob (members
-- who share a room) and Cara (a member with a private room). Flat B: Zed (owner) and Yan.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'sam@example.com', '{"full_name": "Sam"}'),
  ('00000000-0000-0000-0000-000000000002', 'dee@example.com', '{"full_name": "Dee"}'),
  ('00000000-0000-0000-0000-000000000003', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-000000000004', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-000000000005', 'cara@example.com', '{"full_name": "Cara"}'),
  ('00000000-0000-0000-0000-000000000006', 'zed@example.com', '{"full_name": "Zed"}'),
  ('00000000-0000-0000-0000-000000000007', 'yan@example.com', '{"full_name": "Yan"}');
select set_config('t.sam', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'), true);
select set_config('t.dee', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000002'), true);
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000003'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000004'), true);
select set_config('t.cara', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000005'), true);
select set_config('t.zed', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000006'), true);
select set_config('t.yan', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000007'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.sam')::uuid),
  ('b0000000-0000-0000-0000-000000000001', 'Flat B', current_setting('t.zed')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, 'member'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.zed')::uuid, 'owner'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.yan')::uuid, 'member');

-- The rent: Sam's room, a room shared by Alice and Bob, and Cara's private room.
insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'rent', 'Rent', current_setting('t.sam')::uuid, 6, 'fixed', null, 'amounts', current_setting('t.sam')::uuid),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Gas', current_setting('t.alice')::uuid, 12, 'variable', null, 'equal', current_setting('t.sam')::uuid),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Wi-Fi', current_setting('t.sam')::uuid, 12, 'fixed', 3200, 'equal', current_setting('t.sam')::uuid);
insert into public.recurring_rooms (id, template_id, household_id, name, rent_pence) values
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Front', 80000),
  ('d2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Big room', 120000),
  ('d3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Box room', 55000);
insert into public.recurring_template_shares (template_id, household_id, profile_id, share_value, room_id) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 80000, 'd1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 60000, 'd2000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 60000, 'd2000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, 55000, 'd3000000-0000-0000-0000-000000000003'),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, null, null),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, null, null);
insert into public.recurring_instances (id, template_id, household_id, period, due_on, status) values
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-06', 'posted'),
  ('e2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-12', 'awaiting_amount');
insert into public.rent_charges (id, household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on, room_name) values
  ('f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 60000, '2026-11-06', 'Big room'),
  ('f2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 60000, '2026-11-06', 'Big room'),
  ('f3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.cara')::uuid, current_setting('t.sam')::uuid, 55000, '2026-11-06', 'Box room');
insert into public.rent_payments (id, household_id, template_id, payer_id, collector_id, amount_pence, status) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 60000, 'pending');
insert into public.rent_payments (id, household_id, template_id, payer_id, collector_id, amount_pence, status, decided_by, decided_at) values
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 60000, 'confirmed', current_setting('t.sam')::uuid, now());
insert into public.recurring_template_log (template_id, household_id, changed_by, change, detail) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'created', '{"total": 255000}'),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'created', '{}');

-- ---------------------------------------------------------------------------------------------
-- Notification types: fixed generic push text, no amounts.
select is(
  (select count(*)::int from public.notification_types
    where type in ('rent_charged', 'recurring_posted', 'recurring_reminder', 'bill_amount_needed',
                   'rent_payment_pending', 'rent_payment_decided', 'recurring_attention')),
  7, 'the seven recurring notification types exist'
);
select is(
  (select count(*)::int from public.notification_types
    where type in ('rent_charged', 'recurring_posted', 'recurring_reminder', 'bill_amount_needed',
                   'rent_payment_pending', 'rent_payment_decided', 'recurring_attention')
      and (push_title is null or push_body is null or push_title ~ '[£0-9]' or push_body ~ '[£0-9]')),
  0, 'each has generic push text with no currency sign or digits'
);
select is(
  (select array_agg(type order by type) from public.notification_types where type in
    ('rent_charged', 'recurring_posted', 'recurring_reminder', 'bill_amount_needed',
     'rent_payment_pending', 'rent_payment_decided', 'recurring_attention') and snoozable),
  array['recurring_reminder'], 'only the rent reminder can be snoozed'
);
select is(
  (select default_push from public.notification_types where type = 'recurring_attention'),
  false, 'the admin attention notice is inbox only'
);

-- ---------------------------------------------------------------------------------------------
-- Rent privacy. Alice shares a room with Bob; she must see only her own.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.recurring_templates), 2, 'Alice sees the two bills and not the rent template');
select is((select count(*)::int from public.recurring_templates where kind = 'rent'), 0, 'the rent template returns no rows');
select is((select count(*)::int from public.recurring_rooms), 0, 'she sees no rooms');
select is((select count(*)::int from public.recurring_template_shares where template_id = 'c1000000-0000-0000-0000-000000000001'), 0,
  'she sees no rent shares: not her own, not her roommate''s');
select is((select count(*)::int from public.recurring_template_shares where template_id = 'c2000000-0000-0000-0000-000000000002'), 2,
  'but she does see who shares a bill');
select is((select count(*)::int from public.recurring_template_log), 1, 'she sees the bill''s change log and not the rent''s');
select is((select count(*)::int from public.recurring_instances), 2, 'she sees that a rent month and a bill month exist');
select is((select count(*)::int from public.rent_charges), 1, 'she sees one rent charge');
select is((select amount_pence from public.rent_charges), 60000::bigint, 'and it is her own');
select is((select count(*)::int from public.rent_charges where profile_id = current_setting('t.bob')::uuid), 0, 'her roommate''s charge returns zero rows');
select is((select count(*)::int from public.rent_charges where profile_id = current_setting('t.cara')::uuid), 0, 'so does the private room''s');
select is((select sum(amount_pence)::bigint from public.rent_charges), 60000::bigint, 'the total she can add up is only her own, not the rent total');
select is((select count(*)::int from public.rent_payments), 1, 'she sees one rent payment');
select is((select count(*)::int from public.rent_payments where payer_id = current_setting('t.bob')::uuid), 0, 'her roommate''s payment returns zero rows');
select is((select count(*)::int from public.rent_payments where payer_id = current_setting('t.alice')::uuid), 1, 'and her own is there');
select is((select count(*)::int from public.recurring_instances where expense_id is not null), 0, 'a rent instance carries no money, so nothing leaks through it');
reset role;

-- Cara, who has a private room, sees only hers.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_charges), 1, 'Cara sees one charge');
select is((select amount_pence from public.rent_charges), 55000::bigint, 'her own');
select is((select count(*)::int from public.rent_payments), 0, 'and no payments, because none of them are hers');
select is((select count(*)::int from public.recurring_rooms), 0, 'and no rooms');
reset role;

-- Dee is an admin and Sam the owner and collector: both see everything about rent.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.recurring_templates), 3, 'an admin sees all templates');
select is((select count(*)::int from public.recurring_rooms), 3, 'all rooms');
select is((select count(*)::int from public.recurring_template_shares), 6, 'all shares');
select is((select count(*)::int from public.rent_charges), 3, 'all rent charges');
select is((select count(*)::int from public.rent_payments), 2, 'all rent payments');
select is((select count(*)::int from public.recurring_template_log), 2, 'and the whole change log');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_charges), 3, 'the collector sees all rent charges');
select is((select count(*)::int from public.rent_payments), 2, 'and all rent payments');
select is((select count(*)::int from public.recurring_rooms), 3, 'and the rooms');

-- Nobody writes directly, not even an admin.
select throws_ok($sql$ insert into public.recurring_templates (household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by)
  values ('a0000000-0000-0000-0000-000000000001', 'bill', 'Sneaky', current_setting('t.sam')::uuid, 1, 'fixed', 100, 'equal', current_setting('t.sam')::uuid) $sql$,
  '42501', null, 'an admin cannot insert a template directly');
select throws_ok($sql$ update public.recurring_templates set name = 'Renamed' $sql$, '42501', null, 'cannot update a template directly');
select throws_ok($sql$ delete from public.recurring_templates $sql$, '42501', null, 'cannot delete a template directly');
select throws_ok($sql$ insert into public.recurring_rooms (template_id, household_id, name, rent_pence)
  values ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'X', 100) $sql$,
  '42501', null, 'cannot insert a room directly');
select throws_ok($sql$ insert into public.recurring_template_shares (template_id, household_id, profile_id)
  values ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid) $sql$,
  '42501', null, 'cannot insert a share directly');
select throws_ok($sql$ insert into public.recurring_instances (template_id, household_id, period, due_on, status)
  values ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-12-01', '2026-12-12', 'skipped') $sql$,
  '42501', null, 'cannot insert an instance directly');
select throws_ok($sql$ insert into public.rent_charges (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on)
  values ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.sam')::uuid, current_setting('t.sam')::uuid, 100, '2026-11-06') $sql$,
  '42501', null, 'cannot insert a charge directly');
select throws_ok($sql$ update public.rent_charges set amount_pence = 1 $sql$, '42501', null, 'cannot update a charge directly');
select throws_ok($sql$ delete from public.rent_charges $sql$, '42501', null, 'cannot delete a charge directly');
select throws_ok($sql$ insert into public.rent_payments (household_id, template_id, payer_id, collector_id, amount_pence, status)
  values ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 100, 'pending') $sql$,
  '42501', null, 'cannot insert a payment directly');
select throws_ok($sql$ update public.rent_payments set status = 'confirmed' $sql$, '42501', null, 'cannot decide a payment directly');
select throws_ok($sql$ delete from public.rent_payments $sql$, '42501', null, 'cannot delete a payment directly');
select throws_ok($sql$ insert into public.recurring_template_log (template_id, household_id, changed_by, change)
  values ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'edited') $sql$,
  '42501', null, 'cannot write the change log directly');
reset role;

-- Another flat sees nothing of this one; anon sees nothing at all.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000006", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.recurring_templates), 0, 'Flat B''s owner sees none of Flat A''s templates');
select is((select count(*)::int from public.rent_charges), 0, 'or its rent charges');
select is((select count(*)::int from public.rent_payments), 0, 'or its rent payments');
select is((select count(*)::int from public.recurring_instances), 0, 'or its instances');
select is((select count(*)::int from public.recurring_rooms), 0, 'or its rooms');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000007", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.recurring_template_shares), 0, 'a Flat B member sees none of its shares');
reset role;

set local role anon;
select throws_ok($sql$ select count(*) from public.recurring_templates $sql$, '42501', null, 'anon cannot read templates');
select throws_ok($sql$ select count(*) from public.rent_charges $sql$, '42501', null, 'anon cannot read rent charges');
select throws_ok($sql$ select count(*) from public.rent_payments $sql$, '42501', null, 'anon cannot read rent payments');
select throws_ok($sql$ select count(*) from public.recurring_instances $sql$, '42501', null, 'anon cannot read instances');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Append-only and integrity, even for the database owner.
select throws_ok($sql$ insert into public.recurring_instances (template_id, household_id, period, due_on, status)
  values ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-06', 'skipped') $sql$,
  '23505', null, 'a month cannot be created twice for the same template');
select throws_ok($sql$ insert into public.rent_charges (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on)
  values ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-11-01', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 100, '2026-11-06') $sql$,
  '23505', null, 'a person cannot be charged twice for the same month');
select throws_ok($sql$ update public.recurring_instances set due_on = '2026-11-07' where id = 'e2000000-0000-0000-0000-000000000002' $sql$,
  'P0001', 'recurring_is_append_only', 'an instance cannot be changed other than awaiting amount to posted');
select throws_ok($sql$ update public.recurring_instances set status = 'skipped' where id = 'e2000000-0000-0000-0000-000000000002' $sql$,
  'P0001', 'recurring_is_append_only', 'an awaiting instance cannot become skipped');
select throws_ok($sql$ delete from public.recurring_instances $sql$, 'P0001', 'recurring_is_append_only', 'an instance cannot be deleted');
select throws_ok($sql$ update public.rent_charges set amount_pence = 1 $sql$, 'P0001', 'recurring_is_append_only', 'a charge cannot be updated');
select throws_ok($sql$ delete from public.rent_charges $sql$, 'P0001', 'recurring_is_append_only', 'a charge cannot be deleted');
select throws_ok($sql$ update public.recurring_template_log set change = 'x' $sql$, 'P0001', 'recurring_is_append_only', 'the change log cannot be updated');
select throws_ok($sql$ delete from public.recurring_template_log $sql$, 'P0001', 'recurring_is_append_only', 'or deleted');
select throws_ok($sql$ delete from public.recurring_templates $sql$, 'P0001', 'recurring_is_append_only', 'a template cannot be deleted (it is ended instead)');
select throws_ok($sql$ update public.recurring_templates set kind = 'bill', amount_mode = 'variable', split_mode = 'equal' where kind = 'rent' $sql$,
  'P0001', 'recurring_is_append_only', 'a template cannot change kind');
select throws_ok($sql$ truncate public.rent_charges $sql$, 'P0001', 'recurring_is_append_only', 'rent charges cannot be truncated');
select throws_ok($sql$ truncate public.rent_payments $sql$, 'P0001', 'recurring_is_append_only', 'rent payments cannot be truncated');
select lives_ok($sql$ update public.recurring_templates set name = 'Rent 2', paused_at = now(), paused_reason = 'admin' where kind = 'rent' $sql$,
  'a template can be edited and paused (by the functions that come later)');

-- An instance is posted once, with a real ledger expense behind it.
select set_config('t.expense', private.ledger_write_expense(
  'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, null, 8450, 'Gas, November 2026', 'bills', '2026-11-12',
  current_setting('t.alice')::uuid, array[current_setting('t.alice')::uuid, current_setting('t.bob')::uuid], array[4225::bigint, 4225::bigint]
)::text, true);
select lives_ok($sql$ update public.recurring_instances set status = 'posted', expense_id = current_setting('t.expense')::uuid
  where id = 'e2000000-0000-0000-0000-000000000002' $sql$, 'awaiting amount becomes posted once, with its expense');
select throws_ok($sql$ update public.recurring_instances set status = 'awaiting_amount', expense_id = null where id = 'e2000000-0000-0000-0000-000000000002' $sql$,
  'P0001', 'recurring_is_append_only', 'and never goes back');

-- Payments change at most twice: one decision, one void.
select throws_ok($sql$ update public.rent_payments set amount_pence = 1 where id = 'a1000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'recurring_is_append_only', 'a payment''s amount cannot be changed');
select lives_ok($sql$ update public.rent_payments set status = 'confirmed', decided_by = current_setting('t.sam')::uuid, decided_at = now()
  where id = 'a1000000-0000-0000-0000-000000000001' $sql$, 'a pending payment can be decided once');
select throws_ok($sql$ update public.rent_payments set status = 'declined', decided_by = current_setting('t.sam')::uuid, decided_at = now()
  where id = 'a1000000-0000-0000-0000-000000000001' $sql$, 'P0001', 'recurring_is_append_only', 'but not decided again');
select lives_ok($sql$ update public.rent_payments set voided_at = now(), voided_by = current_setting('t.sam')::uuid
  where id = 'a1000000-0000-0000-0000-000000000001' $sql$, 'a confirmed payment can be voided once');
select throws_ok($sql$ update public.rent_payments set voided_at = now(), voided_by = current_setting('t.dee')::uuid
  where id = 'a1000000-0000-0000-0000-000000000001' $sql$, 'P0001', 'recurring_is_append_only', 'but not voided again');
select throws_ok($sql$ delete from public.rent_payments $sql$, 'P0001', 'recurring_is_append_only', 'a payment cannot be deleted');

-- Constraints.
select throws_ok($sql$ insert into public.recurring_templates (household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by)
  values ('a0000000-0000-0000-0000-000000000001', 'bill', 'Bad day', current_setting('t.sam')::uuid, 29, 'fixed', 100, 'equal', current_setting('t.sam')::uuid) $sql$,
  '23514', null, 'a due day above 28 is refused');
select throws_ok($sql$ insert into public.recurring_templates (household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by)
  values ('a0000000-0000-0000-0000-000000000001', 'bill', 'No amount', current_setting('t.sam')::uuid, 1, 'fixed', null, 'equal', current_setting('t.sam')::uuid) $sql$,
  '23514', null, 'a fixed bill needs an amount');
select throws_ok($sql$ insert into public.recurring_templates (household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by)
  values ('a0000000-0000-0000-0000-000000000001', 'bill', 'Has amount', current_setting('t.sam')::uuid, 1, 'variable', 100, 'equal', current_setting('t.sam')::uuid) $sql$,
  '23514', null, 'a variable bill has no amount');
select throws_ok($sql$ insert into public.recurring_templates (household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by)
  values ('a0000000-0000-0000-0000-000000000001', 'rent', 'Rent with amount', current_setting('t.sam')::uuid, 1, 'fixed', 100, 'amounts', current_setting('t.sam')::uuid) $sql$,
  '23514', null, 'rent keeps its money in the rooms, not on the template');
select throws_ok($sql$ insert into public.recurring_templates (household_id, kind, name, paid_by, due_day, amount_mode, split_mode, created_by, active_months)
  values ('a0000000-0000-0000-0000-000000000001', 'bill', 'No months', current_setting('t.sam')::uuid, 1, 'variable', 'equal', current_setting('t.sam')::uuid, '{}') $sql$,
  '23514', null, 'at least one active month is needed');
select throws_ok($sql$ insert into public.rent_payments (household_id, template_id, payer_id, collector_id, kind, amount_pence, status)
  values ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 'waiver', 100, 'confirmed') $sql$,
  '23514', null, 'a waiver needs a reason (and a decider)');
select throws_ok($sql$ insert into public.recurring_instances (template_id, household_id, period, due_on, status)
  values ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '2026-11-06', '2026-11-12', 'skipped') $sql$,
  '23514', null, 'a period must be the first of a month');

-- ---------------------------------------------------------------------------------------------
-- The SQL bill split gives the shared vectors (these copy src/features/recurring/parity-vectors.ts).
create temp table vectors (name text, mode text, amount bigint, ids uuid[], points integer[], expected bigint[]);
insert into vectors values
  ('equal, divides evenly', 'equal', 900, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[], null, array[300,300,300]),
  ('equal, one penny over', 'equal', 1000, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[], null, array[334,333,333]),
  ('equal, two pence over', 'equal', 1001, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[], null, array[334,334,333]),
  ('equal, input order', 'equal', 1000, array['00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a']::uuid[], null, array[334,333,333]),
  ('equal, 1p between three', 'equal', 1, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[], null, array[1,0,0]),
  ('equal, five people', 'equal', 10000, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000e']::uuid[], null, array[2000,2000,2000,2000,2000]),
  ('equal, the largest amount', 'equal', 1000000, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[], null, array[333334,333333,333333]),
  ('equal, one person', 'equal', 3200, array['00000000-0000-0000-0000-00000000000b']::uuid[], null, array[3200]),
  ('percent, half each', 'percent', 1000, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b']::uuid[], array[5000,5000], array[500,500]),
  ('percent, seventy thirty', 'percent', 700, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b']::uuid[], array[7000,3000], array[490,210]),
  ('percent, thirds', 'percent', 1000, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[], array[3333,3333,3334], array[333,333,334]),
  ('percent, two leftover pence', 'percent', 999, array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[], array[3333,3333,3334], array[333,333,333]),
  ('percent, a tie goes to the lowest id', 'percent', 1, array['00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a']::uuid[], array[5000,5000], array[1,0]),
  ('percent, one person at 100', 'percent', 4321, array['00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000a']::uuid[], array[10000,0], array[0,4321]);
-- Expected values are listed in sorted-id order; the first and last vectors above with unsorted
-- input list their expected pence by sorted id as well.
select is(
  (select array_agg(pence order by profile_id) from private.recurring_split_bill(v.amount, v.mode, v.ids, v.points)),
  v.expected, 'SQL split: ' || v.name
) from vectors v order by v.name;

select is(
  (select count(*)::int from (
     select s.profile_id from generate_series(1, 400) g,
       lateral private.recurring_split_bill((g * 2503 % 1000000) + 1, 'equal',
         (select array_agg(('00000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid) from generate_series(1, 1 + g % 7) i)) s
   ) x),
  (select sum(1 + g % 7)::int from generate_series(1, 400) g), 'the SQL split returns every person'
);
select is(
  (select count(*)::int from (
     select g from generate_series(1, 400) g
      where (select sum(pence) from private.recurring_split_bill((g * 2503 % 1000000) + 1, 'equal',
         (select array_agg(('00000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid) from generate_series(1, 1 + g % 7) i))) <> (g * 2503 % 1000000) + 1
   ) bad),
  0, 'and the shares always add up to the total (400 cases)'
);
select throws_ok($sql$ select * from private.recurring_split_bill(1000, 'percent', array['00000000-0000-0000-0000-00000000000a']::uuid[], array[9000]) $sql$,
  '22023', 'invalid_shares', 'percentages must add up to 100');
select throws_ok($sql$ select * from private.recurring_split_bill(0, 'equal', array['00000000-0000-0000-0000-00000000000a']::uuid[]) $sql$,
  '22023', 'invalid_amount', 'the amount must be positive');
select throws_ok($sql$ select * from private.recurring_split_bill(100, 'equal', array[]::uuid[]) $sql$,
  '22023', 'invalid_shares', 'someone must share it');
select ok(
  not has_function_privilege('authenticated', 'private.recurring_split_bill(bigint, text, uuid[], integer[])', 'execute')
  and not has_function_privilege('anon', 'private.recurring_split_bill(bigint, text, uuid[], integer[])', 'execute'),
  'nobody in the browser can call the split function'
);

select * from finish();
rollback;
