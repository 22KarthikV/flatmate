begin;
select plan(16);

-- Flat A: alice (owner), bob (admin), carol (member). Flat D: dave alone. Erin has no flat.
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
select set_config('test.token', public.create_invite(), true);
reset role;

insert into public.memberships (household_id, profile_id, role)
select h.id, p.id, case when p.display_name = 'Bob' then 'admin'::public.household_role else 'member' end
  from public.households h, public.profiles p
 where h.name = 'Flat A' and p.display_name in ('Bob', 'Carol');

-- Only the service role may call it.
set local role anon;
select throws_ok(
  $$select public.end_memberships_for_account('00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'anon cannot call it'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.end_memberships_for_account('00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'a signed-in user cannot call it, even for themselves'
);
reset role;

set local role service_role;

-- An owner with other people in the flat is refused and nothing changes.
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000a'),
  'owner_must_transfer',
  'an owner with flatmates must hand over first'
);
select is(
  (select count(*)::int from public.memberships where left_at is null and household_id =
    (select id from public.households where name = 'Flat A')),
  3, 'and nobody was removed'
);

-- Members and admins just leave.
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000c'), 'ok', 'a member can be removed'
);
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000b'), 'ok', 'an admin can be removed'
);
reset role;
select results_eq(
  $$select p.display_name, m.left_reason from public.memberships m join public.profiles p on p.id = m.profile_id
     where m.left_at is not null and m.household_id = (select id from public.households where name = 'Flat A')
     order by p.display_name$$,
  $$values ('Bob'::text, 'account_deleted'::text), ('Carol'::text, 'account_deleted'::text)$$,
  'they left with the account_deleted reason'
);

-- Now alice is alone, so deleting her account closes the flat.
set local role service_role;
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000a'), 'ok', 'a lone owner can go'
);
reset role;
select isnt((select closed_at from public.households where name = 'Flat A'), null, 'and the flat is closed');
select results_eq(
  $$select left_reason from public.memberships m join public.profiles p on p.id = m.profile_id
     where p.display_name = 'Alice'$$,
  $$values ('flat_closed'::text)$$,
  'her membership ended with flat_closed'
);

-- Dave's flat has a live link; closing it switches it off.
set local role service_role;
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000d'), 'ok', 'a lone owner with a link can go'
);
reset role;
select is(
  (select count(*)::int from public.invites where revoked_at is null), 0, 'and the invite link is switched off'
);

-- Safe to repeat, and fine for people with no flat or no such user.
set local role service_role;
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000d'), 'ok', 'repeating is harmless'
);
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000e'), 'ok', 'someone with no flat is fine'
);
select is(public.end_memberships_for_account(gen_random_uuid()), 'ok', 'an unknown user is fine');
select public.anonymise_profile('00000000-0000-0000-0000-00000000000b');
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000b'),
  'ok', 'after the profile is anonymised the retry still succeeds'
);
reset role;

select * from finish();
rollback;
