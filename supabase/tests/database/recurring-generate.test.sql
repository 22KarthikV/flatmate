begin;
select plan(77);

-- Recurring: the monthly generator and variable amounts (SPEC-recurring R2, R3, R7, R8, R9, R12,
-- R13). The job functions take the time as a parameter, so these tests move through it. Dates are
-- built from today so the ledger's own date limits (an expense may be at most 30 days ahead) hold.
--
-- Flat A: Sam (owner, collector), Dee (admin), Alice, Bob, Cara (members).
-- Flat C: Ola (owner), Pat, Sue (members), Quin and Rae (have left).

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'sam@example.com', '{"full_name": "Sam"}'),
  ('00000000-0000-0000-0000-000000000002', 'dee@example.com', '{"full_name": "Dee"}'),
  ('00000000-0000-0000-0000-000000000003', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-000000000004', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-000000000005', 'cara@example.com', '{"full_name": "Cara"}'),
  ('00000000-0000-0000-0000-000000000006', 'zed@example.com', '{"full_name": "Zed"}'),
  ('00000000-0000-0000-0000-000000000011', 'ola@example.com', '{"full_name": "Ola"}'),
  ('00000000-0000-0000-0000-000000000012', 'pat@example.com', '{"full_name": "Pat"}'),
  ('00000000-0000-0000-0000-000000000013', 'quin@example.com', '{"full_name": "Quin"}'),
  ('00000000-0000-0000-0000-000000000014', 'rae@example.com', '{"full_name": "Rae"}'),
  ('00000000-0000-0000-0000-000000000015', 'sue@example.com', '{"full_name": "Sue"}');
select set_config('t.' || split_part(u.email, '@', 1), p.id::text, true)
  from auth.users u join public.profiles p on p.user_id = u.id;

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.sam')::uuid),
  ('b0000000-0000-0000-0000-000000000001', 'Flat B', current_setting('t.zed')::uuid),
  ('c0000000-0000-0000-0000-000000000001', 'Flat C', current_setting('t.ola')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, 'member'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.zed')::uuid, 'owner'),
  ('c0000000-0000-0000-0000-000000000001', current_setting('t.ola')::uuid, 'owner'),
  ('c0000000-0000-0000-0000-000000000001', current_setting('t.pat')::uuid, 'member'),
  ('c0000000-0000-0000-0000-000000000001', current_setting('t.sue')::uuid, 'member');
insert into public.memberships (household_id, profile_id, role, left_at, left_reason) values
  ('c0000000-0000-0000-0000-000000000001', current_setting('t.quin')::uuid, 'member', now(), 'left'),
  ('c0000000-0000-0000-0000-000000000001', current_setting('t.rae')::uuid, 'member', now(), 'left');

-- The due date D, 10 to 14 days from today with a day of the month of 28 or less, and a helper that
-- turns a date into noon in London.
select set_config('t.due', (select d::date::text from generate_series(private.ledger_today() + 10, private.ledger_today() + 14, interval '1 day') d
  where extract(day from d) <= 28 order by d limit 1), true);
select set_config('t.dd', extract(day from current_setting('t.due')::date)::text, true);
create function pg_temp.at(d date) returns timestamptz language sql as
  $$ select ((d + time '12:00') at time zone 'Europe/London') $$;
create function pg_temp.person(p_who text, p_pence bigint) returns jsonb language sql as
  $$ select jsonb_build_object('profile_id', current_setting('t.' || p_who), 'pence', p_pence) $$;

-- Flat A templates: rent, a fixed equal bill for everyone, a variable bill shared by three, and a
-- fixed percentage bill.
insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'rent', 'Rent', current_setting('t.sam')::uuid, current_setting('t.dd')::int, 'fixed', null, 'amounts', current_setting('t.sam')::uuid),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Wi-Fi', current_setting('t.sam')::uuid, current_setting('t.dd')::int, 'fixed', 3200, 'equal', current_setting('t.sam')::uuid),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Gas', current_setting('t.alice')::uuid, current_setting('t.dd')::int, 'variable', null, 'equal', current_setting('t.sam')::uuid),
  ('c4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Boiler cover', current_setting('t.sam')::uuid, current_setting('t.dd')::int, 'fixed', 1000, 'percent', current_setting('t.sam')::uuid);
insert into public.recurring_rooms (id, template_id, household_id, name, rent_pence) values
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Front', 80000),
  ('d2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Big room', 120000),
  ('d3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Box room', 55000);
insert into public.recurring_template_shares (template_id, household_id, profile_id, share_value, room_id) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 80000, 'd1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 60000, 'd2000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 60000, 'd2000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, 55000, 'd3000000-0000-0000-0000-000000000003'),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, null, null),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, null, null),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, null, null),
  ('c4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 7000, null),
  ('c4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 3000, null);

-- ---------------------------------------------------------------------------------------------
-- The window: variable bills appear 14 days ahead, everything else 7; nothing before.
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 15));
select is((select count(*)::int from public.recurring_instances where household_id = 'a0000000-0000-0000-0000-000000000001'), 0, '15 days ahead nothing is created');

select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 14));
select is((select count(*)::int from public.recurring_instances where household_id = 'a0000000-0000-0000-0000-000000000001'), 1, '14 days ahead only the variable bill appears');
select is((select status from public.recurring_instances where template_id = 'c3000000-0000-0000-0000-000000000003'), 'awaiting_amount', 'awaiting its amount');
select is((select expense_id from public.recurring_instances where template_id = 'c3000000-0000-0000-0000-000000000003'), null, 'with no expense yet');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.alice')::uuid and type = 'bill_amount_needed'), 1, 'its payer is asked for the amount');
select is((select count(*)::int from public.notifications where type = 'bill_amount_needed'), 1, 'and nobody else');
select is((select due_on from public.recurring_instances where template_id = 'c3000000-0000-0000-0000-000000000003'), current_setting('t.due')::date, 'the due date is the due day of that month');

select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 8));
select is((select count(*)::int from public.recurring_instances where household_id = 'a0000000-0000-0000-0000-000000000001'), 1, '8 days ahead the rent and fixed bills are still waiting');

select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 7));
select is((select count(*)::int from public.recurring_instances where household_id = 'a0000000-0000-0000-0000-000000000001'), 4, '7 days ahead rent and the fixed bills appear');
select is((select status from public.recurring_instances where template_id = 'c1000000-0000-0000-0000-000000000001'), 'posted', 'the rent month is posted');
select is((select expense_id from public.recurring_instances where template_id = 'c1000000-0000-0000-0000-000000000001'), null, 'and has no expense: rent is not in the ledger');

-- Rent: a charge per person except the collector, with their own pence.
select is((select count(*)::int from public.rent_charges where template_id = 'c1000000-0000-0000-0000-000000000001'), 3, 'three people are charged rent');
select is((select count(*)::int from public.rent_charges where profile_id = current_setting('t.sam')::uuid), 0, 'the collector is not charged');
select is((select array_agg(amount_pence order by amount_pence) from public.rent_charges), array[55000, 60000, 60000]::bigint[], 'each charge is exactly the person''s amount');
select is((select room_name from public.rent_charges where profile_id = current_setting('t.cara')::uuid), 'Box room', 'with a snapshot of their room');
select is((select collector_id from public.rent_charges where profile_id = current_setting('t.cara')::uuid), current_setting('t.sam')::uuid, 'and who they owe');
select is((select due_on from public.rent_charges where profile_id = current_setting('t.cara')::uuid), current_setting('t.due')::date, 'and when');
select is((select count(*)::int from public.notifications where type = 'rent_charged'), 3, 'each person is told about their rent');
select is((select count(*)::int from public.notifications n where n.type = 'rent_charged'
            and not exists (select 1 from public.rent_charges c where c.profile_id = n.recipient_id)), 0, 'and only the people charged are told');
select ok((select n.body || n.title from public.notifications n where n.type = 'rent_charged' and n.recipient_id = current_setting('t.cara')::uuid) like '%£550.00%', 'Cara''s notice carries her own amount');
select is((select count(*)::int from public.notifications where type = 'rent_charged' and (title || body) like '%£550.00%' and recipient_id <> current_setting('t.cara')::uuid), 0, 'and no one else''s notice carries it');

-- A fixed equal bill is an ordinary ledger expense, shared by everyone in the flat.
select is((select count(*)::int from public.expenses where household_id = 'a0000000-0000-0000-0000-000000000001'), 2, 'two ledger expenses: the Wi-Fi and the boiler cover');
select is((select amount_pence from public.expenses e where e.description like 'Wi-Fi, %'), 3200::bigint, 'the Wi-Fi is its fixed amount');
select is((select paid_by from public.expenses e where e.description like 'Wi-Fi, %'), current_setting('t.sam')::uuid, 'paid by its payer');
select is((select category || ':' || occurred_on::text from public.expenses e where e.description like 'Wi-Fi, %'), 'bills:' || current_setting('t.due'), 'dated the due date, in the bills category');
select is((select count(*)::int from public.expense_shares s join public.expenses e on e.id = s.expense_id where e.description like 'Wi-Fi, %'), 5, 'shared by all five people');
select is((select array_agg(share_pence) from public.expense_shares s join public.expenses e on e.id = s.expense_id where e.description like 'Wi-Fi, %'), array[640, 640, 640, 640, 640]::bigint[], 'equally');
select is((select count(*)::int from public.recurring_instances where template_id = 'c2000000-0000-0000-0000-000000000002' and status = 'posted' and expense_id is not null), 1, 'the instance is posted and linked to its expense');
select is((select count(*)::int from public.notifications where type = 'recurring_posted' and dedupe_key like 'recurring_posted:%'), 6, 'the sharers are told: four for the Wi-Fi (not the payer) and two for the boiler cover');
select is((select count(*)::int from public.notifications where type = 'recurring_posted' and recipient_id = current_setting('t.sam')::uuid), 0, 'the payer is not told about their own bill');
select is((select array_agg(share_pence order by share_pence) from public.expense_shares s join public.expenses e on e.id = s.expense_id where e.description like 'Boiler cover, %'), array[300, 700]::bigint[], 'a percentage bill splits 70 and 30');
select is((select count(*)::int from public.expenses where description like 'Rent%'), 0, 'rent never became an expense');
select is((select count(*)::int from public.settlements), 0, 'or a settlement');

-- Balances: only bills move them, and they still add up to exactly zero.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select sum(balance_pence)::bigint from public.household_balances('a0000000-0000-0000-0000-000000000001')), 0::bigint, 'balances sum to zero');
select is((select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') where profile_id = current_setting('t.cara')::uuid), -640::bigint,
  'Cara owes only her Wi-Fi share: her rent is not in the balances');
reset role;

-- Idempotent: the same moment, the next day and a week later change nothing.
create temp table before_counts as
  select (select count(*) from public.recurring_instances) i, (select count(*) from public.expenses) e,
         (select count(*) from public.rent_charges) c, (select count(*) from public.notifications) n,
         (select count(*) from public.expense_shares) s;
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 7));
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 6));
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 1));
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date));
select is(
  (select (select count(*) from public.recurring_instances) = i and (select count(*) from public.expenses) = e
      and (select count(*) from public.rent_charges) = c and (select count(*) from public.notifications) = n
      and (select count(*) from public.expense_shares) = s from before_counts),
  true, 'running again, daily or twice a day, creates nothing new');

-- After the due date a month is never created.
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date + 1));
select is((select count(*)::int from public.recurring_instances where household_id = 'a0000000-0000-0000-0000-000000000001'), 4, 'the day after the due day nothing new appears (next month is not yet in its window)');

-- A missed run is caught up while the month is still due, and a month already past is not back-filled.
insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c5000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Water', current_setting('t.sam')::uuid, current_setting('t.dd')::int, 'fixed', 2000, 'equal', current_setting('t.sam')::uuid);
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 3));
select is((select count(*)::int from public.recurring_instances where template_id = 'c5000000-0000-0000-0000-000000000005'), 1, 'a bill added after its window opened is caught up');
insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c6000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Late', current_setting('t.sam')::uuid, current_setting('t.dd')::int, 'fixed', 2000, 'equal', current_setting('t.sam')::uuid);
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date + 1));
select is((select count(*)::int from public.recurring_instances where template_id = 'c6000000-0000-0000-0000-000000000006'), 0, 'a month whose due date has passed is never created for a new template');

-- Inactive months and skipped months create nothing.
insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by, active_months) values
  ('c7000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Winter only', current_setting('t.sam')::uuid, current_setting('t.dd')::int, 'fixed', 2000, 'equal', current_setting('t.sam')::uuid,
   array[(extract(month from current_setting('t.due')::date)::int % 12) + 1]::smallint[]);
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 7));
select is((select count(*)::int from public.recurring_instances where template_id = 'c7000000-0000-0000-0000-000000000007'), 0, 'a template that is inactive in the due month creates nothing');
insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c8000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Skipped', current_setting('t.sam')::uuid, current_setting('t.dd')::int, 'fixed', 2000, 'equal', current_setting('t.sam')::uuid);
insert into public.recurring_instances (template_id, household_id, period, due_on, status)
values ('c8000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', date_trunc('month', current_setting('t.due')::date)::date, current_setting('t.due')::date, 'skipped');
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 7));
select is((select count(*)::int from public.expenses where description like 'Skipped%'), 0, 'a skipped month creates no expense');
update public.recurring_templates set ended_at = now() where id in ('c5000000-0000-0000-0000-000000000005');

-- A paused or ended template creates nothing.
insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by, paused_at, paused_reason) values
  ('c9000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'bill', 'Paused', current_setting('t.sam')::uuid, current_setting('t.dd')::int, 'fixed', 2000, 'equal', current_setting('t.sam')::uuid, now(), 'admin');
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 7));
select is((select count(*)::int from public.recurring_instances where template_id = 'c9000000-0000-0000-0000-000000000009'), 0, 'a paused template creates nothing');

-- ---------------------------------------------------------------------------------------------
-- Entering a variable amount.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.gas_instance', (select id::text from public.recurring_instances where template_id = 'c3000000-0000-0000-0000-000000000003'), true);
select set_config('t.rent_instance', (select id::text from public.recurring_instances where template_id = 'c1000000-0000-0000-0000-000000000001'), true);
select set_config('t.wifi_instance', (select id::text from public.recurring_instances where template_id = 'c2000000-0000-0000-0000-000000000002'), true);
select throws_ok($sql$ select public.enter_bill_amount(current_setting('t.gas_instance')::uuid, 8450) $sql$, '42501', 'not_allowed', 'only the payer enters the amount, not another member');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.enter_bill_amount(current_setting('t.gas_instance')::uuid, 8450) $sql$, '42501', 'not_allowed', 'nor an admin');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000006", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.enter_bill_amount(current_setting('t.gas_instance')::uuid, 8450) $sql$, 'P0001', 'instance_not_found', 'someone in another flat finds nothing');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.enter_bill_amount(current_setting('t.rent_instance')::uuid, 8450) $sql$, 'P0001', 'instance_not_found', 'a rent month has no amount to enter, even for the collector');
select throws_ok($sql$ select public.enter_bill_amount(current_setting('t.wifi_instance')::uuid, 8450) $sql$, 'P0001', 'instance_not_found', 'nor does a fixed bill');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.enter_bill_amount(current_setting('t.gas_instance')::uuid, 0) $sql$, '22023', 'invalid_amount', 'the amount must be at least 1p');
select throws_ok($sql$ select public.enter_bill_amount(current_setting('t.gas_instance')::uuid, 1000001) $sql$, '22023', 'invalid_amount', 'and at most £10,000');
select set_config('t.gas_expense', public.enter_bill_amount(current_setting('t.gas_instance')::uuid, 8450)::text, true);
select throws_ok($sql$ select public.enter_bill_amount(current_setting('t.gas_instance')::uuid, 8450) $sql$, 'P0001', 'already_entered', 'the amount can be entered once');
reset role;
select is((select status || ':' || (expense_id = current_setting('t.gas_expense')::uuid)::text from public.recurring_instances where id = current_setting('t.gas_instance')::uuid), 'posted:true', 'the month is posted with its expense');
select is((select amount_pence || ':' || paid_by::text || ':' || category from public.expenses where id = current_setting('t.gas_expense')::uuid), '8450:' || current_setting('t.alice') || ':bills', 'paid by Alice, 84.50, in bills');
select is((select sum(share_pence)::bigint from public.expense_shares where expense_id = current_setting('t.gas_expense')::uuid), 8450::bigint, 'the shares add up to the amount');
select is((select count(*)::int from public.expense_shares where expense_id = current_setting('t.gas_expense')::uuid and share_pence in (2816, 2817)), 3, 'split between the three who share it');
select is((select count(*)::int from public.notifications where type = 'recurring_posted' and dedupe_key = 'recurring_posted:' || current_setting('t.gas_instance')), 2, 'the other two sharers are told, once');
select is((select count(*)::int from public.notifications where dedupe_key = 'recurring_posted:' || current_setting('t.gas_instance') and recipient_id = current_setting('t.alice')::uuid), 0, 'and not the payer');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select sum(balance_pence)::bigint from public.household_balances('a0000000-0000-0000-0000-000000000001')), 0::bigint, 'balances still sum to zero after the amount is entered');
reset role;

-- Editing a template changes only future months.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.save_recurring_template('c1000000-0000-0000-0000-000000000001', jsonb_build_object(
  'kind', 'rent', 'name', 'Rent', 'collector_id', current_setting('t.sam'), 'due_day', current_setting('t.dd')::int, 'active_months', '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
  'rooms', jsonb_build_array(
    jsonb_build_object('name', 'Front', 'rent_pence', 90000, 'people', jsonb_build_array(pg_temp.person('sam', 90000))),
    jsonb_build_object('name', 'Rest', 'rent_pence', 200000, 'people', jsonb_build_array(pg_temp.person('alice', 70000), pg_temp.person('bob', 70000), pg_temp.person('cara', 60000)))))) $sql$,
  'an admin raises the rent');
select lives_ok($sql$ select public.save_recurring_template('c2000000-0000-0000-0000-000000000002', jsonb_build_object(
  'kind', 'bill', 'name', 'Wi-Fi', 'paid_by', current_setting('t.sam'), 'due_day', current_setting('t.dd')::int, 'amount_mode', 'fixed', 'amount_pence', 4000,
  'split_mode', 'equal', 'people', '[]'::jsonb, 'active_months', '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb)) $sql$, 'and the Wi-Fi price');
reset role;
select is((select array_agg(amount_pence order by amount_pence) from public.rent_charges), array[55000, 60000, 60000]::bigint[], 'the charges already created are unchanged');
select is((select amount_pence from public.expenses e where e.description like 'Wi-Fi, %'), 3200::bigint, 'and so is the Wi-Fi expense');
select is((select count(*)::int from public.recurring_instances where household_id = 'a0000000-0000-0000-0000-000000000001' and template_id in ('c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002')), 2, 'and no month was created twice');

-- Saving a template whose month is already inside its window creates it at once.
select set_config('t.soon', (select d::date::text from generate_series(private.ledger_today() + 1, private.ledger_today() + 4, interval '1 day') d
  where extract(day from d) <= 28 order by d limit 1), true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.soon_bill', public.save_recurring_template(null, jsonb_build_object(
  'kind', 'bill', 'name', 'Parking', 'paid_by', current_setting('t.sam'), 'due_day', extract(day from current_setting('t.soon')::date)::int, 'amount_mode', 'fixed', 'amount_pence', 1500,
  'split_mode', 'equal', 'people', '[]'::jsonb, 'active_months', '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb))::text, true);
reset role;
select is((select count(*)::int from public.recurring_instances where template_id = current_setting('t.soon_bill')::uuid and due_on = current_setting('t.soon')::date), 1,
  'a bill saved inside its window appears straight away');

-- ---------------------------------------------------------------------------------------------
-- Flat C: leavers. Quin (a share in the rent and the percentage bill) and Rae (the payer of a bill)
-- have left. Sue joined and has no room.
insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'rent', 'Rent', current_setting('t.ola')::uuid, current_setting('t.dd')::int, 'fixed', null, 'amounts', current_setting('t.ola')::uuid),
  ('cb000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'bill', 'Wi-Fi', current_setting('t.ola')::uuid, current_setting('t.dd')::int, 'fixed', 3000, 'equal', current_setting('t.ola')::uuid),
  ('cc000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', 'bill', 'Boiler cover', current_setting('t.ola')::uuid, current_setting('t.dd')::int, 'fixed', 1000, 'percent', current_setting('t.ola')::uuid),
  ('cd000000-0000-0000-0000-00000000000d', 'c0000000-0000-0000-0000-000000000001', 'bill', 'Contents insurance', current_setting('t.rae')::uuid, current_setting('t.dd')::int, 'fixed', 1000, 'equal', current_setting('t.ola')::uuid),
  ('ce000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-000000000001', 'bill', 'Gas', current_setting('t.ola')::uuid, current_setting('t.dd')::int, 'variable', null, 'equal', current_setting('t.ola')::uuid),
  ('cf000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-000000000001', 'rent', 'Other rent', current_setting('t.ola')::uuid, current_setting('t.dd')::int, 'fixed', null, 'amounts', current_setting('t.ola')::uuid);
insert into public.recurring_template_shares (template_id, household_id, profile_id, share_value) values
  ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', current_setting('t.ola')::uuid, 50000),
  ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', current_setting('t.pat')::uuid, 40000),
  ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', current_setting('t.quin')::uuid, 40000),
  ('cc000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', current_setting('t.pat')::uuid, 5000),
  ('cc000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', current_setting('t.quin')::uuid, 5000),
  ('ce000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-000000000001', current_setting('t.pat')::uuid, null),
  ('ce000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-000000000001', current_setting('t.quin')::uuid, null),
  ('cf000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-000000000001', current_setting('t.ola')::uuid, 30000);
-- A month that was created earlier, while everyone was here: it must stay exactly as it is.
insert into public.recurring_instances (id, template_id, household_id, period, due_on, status) values
  ('ee000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', (date_trunc('month', current_setting('t.due')::date) - interval '1 month')::date, (date_trunc('month', current_setting('t.due')::date) - interval '1 month')::date + 5, 'posted');
insert into public.rent_charges (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on)
values ('c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a', 'ee000000-0000-0000-0000-000000000001', (date_trunc('month', current_setting('t.due')::date) - interval '1 month')::date, current_setting('t.quin')::uuid, current_setting('t.ola')::uuid, 40000, (date_trunc('month', current_setting('t.due')::date) - interval '1 month')::date + 5);

select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 14));
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 7));
select is((select array_agg(paused_reason order by name) from public.recurring_templates where household_id = 'c0000000-0000-0000-0000-000000000001' and paused_at is not null),
  array['member_left', 'payer_left', 'member_left']::text[], 'the rent and percentage bill with a leaver, and the bill whose payer left, are paused with their reasons');
select is((select name from public.recurring_templates where id = 'cb000000-0000-0000-0000-00000000000b' and paused_at is null), 'Wi-Fi', 'an equal bill is not paused');
select is((select count(*)::int from public.recurring_instances where household_id = 'c0000000-0000-0000-0000-000000000001' and template_id in ('ca000000-0000-0000-0000-00000000000a', 'cc000000-0000-0000-0000-00000000000c', 'cd000000-0000-0000-0000-00000000000d')), 1,
  'a paused template creates no new month (only the earlier rent month exists)');
select is((select count(*)::int from public.rent_charges where template_id = 'ca000000-0000-0000-0000-00000000000a'), 1, 'the earlier charge is unchanged');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.ola')::uuid and type = 'recurring_attention' and dedupe_key like 'recurring_paused:%'), 3, 'every admin is told about each pause, once, however often the job runs');
select is((select count(*)::int from public.notifications where household_id = 'c0000000-0000-0000-0000-000000000001' and recipient_id <> current_setting('t.ola')::uuid and type = 'recurring_attention'), 0, 'and only admins');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.ola')::uuid and type = 'recurring_attention' and dedupe_key like 'rent_noroom:%'), 2, 'Pat and Sue have no room in the running rent: admins are told once each');
select is((select count(*)::int from public.notifications where type = 'recurring_attention' and (title || body) ~ '£'), 0, 'the admin notices carry no amounts');
select is((select count(*)::int from public.recurring_instances where template_id = 'cb000000-0000-0000-0000-00000000000b'), 1, 'the equal bill was created');
select is((select array_agg(share_pence order by share_pence) from public.expense_shares s join public.expenses e on e.id = s.expense_id where e.household_id = 'c0000000-0000-0000-0000-000000000001' and e.description like 'Wi-Fi%'), array[1000, 1000, 1000]::bigint[],
  'split over the three people who are in the flat');
select is((select count(*)::int from public.recurring_instances where template_id = 'ce000000-0000-0000-0000-00000000000e' and status = 'awaiting_amount'), 1, 'a variable bill still shared by someone who remains carries on');

-- An admin edits the rent for who is left and resumes it: the month is created on the next run.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000011", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.save_recurring_template('ca000000-0000-0000-0000-00000000000a', jsonb_build_object(
  'kind', 'rent', 'name', 'Rent', 'collector_id', current_setting('t.ola'), 'due_day', current_setting('t.dd')::int, 'active_months', '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
  'rooms', jsonb_build_array(
    jsonb_build_object('name', 'Front', 'rent_pence', 50000, 'people', jsonb_build_array(pg_temp.person('ola', 50000))),
    jsonb_build_object('name', 'Rest', 'rent_pence', 70000, 'people', jsonb_build_array(pg_temp.person('pat', 35000), pg_temp.person('sue', 35000)))))) $sql$, 'the admin edits the rooms');
select lives_ok($sql$ select public.resume_recurring_template('ca000000-0000-0000-0000-00000000000a') $sql$, 'and resumes the rent');
reset role;
select private.recurring_generate(pg_temp.at(current_setting('t.due')::date - 6));
select is((select array_agg(amount_pence order by amount_pence) from public.rent_charges where template_id = 'ca000000-0000-0000-0000-00000000000a' and due_on = current_setting('t.due')::date), array[35000, 35000]::bigint[], 'the next run creates the month from the new setup');

select * from finish();
rollback;
