begin;
select plan(14);

-- Deleting an account removes the person's notification data and stops other people's inboxes
-- from keeping their name (SPEC-notifications N13). anonymise_profile keeps the profile row, so
-- this cannot rely on cascades.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat A');
select set_config('test.token', public.create_invite(), true);
reset role;

select set_config('t.bob', (select id::text from public.profiles where display_name = 'Bob'), true);
select set_config('t.carol', (select id::text from public.profiles where display_name = 'Carol'), true);
select set_config('t.alice', (select id::text from public.profiles where display_name = 'Alice'), true);

-- Bob has a phone, and a saved choice, before anything happens.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.bob')::uuid, 'https://push.example/bob', 'k', 'a');
insert into public.notification_preferences (profile_id, type, in_app, push)
values (current_setting('t.bob')::uuid, 'member_joined', true, true);
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.carol')::uuid, 'https://push.example/carol', 'k', 'a');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.join_household(current_setting('test.token'));
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.join_household(current_setting('test.token'));
reset role;

-- Alice makes Bob and Carol admins: each gets a role notification (and Bob and Carol a queued push).
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.set_member_role(current_setting('t.bob')::uuid, 'admin');
select public.set_member_role(current_setting('t.carol')::uuid, 'admin');
reset role;

select cmp_ok(
  (select count(*)::int from public.notifications where recipient_id = current_setting('t.bob')::uuid), '>=', 2,
  'before deleting, Bob has notifications (Carol joined, his role change)'
);
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.recipient_id = current_setting('t.bob')::uuid), 2,
  'and queued pushes for his phone (his role change, and Carol''s join because he turned that on)'
);
select is(
  (select body from public.notifications where recipient_id = current_setting('t.carol')::uuid and type = 'role_changed'),
  'Your role in Flat A was changed.',
  'a role-change message does not name the admin who made it'
);

-- Bob deletes his account, the way the Edge Function does: leave the flat, then anonymise.
select is(public.end_memberships_for_account('00000000-0000-0000-0000-00000000000b'), 'ok', 'Bob leaves the flat');
select public.anonymise_profile('00000000-0000-0000-0000-00000000000b');

select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.bob')::uuid), 0,
  'Bob''s notifications are gone');
select is((select count(*)::int from public.notification_preferences where profile_id = current_setting('t.bob')::uuid), 0,
  'his saved preferences are gone');
select is((select count(*)::int from public.push_subscriptions where profile_id = current_setting('t.bob')::uuid), 0,
  'his phone can no longer be pushed to');
select is(
  (select count(*)::int from public.push_outbox o
     where not exists (select 1 from public.push_subscriptions s where s.id = o.subscription_id)), 0,
  'and no queued push is left behind for it'
);

select results_eq(
  $$select title from public.notifications where recipient_id = current_setting('t.alice')::uuid and type in ('member_joined', 'member_left') order by 1$$,
  $$values ('Carol joined Flat A'::text), ('Deleted user joined Flat A'::text), ('Deleted user left Flat A'::text)$$,
  'what Alice was told about Bob now says Deleted user, and what she was told about Carol is untouched'
);
select is(
  (select count(*)::int from public.notifications where title ilike '%Bob%' or body ilike '%Bob%'), 0,
  'Bob''s name appears in no one''s notifications'
);
select is(
  (select dedupe_key from public.notifications where recipient_id = current_setting('t.alice')::uuid and title = 'Deleted user left Flat A') ~ '^left:[0-9a-f-]{36}$',
  true,
  'the rewritten notification keeps its dedupe key'
);

-- Carol is untouched.
select is((select count(*)::int from public.push_subscriptions where profile_id = current_setting('t.carol')::uuid), 1,
  'Carol''s phone is still registered');
select cmp_ok((select count(*)::int from public.notifications where recipient_id = current_setting('t.carol')::uuid), '>=', 1,
  'and her notifications are kept');

-- Repeating the step (the Edge Function is retried if the sign-in deletion fails) changes nothing.
select lives_ok(
  $$select public.anonymise_profile('00000000-0000-0000-0000-00000000000b')$$,
  'anonymising again is harmless'
);

select * from finish();
rollback;
