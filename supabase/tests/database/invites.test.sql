begin;
select plan(41);

select has_table('public', 'invites', 'invites exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invites'::regclass),
  'row-level security is enabled on invites'
);

-- People. alice owns flat A (eve is a plain member), dave owns flat D, gina owns flat G.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com', '{"full_name": "Eve"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name": "Frank"}'),
  ('00000000-0000-0000-0000-000000000010', 'gina@example.com', '{"full_name": "Gina"}'),
  ('00000000-0000-0000-0000-000000000011', 'hank@example.com', '{"full_name": "Hank"}'),
  ('00000000-0000-0000-0000-000000000012', 'ivan@example.com', '{"full_name": "Ivan"}');

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
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat G');
reset role;

insert into public.memberships (household_id, profile_id, role)
select h.id, p.id, 'member'
  from public.households h, public.profiles p
 where h.name = 'Flat A' and p.user_id = '00000000-0000-0000-0000-00000000000e';

-- Visitors can do nothing.
set local role anon;
select throws_ok($$select * from public.invites$$, '42501', null, 'anon cannot read invites');
select throws_ok($$select public.create_invite()$$, '42501', null, 'anon cannot create an invite');
select throws_ok($$select * from public.preview_invite('abc')$$, '42501', null, 'anon cannot preview an invite');
select throws_ok($$select public.join_household('abc')$$, '42501', null, 'anon cannot join');
reset role;

-- A plain member and a flatless person cannot manage invites.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_invite()$$, '42501', null, 'a plain member cannot create an invite');
select throws_ok($$select public.revoke_invite()$$, '42501', null, 'a plain member cannot revoke');
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_invite()$$, '42501', null, 'a flatless person cannot create an invite');
reset role;

-- Alice (owner) creates the link.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('test.token', public.create_invite(), true);
select matches(current_setting('test.token'), '^[A-Za-z0-9_-]{43}$', 'the token is 256 random bits, URL safe');
select is(
  (select count(*)::int from public.invites where expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'),
  1,
  'it expires in 7 days'
);
select is((select count(*)::int from public.invites), 1, 'an admin sees their flat''s invite');
select throws_ok(
  $$select token_hash from public.invites$$, '42501', null, 'but never the stored hash'
);
reset role;

select is(
  (select count(*)::int from public.invites where token_hash = sha256(convert_to(current_setting('test.token'), 'UTF8'))),
  1,
  'only the hash of the token is stored'
);
select is(
  (select count(*)::int from public.invites i where i::text like '%' || current_setting('test.token') || '%'),
  0,
  'the token itself is stored nowhere in the row'
);

-- Other people's invites are invisible.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.invites), 0, 'an admin of another flat sees no invites of flat A');
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.invites), 0, 'a plain member sees no invites');
reset role;

-- Bob previews and joins.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select household_name, inviter_name, member_count from public.preview_invite(current_setting('test.token'))$$,
  $$values ('Flat A'::text, 'Alice'::text, 2)$$,
  'a preview shows only the flat name, the inviter and the member count'
);
select is((select count(*)::int from public.preview_invite('not-a-real-token')), 0, 'a made-up token previews nothing');
select is((select count(*)::int from public.preview_invite('')), 0, 'an empty token previews nothing');
select is((select count(*)::int from public.preview_invite(null)), 0, 'a missing token previews nothing');
select throws_ok(
  $$select public.join_household('not-a-real-token')$$, 'P0001', 'invalid_invite', 'a made-up token cannot join'
);
select lives_ok($$select public.join_household(current_setting('test.token'))$$, 'bob joins with the link');
select results_eq(
  $$select role::text from public.memberships m join public.profiles p on p.id = m.profile_id
     where p.user_id = '00000000-0000-0000-0000-00000000000b' and m.left_at is null$$,
  $$values ('member'::text)$$,
  'and becomes a plain member'
);
select throws_ok(
  $$select public.join_household(current_setting('test.token'))$$, 'P0001', 'already_in_household',
  'someone already in a flat cannot join another'
);
reset role;

-- The link works for several people.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.join_household(current_setting('test.token'))$$, 'the same link works for carol too');
reset role;
select is(
  (select count(*)::int from public.memberships m join public.households h on h.id = m.household_id
    where h.name = 'Flat A' and m.left_at is null),
  4,
  'flat A now has four members'
);

-- A new link replaces the old one.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('test.old_token', current_setting('test.token'), true);
select set_config('test.token', public.create_invite(), true);
reset role;
select is(
  (select count(*)::int from public.invites where revoked_at is null),
  1,
  'only one live invite per flat'
);
select isnt(current_setting('test.token'), current_setting('test.old_token'), 'the new link is a different token');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.join_household(current_setting('test.old_token'))$$, 'P0001', 'invalid_invite',
  'the replaced link no longer works'
);
select is((select count(*)::int from public.preview_invite(current_setting('test.old_token'))), 0, 'nor previews');
reset role;

-- Revoking kills the link; revoking again is harmless.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.revoke_invite()$$, 'an admin can revoke the link');
select lives_ok($$select public.revoke_invite()$$, 'revoking when there is none is harmless');
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.join_household(current_setting('test.token'))$$, 'P0001', 'invalid_invite',
  'a revoked link no longer works'
);
reset role;

-- An expired link no longer works, and says the same thing.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('test.token', public.create_invite(), true);
reset role;
update public.invites set expires_at = now() - interval '1 second' where revoked_at is null;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.join_household(current_setting('test.token'))$$, 'P0001', 'invalid_invite',
  'an expired link no longer works'
);
select is((select count(*)::int from public.preview_invite(current_setting('test.token'))), 0, 'nor previews');
reset role;

-- An expired link does not block making a new one.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.create_invite()$$, 'a new link can be made after one expired');
reset role;

-- A closed flat cannot be joined.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select set_config('test.token', public.create_invite(), true);
reset role;
update public.households set closed_at = now() where name = 'Flat D';
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.join_household(current_setting('test.token'))$$, 'P0001', 'invalid_invite',
  'a closed flat cannot be joined'
);
reset role;

-- The 20-member cap: flat G gets 18 more members directly (19 in all), then two people try.
insert into auth.users (id, email)
select gen_random_uuid(), 'filler' || n || '@example.com' from generate_series(1, 18) n;
insert into public.memberships (household_id, profile_id, role)
select h.id, p.id, 'member'
  from public.households h, public.profiles p
 where h.name = 'Flat G' and p.display_name like 'filler%';

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}', true);
set local role authenticated;
select set_config('test.token', public.create_invite(), true);
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000011", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.join_household(current_setting('test.token'))$$, 'the 20th member can join');
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000012", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.join_household(current_setting('test.token'))$$, 'P0001', 'household_full',
  'the 21st member is refused'
);
reset role;
select is(
  (select count(*)::int from public.memberships m join public.households h on h.id = m.household_id
    where h.name = 'Flat G' and m.left_at is null),
  20,
  'flat G stops at 20'
);

select * from finish();
rollback;
