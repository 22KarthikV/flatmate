begin;
select plan(26);

-- alice owns flat A with bob (admin), carol and dave (members). erin owns flat E. zed has no flat.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@example.com', '{"full_name": "Erin"}'),
  ('00000000-0000-0000-0000-00000000000f', 'zed@example.com', '{"full_name": "Zed"}');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat A');
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat E');
reset role;

insert into public.memberships (household_id, profile_id, role)
select h.id, p.id, case when p.display_name = 'Bob' then 'admin'::public.household_role else 'member' end
  from public.households h, public.profiles p
 where h.name = 'Flat A' and p.display_name in ('Bob', 'Carol', 'Dave');

-- Flatmates can see each other's profile, and nobody else's.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select display_name from public.profiles order by display_name$$,
  $$values ('Alice'::text), ('Bob'::text), ('Carol'::text), ('Dave'::text)$$,
  'a member sees exactly their flatmates'' profiles'
);
update public.profiles set display_name = 'Hacked' where display_name = 'Alice';
reset role;
select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'Alice',
  'but cannot change a flatmate''s profile'
);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.profiles), 1, 'a flatless person sees only themselves');
reset role;
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon still cannot read profiles');
select throws_ok(
  $$select public.set_member_role(gen_random_uuid(), 'admin')$$, '42501', null, 'anon cannot change roles'
);
select throws_ok($$select public.remove_member(gen_random_uuid())$$, '42501', null, 'anon cannot remove people');
reset role;

-- A plain member cannot manage anyone.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.set_member_role((select id from public.profiles where display_name = 'Dave'), 'admin')$$,
  '42501', null, 'a plain member cannot change roles'
);
select throws_ok(
  $$select public.remove_member((select id from public.profiles where display_name = 'Dave'))$$,
  '42501', null, 'a plain member cannot remove people'
);
reset role;

-- Bob (admin) promotes and demotes.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.set_member_role((select id from public.profiles where display_name = 'Carol'), 'admin')$$,
  'an admin can promote a member'
);
select is(
  (select role::text from public.memberships m join public.profiles p on p.id = m.profile_id
    where p.display_name = 'Carol' and m.left_at is null),
  'admin', 'the role changed'
);
select lives_ok(
  $$select public.set_member_role((select id from public.profiles where display_name = 'Carol'), 'member')$$,
  'an admin can demote another admin'
);
select throws_ok(
  $$select public.set_member_role((select id from public.profiles where display_name = 'Carol'), 'owner')$$,
  '22023', null, 'nobody can be made owner this way'
);
select throws_ok(
  $$select public.set_member_role((select id from public.profiles where display_name = 'Alice'), 'member')$$,
  '42501', null, 'the owner cannot be demoted'
);
select throws_ok(
  $$select public.set_member_role((select id from public.profiles where display_name = 'Erin'), 'admin')$$,
  'P0001', 'not_a_member', 'someone in another flat cannot be touched'
);
select throws_ok(
  $$select public.remove_member((select id from public.profiles where display_name = 'Alice'))$$,
  '42501', null, 'the owner cannot be removed'
);
select throws_ok(
  $$select public.remove_member((select id from public.profiles where display_name = 'Bob'))$$,
  'P0001', 'use_leave', 'you cannot remove yourself; leaving is separate'
);
reset role;

-- Admins cannot remove admins; the owner can.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.set_member_role((select id from public.profiles where display_name = 'Dave'), 'admin');
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.remove_member((select id from public.profiles where display_name = 'Dave'))$$,
  '42501', null, 'an admin cannot remove another admin'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.remove_member((select id from public.profiles where display_name = 'Dave'))$$,
  'the owner can remove an admin'
);
reset role;

-- Bob removes Carol (a member).
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.remove_member((select id from public.profiles where display_name = 'Carol'))$$,
  'an admin can remove a member'
);
select results_eq(
  $$select display_name from public.profiles order by display_name$$,
  $$values ('Alice'::text), ('Bob'::text), ('Carol'::text), ('Dave'::text)$$,
  'removed people stay visible to the flat as history'
);
reset role;
select results_eq(
  $$select left_reason from public.memberships m join public.profiles p on p.id = m.profile_id
     where p.display_name = 'Carol'$$,
  $$values ('removed'::text)$$,
  'the membership records why they left'
);
select is(
  (select count(*)::int from public.memberships where role = 'owner' and left_at is null and household_id =
    (select id from public.households where name = 'Flat A')),
  1, 'the flat still has exactly one owner'
);

-- Carol is out: no flat, no admin powers, no sight of the flat, free to start her own.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.households), 0, 'a removed person no longer sees the flat');
select is((select count(*)::int from public.profiles), 1, 'nor their former flatmates'' profiles');
select throws_ok(
  $$select public.remove_member((select id from public.profiles where display_name = 'Bob'))$$,
  '42501', null, 'and has no admin powers any more'
);
select lives_ok($$select public.create_household('Carols place')$$, 'a removed person can start a new flat');
reset role;

select * from finish();
rollback;
