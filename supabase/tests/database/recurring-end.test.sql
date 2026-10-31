begin;
select plan(19);

-- Recurring: ending a rent or bill cancels its upcoming months that nobody has paid, so a replacement
-- template does not leave the old charges counting too.
-- Flat A: Sam (owner and collector), Alice and Bob (members). Rent R1 has three months: one already
-- due and unpaid (kept), one coming with a payment from Bob waiting (kept), one coming and untouched
-- (cancelled). A second rent R2 shows the clean-up helper and a variable bill shows the bill case.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'sam@example.com', '{"full_name": "Sam"}'),
  ('00000000-0000-0000-0000-000000000003', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-000000000004', 'bob@example.com', '{"full_name": "Bob"}');
select set_config('t.' || split_part(u.email, '@', 1), p.id::text, true)
  from auth.users u join public.profiles p on p.user_id = u.id;
select set_config('t.today', private.ledger_today()::text, true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.sam')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member');

insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'rent', 'Rent', current_setting('t.sam')::uuid, 6, 'fixed', null, 'amounts', current_setting('t.sam')::uuid),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'rent', 'Old rent', current_setting('t.sam')::uuid, 6, 'fixed', null, 'amounts', current_setting('t.sam')::uuid),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Gas', current_setting('t.alice')::uuid, 6, 'variable', null, 'equal', current_setting('t.sam')::uuid);

insert into public.recurring_instances (id, template_id, household_id, period, due_on, status) values
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
    date_trunc('month', current_setting('t.today')::date - 40)::date, current_setting('t.today')::date - 40, 'posted'),
  ('e2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
    date_trunc('month', current_setting('t.today')::date + 10)::date, current_setting('t.today')::date + 10, 'posted'),
  ('e3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
    date_trunc('month', current_setting('t.today')::date + 45)::date, current_setting('t.today')::date + 45, 'posted'),
  ('e4000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
    date_trunc('month', current_setting('t.today')::date + 10)::date, current_setting('t.today')::date + 10, 'posted'),
  ('e5000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
    date_trunc('month', current_setting('t.today')::date + 10)::date, current_setting('t.today')::date + 10, 'awaiting_amount');

-- Alice is charged for every month; Bob only for the coming ones.
insert into public.rent_charges (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on)
select 'a0000000-0000-0000-0000-000000000001', i.template_id, i.id, i.period, who.id, current_setting('t.sam')::uuid, 60000, i.due_on
  from public.recurring_instances i
  cross join lateral (values (current_setting('t.alice')::uuid), (current_setting('t.bob')::uuid)) as who(id)
 where i.template_id in ('c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002')
   and (who.id = current_setting('t.alice')::uuid or i.id <> 'e1000000-0000-0000-0000-000000000001');

-- Bob says he has paid the coming month on R1; it is waiting for Sam.
insert into public.rent_payments (household_id, template_id, payer_id, collector_id, amount_pence, status) values
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 60000, 'pending');

select ok(
  not has_function_privilege('anon', 'public.end_recurring_template(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.end_recurring_template(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.recurring_cancel_unpaid(uuid)', 'execute'),
  'ending is for signed-in people; the cancelling helper is private'
);

-- Ending R1 as Sam.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is(public.end_recurring_template('c1000000-0000-0000-0000-000000000001'), 1, 'ending a rent says how many months it cancelled');
reset role;

select is((select status from public.recurring_instances where id = 'e3000000-0000-0000-0000-000000000003'), 'cancelled', 'the coming month nobody has paid is cancelled');
select is((select status from public.recurring_instances where id = 'e2000000-0000-0000-0000-000000000002'), 'posted', 'a coming month with a payment waiting is kept');
select is((select status from public.recurring_instances where id = 'e1000000-0000-0000-0000-000000000001'), 'posted', 'and a month already due is kept, because the rent was owed');
select is((select count(*)::int from private.rent_charge_status('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid) where template_id = 'c1000000-0000-0000-0000-000000000001'),
  2, 'the cancelled month no longer counts as a charge');
select is((select sum(outstanding_pence)::bigint from private.rent_charge_status('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid) where template_id = 'c1000000-0000-0000-0000-000000000001'),
  120000::bigint, 'so Alice owes 1,200.00 on it, not 1,800.00');
select is((select detail->>'cancelled_months' from public.recurring_template_log where template_id = 'c1000000-0000-0000-0000-000000000001' and change = 'ended'),
  '1', 'the log says what ending cancelled');
select is((select count(*)::int from public.rent_charges where template_id = 'c1000000-0000-0000-0000-000000000001'), 5, 'no charge row is deleted');

-- What people see.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.my_rent() where template_id = 'c1000000-0000-0000-0000-000000000001'), 2, 'my rent leaves out the cancelled month');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_dashboard((select period from public.recurring_instances where id = 'e3000000-0000-0000-0000-000000000003'))), 0, 'and so does the who-has-paid page');
reset role;

-- A month that has been cancelled stays that way, and the history is never rewritten.
select throws_ok($sql$ update public.recurring_instances set status = 'posted' where id = 'e3000000-0000-0000-0000-000000000003' $sql$,
  'P0001', 'recurring_is_append_only', 'a cancelled month cannot be brought back');
select throws_ok($sql$ delete from public.recurring_instances where id = 'e3000000-0000-0000-0000-000000000003' $sql$,
  'P0001', 'recurring_is_append_only', 'or deleted');
select throws_ok($sql$ update public.recurring_instances set due_on = due_on + 1 where id = 'e3000000-0000-0000-0000-000000000003' $sql$,
  'P0001', 'recurring_is_append_only', 'and nothing about it may be edited');

-- The clean-up helper, as the migration runs it for templates ended earlier.
select is(private.recurring_cancel_unpaid('c2000000-0000-0000-0000-000000000002'), 1, 'the helper cancels an old ended rent''s unpaid coming month');
select is(private.recurring_cancel_unpaid('c2000000-0000-0000-0000-000000000002'), 0, 'and running it again does nothing more');

-- A bill still waiting for its amount is cancelled when the bill is ended; one already posted is not.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is(public.end_recurring_template('c3000000-0000-0000-0000-000000000003'), 1, 'ending a bill cancels the month still waiting for an amount');
reset role;
select is((select status from public.recurring_instances where id = 'e5000000-0000-0000-0000-000000000005'), 'cancelled', 'so nobody is asked for that amount');
select is(private.recurring_cancel_unpaid('c3000000-0000-0000-0000-000000000003'), 0, 'and nothing is left to cancel');

select * from finish();
rollback;
