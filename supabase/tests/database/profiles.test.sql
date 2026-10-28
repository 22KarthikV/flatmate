begin;
select plan(22);

select has_table('public', 'profiles', 'profiles exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'row-level security is enabled'
);

-- Three users; the signup trigger should create their profiles.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com',
   '{"full_name": "  Alice Adams  ", "picture": "https://img.example.com/a.png"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob.builder@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com',
   '{"name": "   ", "avatar_url": "http://insecure.example.com/c.png"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com',
   jsonb_build_object('full_name', repeat('x', 80)));

select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'Alice Adams',
  'name comes from full_name, trimmed'
);
select is(
  (select avatar_url from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'https://img.example.com/a.png',
  'avatar comes from picture when https'
);
select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'),
  'bob.builder',
  'with no name, the email local part is used'
);
select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'),
  'carol',
  'a blank name falls back to the email local part'
);
select is(
  (select avatar_url from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'),
  null,
  'a non-https avatar is dropped'
);
select is(
  (select char_length(display_name) from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'),
  50,
  'long names are cut to 50 characters'
);

-- Avatar follows the Google photo; the name the user chose is left alone.
update public.profiles set display_name = 'Ally' where user_id = '00000000-0000-0000-0000-00000000000a';
update auth.users
   set raw_user_meta_data = '{"full_name": "Alice Changed", "picture": "https://img.example.com/new.png"}'
 where id = '00000000-0000-0000-0000-00000000000a';
select results_eq(
  $$select display_name, avatar_url from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values ('Ally'::text, 'https://img.example.com/new.png'::text)$$,
  'a new Google photo is picked up and the chosen name is kept'
);

-- Alice signs in.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.profiles), 1, 'a user sees only their own profile');

select lives_ok(
  $$update public.profiles set display_name = 'Alice' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'a user can rename themselves'
);
select throws_ok(
  $$update public.profiles set display_name = '' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514', null, 'an empty name is rejected'
);
select throws_ok(
  $$update public.profiles set avatar_url = 'https://evil.example.com/x.png' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'the avatar cannot be edited through the API'
);
select throws_ok(
  $$update public.profiles set user_id = '00000000-0000-0000-0000-00000000000b' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'user_id cannot be reassigned'
);
select throws_ok(
  $$insert into public.profiles (user_id, display_name) values ('00000000-0000-0000-0000-00000000000a', 'dup')$$,
  '42501', null, 'profiles cannot be inserted through the API'
);
select throws_ok(
  $$delete from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'profiles cannot be deleted through the API'
);
select throws_ok(
  $$select public.anonymise_profile('00000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'authenticated users cannot call anonymise_profile'
);
reset role;

-- Bob's row is untouched by anything Alice tried.
select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'),
  'bob.builder',
  'another user''s profile is unchanged'
);

-- Visitors see nothing.
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
reset role;

-- Deleting an account anonymises first (service role), then removes the auth user.
set local role service_role;
select public.anonymise_profile('00000000-0000-0000-0000-00000000000b');
reset role;
select results_eq(
  $$select display_name, avatar_url, user_id is null, deleted_at is not null
      from public.profiles where display_name = 'Deleted user'$$,
  $$values ('Deleted user'::text, null::text, true, true)$$,
  'anonymise_profile leaves a neutral, unlinked row'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
select is(
  (select count(*)::int from public.profiles where display_name = 'carol'),
  1,
  'deleting the auth user keeps the profile row'
);
select is(
  (select user_id from public.profiles where display_name = 'carol'),
  null,
  'and unlinks it (user_id set to null)'
);

select * from finish();
rollback;
