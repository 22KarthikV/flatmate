begin;
select plan(72);

-- Ledger data model (SPEC-ledger L1 to L3): append-only money in whole pence, balances derived from
-- the rows, readable only by the flat's members, writable only through functions (a later task).
-- These tests insert as the table owner, which is how the future functions will; the browser roles
-- are tested separately below.

select has_table('public', 'expenses', 'expenses exists');
select has_table('public', 'expense_shares', 'expense_shares exists');
select has_table('public', 'settlements', 'settlements exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.expenses'::regclass, 'public.expense_shares'::regclass, 'public.settlements'::regclass)),
  'row-level security is enabled on every ledger table'
);
select ok(
  not exists (
    select 1 from unnest(array['public.expenses', 'public.expense_shares', 'public.settlements']) t(name)
     cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(priv)
     where has_table_privilege('anon', t.name, p.priv)
  ),
  'anon has no privileges on any ledger table'
);
select ok(
  not exists (
    select 1 from unnest(array['public.expenses', 'public.expense_shares', 'public.settlements']) t(name)
     cross join unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
     where has_table_privilege('authenticated', t.name, p.priv)
  ),
  'the browser role can only read the ledger tables, never write them'
);
select ok(
  (select bool_and(has_table_privilege('authenticated', t.name, 'select'))
     from unnest(array['public.expenses', 'public.expense_shares', 'public.settlements']) t(name)),
  'the browser role can read them (rows are limited by policy)'
);

-- People. alice (owner), bob, carol are in Flat A; frank used to be. dave is alone in Flat D.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
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

-- Flat A's books. Alice paid 30.00 split three ways; Bob paid 15.00 split between Alice and Bob;
-- Carol paid Alice 5.00 and Alice confirmed it. A row and its shares go in together, and the
-- "shares add up" check runs when the group is complete.
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 3000, 'Groceries', 'groceries', current_date),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   current_setting('t.bob')::uuid, current_setting('t.bob')::uuid, 1500, 'Takeaway', 'takeaway', current_date);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 1000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 1000),
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 1000),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 750),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 750);
insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence) values
  ('51000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   current_setting('t.carol')::uuid, current_setting('t.alice')::uuid, 500);
update public.settlements
   set status = 'confirmed', decided_at = now(), confirmed_by = current_setting('t.alice')::uuid
 where id = '51000000-0000-0000-0000-000000000001';
select lives_ok('set constraints all immediate', 'a complete set of expenses and shares passes the sum check');

-- Flat D has one expense of its own.
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
values ('e3000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001',
        current_setting('t.dave')::uuid, current_setting('t.dave')::uuid, 999, 'Light bulbs', 'household', current_date);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
values ('e3000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 999);
set constraints all immediate;

-- ---------------------------------------------------------------------------------------------
-- Balances: derived from the rows. Positive means owed to the person.
-- alice: +3000 -1000 -750 +0 (she received 500 from carol, so -500) = 750
-- bob:   +1500 -1000 -750 = -250        carol: -1000 +500 = -500
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;

select results_eq(
  $$select profile_id, balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') order by balance_pence desc$$,
  $$select p, b from (values (current_setting('t.alice')::uuid, 750::bigint),
                              (current_setting('t.bob')::uuid, -250::bigint),
                              (current_setting('t.carol')::uuid, -500::bigint)) v(p, b) order by b desc$$,
  'balances are worked out from the expenses, shares and confirmed settlements'
);
select is(
  (select sum(balance_pence)::bigint from public.household_balances('a0000000-0000-0000-0000-000000000001')),
  0::bigint, 'the balances of a flat add up to exactly zero'
);
select is(
  (select count(*)::int from public.household_balances('a0000000-0000-0000-0000-000000000001')),
  3, 'every current member appears, and a former member with no money in play does not'
);

reset role;

-- A pending, declined or cancelled settlement changes nothing.
set constraints all deferred;
insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence) values
  ('52000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.alice')::uuid, 250),
  ('53000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.alice')::uuid, 250),
  ('54000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.alice')::uuid, 250);
update public.settlements set status = 'declined', decided_at = now() where id = '53000000-0000-0000-0000-000000000003';
update public.settlements set status = 'cancelled', decided_at = now() where id = '54000000-0000-0000-0000-000000000004';
set constraints all immediate;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001')
    where profile_id = current_setting('t.alice')::uuid),
  750::bigint, 'pending, declined and cancelled settlements do not change a balance'
);
reset role;

-- A confirmed one does, on both sides, and the flat still adds up to zero.
update public.settlements set status = 'confirmed', decided_at = now(), confirmed_by = current_setting('t.alice')::uuid
 where id = '52000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') order by profile_id$$,
  $$select b from (values (current_setting('t.alice')::uuid, 500::bigint),
                          (current_setting('t.bob')::uuid, 0::bigint),
                          (current_setting('t.carol')::uuid, -500::bigint)) v(p, b) order by p$$,
  'a confirmed settlement moves both people''s balances'
);
reset role;

-- Voiding an expense takes it out of the balances.
update public.expenses
   set voided_at = now(), voided_by = current_setting('t.bob')::uuid
 where id = 'e2000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select balance_pence from public.household_balances('a0000000-0000-0000-0000-000000000001') order by profile_id$$,
  $$select b from (values (current_setting('t.alice')::uuid, 1250::bigint),
                          (current_setting('t.bob')::uuid, -750::bigint),
                          (current_setting('t.carol')::uuid, -500::bigint)) v(p, b) order by p$$,
  'a voided expense no longer counts'
);
select is(
  (select sum(balance_pence)::bigint from public.household_balances('a0000000-0000-0000-0000-000000000001')),
  0::bigint, 'and the flat still adds up to exactly zero'
);
reset role;

-- A former member who is still owed money keeps showing, so the debt is not hidden.
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
values ('e4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 200, 'Bin bags', 'household', current_date);
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
values ('e4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 100),
       ('e4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 100);
set constraints all immediate;
-- Bob leaves (a membership flag only; his rows stay).
update public.memberships set left_at = now(), left_reason = 'left'
 where profile_id = current_setting('t.bob')::uuid and left_at is null;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select ok(
  exists (select 1 from public.household_balances('a0000000-0000-0000-0000-000000000001')
           where profile_id = current_setting('t.bob')::uuid and balance_pence = -850),
  'someone who left but still owes money still appears in the balances'
);
select is(
  (select sum(balance_pence)::bigint from public.household_balances('a0000000-0000-0000-0000-000000000001')),
  0::bigint, 'and the flat still adds up to exactly zero'
);
reset role;
update public.memberships set left_at = null, left_reason = null
 where profile_id = current_setting('t.bob')::uuid and household_id = 'a0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------------------------
-- Integrity: the shares add up, the people are in the flat, amounts are sane.
select throws_ok(
  $sql$ do $do$ begin
    set constraints all deferred;
    insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 1000, 'Crooked', 'other', current_date);
    insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
    select id, household_id, current_setting('t.alice')::uuid, 999 from public.expenses where description = 'Crooked';
    set constraints all immediate;
  end $do$ $sql$,
  '23514', 'shares_must_add_up', 'shares that do not add up to the amount are refused'
);
select throws_ok(
  $sql$ do $do$ begin
    set constraints all deferred;
    insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 1000, 'No shares', 'other', current_date);
    set constraints all immediate;
  end $do$ $sql$,
  '23514', 'shares_must_add_up', 'an expense with no shares at all is refused'
);
select throws_ok(
  $sql$ do $do$ begin
    set constraints all deferred;
    insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 1000, 'Too much', 'other', current_date);
    insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
    select id, household_id, current_setting('t.alice')::uuid, 1001 from public.expenses where description = 'Too much';
    set constraints all immediate;
  end $do$ $sql$,
  '23514', 'shares_must_add_up', 'shares adding up to more than the amount are refused'
);
select throws_ok(
  $sql$ insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
        values ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, -1) $sql$,
  '23514', null, 'a negative share is refused'
);

select throws_ok(
  $sql$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, current_setting('t.alice')::uuid, 100, 'Not in the flat', 'other', current_date) $sql$,
  'P0001', 'not_a_member', 'a payer from another flat is refused'
);
select throws_ok(
  $sql$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, current_setting('t.alice')::uuid, 100, 'Left already', 'other', current_date) $sql$,
  'P0001', 'not_a_member', 'a payer who has left the flat is refused'
);
select throws_ok(
  $sql$ insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
        values ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 0) $sql$,
  'P0001', 'not_a_member', 'a share for someone outside the flat is refused'
);
select throws_ok(
  $sql$ insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
        values ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 0) $sql$,
  '23503', null, 'a share cannot claim a different flat from its expense'
);

select throws_ok(
  $sql$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 0, 'Free', 'other', current_date) $sql$,
  '23514', null, 'an expense of 0p is refused'
);
select throws_ok(
  $sql$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 1000001, 'Too big', 'other', current_date) $sql$,
  '23514', null, 'an expense over £10,000.00 is refused'
);
select throws_ok(
  $sql$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 100, '', 'other', current_date) $sql$,
  '23514', null, 'an empty description is refused'
);
select throws_ok(
  $sql$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 100, repeat('x', 81), 'other', current_date) $sql$,
  '23514', null, 'a description over 80 characters is refused'
);
select throws_ok(
  $sql$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 100, 'Odd', 'cars', current_date) $sql$,
  '23514', null, 'an unknown category is refused'
);

select throws_ok(
  $sql$ insert into public.settlements (household_id, from_profile, to_profile, amount_pence)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 100) $sql$,
  '23514', null, 'a person cannot pay themselves'
);
select throws_ok(
  $sql$ insert into public.settlements (household_id, from_profile, to_profile, amount_pence)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.dave')::uuid, 100) $sql$,
  'P0001', 'not_a_member', 'a payment to someone outside the flat is refused'
);
select throws_ok(
  $sql$ insert into public.settlements (household_id, from_profile, to_profile, amount_pence)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.bob')::uuid, 0) $sql$,
  '23514', null, 'a payment of 0p is refused'
);
select throws_ok(
  $sql$ insert into public.settlements (household_id, from_profile, to_profile, amount_pence)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, current_setting('t.bob')::uuid, 1000001) $sql$,
  '23514', null, 'a payment over £10,000.00 is refused'
);
insert into public.settlements (id, household_id, from_profile, to_profile, amount_pence)
values ('55000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.bob')::uuid, current_setting('t.alice')::uuid, 100);
select throws_ok(
  $sql$ update public.settlements set status = 'confirmed', decided_at = now()
         where id = '55000000-0000-0000-0000-000000000005' $sql$,
  '23514', null, 'a confirmed settlement must say who confirmed it'
);

-- ---------------------------------------------------------------------------------------------
-- Append-only: history is never rewritten.
select throws_ok(
  $sql$ update public.expenses set amount_pence = 1 where id = 'e1000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'an expense''s amount cannot be changed'
);
select throws_ok(
  $sql$ update public.expenses set description = 'Changed' where id = 'e1000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'an expense''s description cannot be changed'
);
select throws_ok(
  $sql$ update public.expenses set voided_at = now(), voided_by = current_setting('t.alice')::uuid,
                                    amount_pence = 1 where id = 'e1000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'voiding cannot be used to change anything else at the same time'
);
select throws_ok(
  $sql$ update public.expenses set voided_at = now() where id = 'e1000000-0000-0000-0000-000000000001' $sql$,
  '23514', null, 'a void must say who voided it'
);
select throws_ok(
  $sql$ update public.expenses set voided_at = now(), voided_by = current_setting('t.alice')::uuid
         where id = 'e2000000-0000-0000-0000-000000000002' $sql$,
  'P0001', 'ledger_is_append_only', 'an expense can be voided only once'
);
select throws_ok(
  $sql$ update public.expenses set voided_at = null, voided_by = null where id = 'e2000000-0000-0000-0000-000000000002' $sql$,
  'P0001', 'ledger_is_append_only', 'a void cannot be undone'
);
select throws_ok(
  $sql$ delete from public.expenses where id = 'e1000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'an expense cannot be deleted'
);
select throws_ok(
  $sql$ update public.expense_shares set share_pence = 1 where expense_id = 'e1000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'a share cannot be changed'
);
select throws_ok(
  $sql$ delete from public.expense_shares where expense_id = 'e1000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'a share cannot be deleted'
);
select throws_ok(
  $sql$ update public.settlements set amount_pence = 1 where id = '51000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'a settlement''s amount cannot be changed'
);
select throws_ok(
  $sql$ update public.settlements set status = 'pending', decided_at = null, confirmed_by = null
         where id = '51000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'a decided settlement cannot go back to pending'
);
select throws_ok(
  $sql$ update public.settlements set status = 'cancelled', decided_at = now(), confirmed_by = null
         where id = '51000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'a confirmed settlement cannot be cancelled afterwards'
);
select throws_ok(
  $sql$ delete from public.settlements where id = '51000000-0000-0000-0000-000000000001' $sql$,
  'P0001', 'ledger_is_append_only', 'a settlement cannot be deleted'
);
select throws_ok(
  $sql$ truncate public.expenses cascade $sql$,
  'P0001', 'ledger_is_append_only', 'the ledger cannot be emptied'
);

-- An edit is a void plus a new expense that points back at the old one.
set constraints all deferred;
insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on, replaces_id)
values ('e5000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
        current_setting('t.alice')::uuid, current_setting('t.alice')::uuid, 3100, 'Groceries (corrected)', 'groceries', current_date,
        'e1000000-0000-0000-0000-000000000001');
insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
values ('e5000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 3100);
set constraints all immediate;
select is(
  (select replaces_id from public.expenses where id = 'e5000000-0000-0000-0000-000000000005'),
  'e1000000-0000-0000-0000-000000000001'::uuid, 'a corrected expense records which one it replaces'
);

-- ---------------------------------------------------------------------------------------------
-- Isolation: the books are for the flat's members only.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.expenses), 4, 'a member sees their flat''s expenses (and not Flat D''s)');
select is((select count(*)::int from public.expenses where household_id = 'd0000000-0000-0000-0000-000000000001'), 0,
  'a member of Flat A sees none of Flat D''s expenses');
select is((select count(*)::int from public.expense_shares where household_id = 'd0000000-0000-0000-0000-000000000001'), 0,
  'nor its shares');
select is((select count(*)::int from public.settlements where household_id = 'd0000000-0000-0000-0000-000000000001'), 0,
  'nor its settlements');
select throws_ok(
  $sql$ select * from public.household_balances('d0000000-0000-0000-0000-000000000001') $sql$,
  '42501', 'not_allowed', 'a member of Flat A cannot ask for Flat D''s balances'
);
select throws_ok(
  $sql$ insert into public.expenses (household_id, paid_by, created_by, amount_pence, description, category, occurred_on)
        values ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, current_setting('t.bob')::uuid, 100, 'Sneaky', 'other', current_date) $sql$,
  '42501', null, 'a member cannot write an expense directly'
);
select throws_ok(
  $sql$ update public.expenses set voided_at = now(), voided_by = current_setting('t.bob')::uuid $sql$,
  '42501', null, 'a member cannot void an expense directly'
);
select throws_ok(
  $sql$ delete from public.settlements $sql$,
  '42501', null, 'a member cannot delete a settlement directly'
);
reset role;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.expenses), 1, 'Dave sees only his own flat''s expense');
select throws_ok(
  $sql$ select * from public.household_balances('a0000000-0000-0000-0000-000000000001') $sql$,
  '42501', 'not_allowed', 'and cannot ask for Flat A''s balances'
);
reset role;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.expenses), 0, 'someone who has left the flat sees none of its books');
reset role;

set local role anon;
select throws_ok($sql$ select count(*) from public.expenses $sql$, '42501', null, 'anon cannot read expenses');
select throws_ok($sql$ select count(*) from public.settlements $sql$, '42501', null, 'anon cannot read settlements');
reset role;
select ok(
  not has_function_privilege('anon', 'public.household_balances(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.household_balances(uuid)', 'execute'),
  'balances can be asked for by signed-in people, never by anon'
);

-- ---------------------------------------------------------------------------------------------
-- Flat setting and notification types.
select is((select nudge_after_days from public.households where id = 'a0000000-0000-0000-0000-000000000001'),
  7::smallint, 'a flat nudges after 7 days unless told otherwise');
select lives_ok($sql$ update public.households set nudge_after_days = null where id = 'a0000000-0000-0000-0000-000000000001' $sql$,
  'an admin can switch nudges off (null)');
select throws_ok($sql$ update public.households set nudge_after_days = 5 where id = 'a0000000-0000-0000-0000-000000000001' $sql$,
  '23514', null, 'only 3, 7 or 14 days are allowed');

select results_eq(
  $$select type, default_in_app, default_push, snoozable from public.notification_types
     where type in ('expense_added', 'expense_changed', 'expense_voided', 'settlement_pending',
                    'settlement_confirmed', 'settlement_declined', 'payment_nudge') order by type$$,
  $$values ('expense_added'::text, true, true, false), ('expense_changed', true, false, false),
           ('expense_voided', true, false, false), ('payment_nudge', true, false, true),
           ('settlement_confirmed', true, true, false), ('settlement_declined', true, true, false),
           ('settlement_pending', true, true, false)$$,
  'the ledger registers its seven notification types with the agreed defaults'
);
select is(
  (select count(*)::int from public.notification_types
    where type in ('expense_added', 'expense_changed', 'expense_voided', 'settlement_pending',
                   'settlement_confirmed', 'settlement_declined', 'payment_nudge')
      and push_title is not null and push_body is not null),
  7, 'each of them has generic push text, so no amount can reach a lock screen'
);
select is(
  (select count(*)::int from public.notification_types
    where coalesce(push_title, '') ~ '[£0-9]' or coalesce(push_body, '') ~ '[£0-9]'),
  0, 'and that text contains no currency sign or digits'
);
select is(
  (select count(*)::int from public.notification_types
    where type in ('member_joined', 'member_left', 'role_changed') and (push_title is not null or push_body is not null)),
  0, 'the household types are unchanged: they push their own text'
);
select throws_ok(
  $sql$ update public.notification_types set push_title = 'Only a title' where type = 'role_changed' $sql$,
  '23514', null, 'push text is set as a pair: title and body together'
);

select * from finish();
rollback;
