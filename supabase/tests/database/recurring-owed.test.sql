begin;
select plan(8);

-- Recurring: rent_owed_to_me, the rent a person is still owed as its collector, per payer.
-- Flat A: Sam (owner, collects Rent), Alice (member, collects Parking), Bob (member), Cara (member).
-- Rent: Alice has Oct and Nov at 600.00 with 200.00 confirmed; Bob has Nov 600.00 with 600.00 pending;
-- Cara has Nov 600.00 untouched. Parking: Bob owes Alice 100.00. Flat B has its own owner.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'sam@example.com', '{"full_name": "Sam"}'),
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
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, 'member'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.zed')::uuid, 'owner');

insert into public.recurring_templates (id, household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'rent', 'Rent', current_setting('t.sam')::uuid, 6, 'fixed', null, 'amounts', current_setting('t.sam')::uuid),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'rent', 'Parking', current_setting('t.alice')::uuid, 6, 'fixed', null, 'amounts', current_setting('t.sam')::uuid);
insert into public.recurring_instances (id, template_id, household_id, period, due_on, status) values
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-10-01', '2026-10-06', 'posted'),
  ('e2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-06', 'posted'),
  ('e3000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-06', 'posted');
insert into public.rent_charges (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on) values
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-10-01', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 60000, '2026-10-06'),
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', '2026-11-01', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 60000, '2026-11-06'),
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', '2026-11-01', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 60000, '2026-11-06'),
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', '2026-11-01', current_setting('t.cara')::uuid, current_setting('t.sam')::uuid, 60000, '2026-11-06'),
  ('a0000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000003', '2026-11-01', current_setting('t.bob')::uuid, current_setting('t.alice')::uuid, 10000, '2026-11-06');
insert into public.rent_payments (household_id, template_id, payer_id, collector_id, amount_pence, status, decided_by, decided_at) values
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.sam')::uuid, 20000, 'confirmed', current_setting('t.sam')::uuid, now());
insert into public.rent_payments (household_id, template_id, payer_id, collector_id, amount_pence, status) values
  ('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.sam')::uuid, 60000, 'pending');

select ok(
  not has_function_privilege('anon', 'public.rent_owed_to_me()', 'execute')
  and has_function_privilege('authenticated', 'public.rent_owed_to_me()', 'execute'),
  'for signed-in people only'
);

-- The collector sees what each person still owes, and what is waiting for them to confirm.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select array_agg(payer_name || ':' || outstanding_pence || ':' || pending_pence order by payer_name) from public.rent_owed_to_me()),
  array['Alice:100000:0', 'Bob:0:60000', 'Cara:60000:0']::text[], 'Sam sees each payer''s outstanding and pending rent');
select is((select count(*)::int from public.rent_owed_to_me() where payer_id = current_setting('t.sam')::uuid), 0, 'and never himself');
reset role;

-- Someone who collects a different rent sees only that one.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select array_agg(payer_name || ':' || outstanding_pence order by payer_name) from public.rent_owed_to_me()),
  array['Bob:10000']::text[], 'Alice sees only what Bob owes her, not Sam''s rent');
reset role;

-- Someone who collects nothing sees nothing, whatever their own rent.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_owed_to_me()), 0, 'Bob collects nothing, so he sees no one''s rent');
reset role;

-- Another flat sees nothing.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000006", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_owed_to_me()), 0, 'another flat sees nothing');
reset role;

-- A cancelled month no longer counts.
update public.recurring_instances set status = 'cancelled' where id = 'e3000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_owed_to_me()), 0, 'a cancelled month is not owed');
reset role;

-- Someone who has left the flat sees nothing.
update public.memberships set left_at = now(), left_reason = 'left' where profile_id = current_setting('t.sam')::uuid;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_owed_to_me()), 0, 'and a collector who has left sees nothing');
reset role;

select * from finish();
rollback;
