begin;
select plan(29);

-- Household events tell the right people (SPEC-notifications, "First events"), in the same
-- transaction as the event. Alice owns Flat A; Bob, Carol and Dave come and go. Erin owns Flat E alone.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@example.com', '{"full_name": "Erin"}');

-- Alice creates the flat and a link. Making a flat tells nobody anything.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat A');
select set_config('test.token', public.create_invite(), true);
reset role;

select is((select count(*)::int from public.notifications), 0, 'creating a flat notifies nobody');

-- Bob joins: Alice hears, Bob does not.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.join_household(current_setting('test.token'));
reset role;

select results_eq(
  $$select p.display_name, n.type, n.title, n.href
      from public.notifications n join public.profiles p on p.id = n.recipient_id$$,
  $$values ('Alice'::text, 'member_joined'::text, 'Bob joined Flat A'::text, '/more/flat'::text)$$,
  'a join tells the existing member, once, and nobody else'
);
select is(
  (select n.dedupe_key from public.notifications n join public.profiles p on p.id = n.recipient_id
    where p.display_name = 'Alice'),
  'joined:' || (select m.id from public.memberships m join public.profiles p on p.id = m.profile_id
                 where p.display_name = 'Bob'),
  'the dedupe key is joined:<membership id>'
);
select is(
  (select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id
    where p.display_name = 'Bob'),
  0,
  'the joiner is not told about their own join'
);

-- Carol joins: Alice and Bob hear, Carol does not.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.join_household(current_setting('test.token'));
reset role;

select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.title = 'Carol joined Flat A' order by 1$$,
  $$values ('Alice'::text), ('Bob'::text)$$,
  'a join tells every other active member'
);
select is(
  (select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id
    where p.display_name = 'Carol'),
  0,
  'the second joiner is not told about their own join either'
);
-- Bob has a phone registered: role changes push by default, joins and leaves do not.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
select id, 'https://push.example/bob', 'k', 'a' from public.profiles where display_name = 'Bob';

-- Alice makes Bob an admin.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.set_member_role((select id from public.profiles where display_name = 'Bob'), 'admin');
reset role;

select results_eq(
  $$select p.display_name, n.type, n.title from public.notifications n
      join public.profiles p on p.id = n.recipient_id where n.type = 'role_changed'$$,
  $$values ('Bob'::text, 'role_changed'::text, 'You are now an admin'::text)$$,
  'a promotion tells the person promoted, and only them'
);
select is(
  (select n.dedupe_key from public.notifications n where n.type = 'role_changed'),
  'role:' || (select m.id from public.memberships m join public.profiles p on p.id = m.profile_id
               where p.display_name = 'Bob') || ':admin:1',
  'the dedupe key is role:<membership id>:<role>:<n>'
);
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.type = 'role_changed'),
  1,
  'a role change queues a push for the person''s device'
);
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.type = 'member_joined'),
  0,
  'a join queues no push by default'
);

-- Saying the same role again changes nothing and says nothing.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.set_member_role((select id from public.profiles where display_name = 'Bob'), 'admin');
reset role;
select is(
  (select count(*)::int from public.notifications where type = 'role_changed'),
  1,
  'setting the role someone already has creates no second notification'
);

-- Demote, then promote again: each real change is its own notification.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.set_member_role((select id from public.profiles where display_name = 'Bob'), 'member');
select public.set_member_role((select id from public.profiles where display_name = 'Bob'), 'admin');
reset role;

select is(
  (select string_agg(regexp_replace(dedupe_key, '^role:[0-9a-f-]+:', ''), ',' order by dedupe_key)
     from public.notifications where type = 'role_changed'),
  'admin:1,admin:2,member:1',
  'a role going back and forth numbers each change so none is swallowed'
);
select is(
  (select title from public.notifications where dedupe_key like 'role:%:member:1'),
  'You are now a member',
  'a demotion reads "You are now a member"'
);
select is(
  (select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id
    where n.type = 'role_changed' and p.display_name = 'Alice'),
  0,
  'the person who changed the role is not notified'
);

-- A refused action leaves no trace: nobody can change the owner.
select set_config('test.before', (select count(*)::text from public.notifications), true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.set_member_role((select id from public.profiles where display_name = 'Alice'), 'member')$$,
  '42501', null, 'an admin cannot demote the owner'
);
reset role;
select is(
  (select count(*)::text from public.notifications),
  current_setting('test.before'),
  'a refused role change creates no notification'
);

-- Carol leaves: Alice and Bob hear, Carol does not.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.leave_household();
reset role;

select results_eq(
  $$select p.display_name, n.title from public.notifications n
      join public.profiles p on p.id = n.recipient_id where n.type = 'member_left' order by 1$$,
  $$values ('Alice'::text, 'Carol left Flat A'::text), ('Bob'::text, 'Carol left Flat A'::text)$$,
  'leaving tells the members who remain, not the person leaving'
);
select is(
  (select count(distinct n.dedupe_key)::int from public.notifications n where n.type = 'member_left'),
  1,
  'both copies share one key, left:<membership id>'
);
select is(
  (select n.dedupe_key from public.notifications n join public.profiles p on p.id = n.recipient_id
    where n.type = 'member_left' and p.display_name = 'Alice'),
  'left:' || (select m.id from public.memberships m join public.profiles p on p.id = m.profile_id
               where p.display_name = 'Carol'),
  'the leave key uses the membership that ended'
);

-- Dave joins and Alice removes him: Bob hears, Alice (who did it) and Dave do not.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select set_config('test.token', public.create_invite(), true);
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select public.join_household(current_setting('test.token'));
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.remove_member((select id from public.profiles where display_name = 'Dave'));
reset role;

select results_eq(
  $$select p.display_name from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.title = 'Dave was removed from Flat A'$$,
  $$values ('Bob'::text)$$,
  'a removal tells the other remaining members, worded "was removed"'
);
select is(
  (select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id
    where p.display_name in ('Dave', 'Alice') and n.type = 'member_left'
      and n.title = 'Dave was removed from Flat A'),
  0,
  'neither the person removed nor the person who removed them is told'
);
select is(
  (select n.dedupe_key from public.notifications n where n.title = 'Dave was removed from Flat A'),
  'left:' || (select m.id from public.memberships m join public.profiles p on p.id = m.profile_id
               where p.display_name = 'Dave'),
  'a removal uses the same left:<membership id> key'
);

-- Account deletion: Bob's membership ends, Alice hears. Repeating it says nothing more.
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000b'),
  'ok',
  'ending a deleted account''s membership still answers ok'
);
select is(
  (select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id
    where p.display_name = 'Alice' and n.title = 'Bob left Flat A'),
  1,
  'an account deletion tells the members who remain'
);
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000b'),
  'ok',
  'the account-deletion step can be repeated'
);
select is(
  (select count(*)::int from public.notifications where title = 'Bob left Flat A'),
  1,
  'repeating the account-deletion step creates no second notification'
);

-- A lone owner deleting their account closes the flat and tells nobody.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat E');
reset role;
select set_config('test.before', (select count(*)::text from public.notifications), true);
select is(
  public.end_memberships_for_account('00000000-0000-0000-0000-00000000000e'),
  'ok',
  'a lone owner''s flat closes'
);
select is(
  (select count(*)::text from public.notifications),
  current_setting('test.before'),
  'closing a flat nobody else is in notifies nobody'
);

-- Everything above stayed inside its own flat.
select is(
  (select count(*)::int from public.notifications n where n.household_id <>
     (select id from public.households where name = 'Flat A')),
  0,
  'no notification was written for another flat'
);

select * from finish();
rollback;
