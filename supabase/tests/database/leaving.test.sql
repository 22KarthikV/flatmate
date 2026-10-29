begin;
select plan(30);

-- Flat A: alice (owner), bob (admin), carol (member). Flat D: dave (owner) with erin (member).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@example.com', '{"full_name": "Erin"}');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat A');
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat D');
reset role;

insert into public.memberships (household_id, profile_id, role)
select h.id, p.id, case when p.display_name = 'Bob' then 'admin'::public.household_role else 'member' end
  from public.households h, public.profiles p
 where h.name = 'Flat A' and p.display_name in ('Bob', 'Carol');
insert into public.memberships (household_id, profile_id, role)
select h.id, p.id, 'member'
  from public.households h, public.profiles p
 where h.name = 'Flat D' and p.display_name = 'Erin';

-- Visitors can do nothing.
set local role anon;
select throws_ok($$select public.leave_household()$$, '42501', null, 'anon cannot leave');
select throws_ok(
  $$select public.transfer_ownership(gen_random_uuid())$$, '42501', null, 'anon cannot transfer'
);
select throws_ok($$select public.close_household()$$, '42501', null, 'anon cannot close');
reset role;

-- Carol (member) leaves and can start over.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.close_household()$$, '42501', null, 'a member cannot close the flat');
select throws_ok(
  $$select public.transfer_ownership((select id from public.profiles where display_name = 'Bob'))$$,
  '42501', null, 'a member cannot transfer ownership'
);
select lives_ok($$select public.leave_household()$$, 'a member can leave');
select is((select count(*)::int from public.households), 0, 'and no longer sees the flat');
reset role;
select results_eq(
  $$select left_reason from public.memberships m join public.profiles p on p.id = m.profile_id
     where p.display_name = 'Carol'$$,
  $$values ('left'::text)$$,
  'the membership records that she left'
);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.leave_household()$$, '42501', null, 'leaving twice is refused');
select lives_ok($$select public.create_household('Carols place')$$, 'she can start her own flat');
reset role;

-- The owner cannot leave while others remain; an admin cannot hand over what is not theirs.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.leave_household()$$, 'P0001', 'owner_must_transfer', 'the owner must transfer before leaving'
);
select throws_ok(
  $$select public.transfer_ownership((select id from public.profiles where display_name = 'Alice'))$$,
  'P0001', 'use_leave', 'ownership cannot be handed to yourself'
);
select throws_ok(
  $$select public.transfer_ownership((select id from public.profiles where display_name = 'Dave'))$$,
  'P0001', 'not_a_member', 'ownership cannot go to someone in another flat'
);
select throws_ok(
  $$select public.transfer_ownership((select id from public.profiles where display_name = 'Carol'))$$,
  'P0001', 'not_a_member', 'nor to someone who has left'
);
select throws_ok(
  $$select public.close_household()$$, 'P0001', 'flat_not_empty', 'a flat with other people cannot be closed'
);
reset role;

-- A made-up rule can stop leaving (the ledger will use this hook).
create or replace function private.can_leave(p_household_id uuid, p_profile_id uuid)
returns boolean language sql stable set search_path = '' as $$ select false $$;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.leave_household()$$, 'P0001', 'cannot_leave', 'the can_leave hook can refuse');
reset role;
create or replace function private.can_leave(p_household_id uuid, p_profile_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;

-- Alice hands over to Bob.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.transfer_ownership((select id from public.profiles where display_name = 'Bob'))$$,
  'the owner can hand over to a member of the flat'
);
select throws_ok(
  $$select public.transfer_ownership((select id from public.profiles where display_name = 'Bob'))$$,
  '42501', null, 'the old owner can no longer transfer'
);
reset role;
select results_eq(
  $$select p.display_name, m.role::text from public.memberships m join public.profiles p on p.id = m.profile_id
     where m.left_at is null and m.household_id = (select id from public.households where name = 'Flat A')
     order by p.display_name$$,
  $$values ('Alice'::text, 'admin'::text), ('Bob'::text, 'owner'::text)$$,
  'Bob is the owner and Alice an admin'
);
select is(
  (select count(*)::int from public.memberships
    where role = 'owner' and left_at is null and household_id = (select id from public.households where name = 'Flat A')),
  1, 'there is still exactly one owner'
);

-- Alice (now an admin) can leave; Bob, alone, must close instead.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.leave_household()$$, 'an admin can leave');
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.leave_household()$$, 'P0001', 'owner_must_close', 'a lone owner must close the flat'
);
select set_config('test.token', public.create_invite(), true);
select lives_ok($$select public.close_household()$$, 'the owner can close the flat');
select is((select count(*)::int from public.households), 0, 'a closed flat is gone from view');
reset role;
select results_eq(
  $$select left_reason from public.memberships m join public.profiles p on p.id = m.profile_id
     where p.display_name = 'Bob'$$,
  $$values ('flat_closed'::text)$$,
  'closing ends the membership with the flat_closed reason'
);
select is(
  (select count(*)::int from public.invites where revoked_at is null and household_id =
    (select id from public.households where name = 'Flat A')),
  0, 'and switches off its invite link'
);
select isnt(
  (select closed_at from public.households where name = 'Flat A'), null, 'the rows are kept, marked closed'
);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.create_household('Bobs new flat')$$, 'the old owner can start a new flat');
reset role;

-- Rejoining makes a fresh membership row and leaves the old one as history.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select public.leave_household();
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select set_config('test.token', public.create_invite(), true);
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.join_household(current_setting('test.token'))$$, 'someone who left can rejoin with a fresh link');
reset role;
select is(
  (select count(*)::int from public.memberships m join public.profiles p on p.id = m.profile_id where p.display_name = 'Erin'),
  2, 'with a new membership row beside the old one'
);

select * from finish();
rollback;
