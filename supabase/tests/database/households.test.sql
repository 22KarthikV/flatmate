begin;
select plan(39);

select has_table('public', 'households', 'households exists');
select has_table('public', 'memberships', 'memberships exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.households'::regclass),
  'row-level security is enabled on households'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.memberships'::regclass),
  'row-level security is enabled on memberships'
);
select has_index('public', 'memberships', 'memberships_one_active_flat', 'one-active-flat index exists');
select has_index('public', 'memberships', 'memberships_one_owner', 'one-owner index exists');
select has_index('public', 'memberships', 'memberships_household_active', 'active-members index exists');

-- Three people: alice and bob will each create a flat, carol stays flatless.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}');

-- Visitors can do nothing.
set local role anon;
select throws_ok($$select * from public.households$$, '42501', null, 'anon cannot read households');
select throws_ok($$select * from public.memberships$$, '42501', null, 'anon cannot read memberships');
select throws_ok($$select public.create_household('Nope')$$, '42501', null, 'anon cannot create a flat');
reset role;

-- A session with no user behind it is refused too.
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_household('Ghost')$$, '42501', null, 'no signed-in user, no flat');
reset role;

-- Alice creates a flat.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;

select lives_ok($$select public.create_household('  Flat 12  ')$$, 'a signed-in person can create a flat');
select is((select name from public.households), 'Flat 12', 'the name is trimmed');
select results_eq(
  $$select role::text, left_at is null from public.memberships$$,
  $$values ('owner'::text, true)$$,
  'the creator is the only member, as owner'
);
select throws_ok(
  $$select public.create_household('Second flat')$$,
  'P0001', 'already_in_household', 'a person in a flat cannot create another'
);
reset role;

-- Bob: bad names are refused, then his own flat is created.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_household('   ')$$, '22023', null, 'a blank name is refused');
select throws_ok($$select public.create_household(null)$$, '22023', null, 'a missing name is refused');
select throws_ok(
  $$select public.create_household(repeat('x', 51))$$, '22023', null, 'a name over 50 characters is refused'
);
select lives_ok($$select public.create_household('Flat B')$$, 'bob creates his own flat');
reset role;

-- Isolation: each person sees only their own flat.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select name from public.households$$, $$values ('Flat 12'::text)$$,
  'alice sees only her flat'
);
select is((select count(*)::int from public.memberships), 1, 'alice sees only her flat memberships');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select results_eq(
  $$select name from public.households$$, $$values ('Flat B'::text)$$,
  'bob sees only his flat'
);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from public.households), 0, 'a flatless person sees no flats');
select is((select count(*)::int from public.memberships), 0, 'and no memberships');

-- Nothing can be written through the API.
select throws_ok(
  $$insert into public.households (name, created_by) select 'Hack', id from public.profiles limit 1$$,
  '42501', null, 'households cannot be inserted through the API'
);
select throws_ok(
  $$update public.households set name = 'Hacked'$$, '42501', null, 'households cannot be updated through the API'
);
select throws_ok($$delete from public.households$$, '42501', null, 'households cannot be deleted through the API');
select throws_ok(
  $$insert into public.memberships (household_id, profile_id, role)
      select h.id, p.id, 'member' from public.households h, public.profiles p limit 1$$,
  '42501', null, 'memberships cannot be inserted through the API'
);
select throws_ok(
  $$update public.memberships set role = 'owner'$$, '42501', null, 'memberships cannot be updated through the API'
);
select throws_ok($$delete from public.memberships$$, '42501', null, 'memberships cannot be deleted through the API');

-- Carol has no flat, so she cannot rename one.
select throws_ok($$select public.rename_household('Mine now')$$, '42501', null, 'a flatless person cannot rename');
reset role;

-- Add carol to alice's flat as a plain member (the invite functions come in the next task).
insert into public.memberships (household_id, profile_id, role)
select h.id, p.id, 'member'
  from public.households h, public.profiles p
 where h.name = 'Flat 12' and p.user_id = '00000000-0000-0000-0000-00000000000c';

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select name from public.households$$, $$values ('Flat 12'::text)$$, 'a member sees their flat'
);
select throws_ok($$select public.rename_household('Mine now')$$, '42501', null, 'a plain member cannot rename');
select throws_ok(
  $$select public.create_household('Carols')$$, 'P0001', 'already_in_household', 'a member cannot start a second flat'
);
reset role;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.rename_household('  Flat Twelve  ')$$, 'the owner can rename');
select is((select name from public.households), 'Flat Twelve', 'the new name is trimmed and saved');
select throws_ok($$select public.rename_household('')$$, '22023', null, 'a blank new name is refused');
reset role;

-- The indexes are the backstop for the rules.
select throws_ok(
  $$insert into public.memberships (household_id, profile_id, role)
      select h.id, p.id, 'owner' from public.households h, public.profiles p
       where h.name = 'Flat Twelve' and p.user_id = '00000000-0000-0000-0000-00000000000b'$$,
  '23505', null, 'a flat cannot have two owners, and a person cannot be in two flats'
);

-- A closed flat disappears for its members.
update public.households set closed_at = now() where name = 'Flat Twelve';
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.households), 0, 'a closed flat is no longer visible');
reset role;

select * from finish();
rollback;
