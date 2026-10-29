begin;
select plan(59);

select has_table('public', 'notification_types', 'notification_types exists');
select has_table('public', 'notifications', 'notifications exists');
select has_table('public', 'notification_preferences', 'notification_preferences exists');
select has_table('public', 'push_subscriptions', 'push_subscriptions exists');
select has_table('public', 'push_outbox', 'push_outbox exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.notification_types'::regclass, 'public.notifications'::regclass,
                  'public.notification_preferences'::regclass, 'public.push_subscriptions'::regclass,
                  'public.push_outbox'::regclass)),
  'row-level security is enabled on every notifications table'
);

-- People. alice, bob and carol share Flat A; dave is alone in Flat D.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}');

select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');

-- A reminder-like type that can be snoozed (the launch types cannot).
insert into public.notification_types (type, default_in_app, default_push, snoozable)
values ('test_reminder', true, false, true);

-- Visitors can do nothing.
set local role anon;
select throws_ok($$select * from public.notifications$$, '42501', null, 'anon cannot read notifications');
select throws_ok($$select * from public.push_subscriptions$$, '42501', null, 'anon cannot read push subscriptions');
select throws_ok($$select public.mark_all_read()$$, '42501', null, 'anon cannot mark notifications read');
select throws_ok(
  $$select public.save_push_subscription('https://push.example/x', 'k', 'a', 'ua')$$,
  '42501', null, 'anon cannot save a push subscription'
);
reset role;

-- The writer is not reachable from the browser's roles.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001', 'member_joined', 't', '', '/', 'k')$$,
  '42501', null, 'a signed-in person cannot call private.notify'
);
reset role;

-- notify: one row per recipient and dedupe key.
select isnt(
  private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                 'member_joined', 'Carol joined Flat A', '', '/more/flat', 'joined:1'),
  null, 'notify creates a notification and returns its id'
);
select is(
  private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                 'member_joined', 'Carol joined Flat A', '', '/more/flat', 'joined:1'),
  null, 'the same dedupe key a second time creates nothing'
);
select is(
  (select count(*)::int from public.notifications
    where recipient_id = current_setting('t.bob')::uuid and dedupe_key = 'joined:1'),
  1, 'and there is still exactly one row'
);
select isnt(
  private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                 'member_joined', 'Dan joined Flat A', '', '/more/flat', 'joined:2'),
  null, 'a different dedupe key creates another'
);
select throws_ok(
  $$select private.notify(current_setting('t.dave')::uuid, 'a0000000-0000-0000-0000-000000000001', 'member_joined', 't', '', '/', 'x')$$,
  'P0001', 'recipient_not_in_household', 'a recipient outside the flat is refused'
);
select throws_ok(
  $$select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001', 'nonsense', 't', '', '/', 'x')$$,
  '23503', null, 'an unknown type is refused'
);
select throws_ok(
  $$select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001', 'member_joined', 't', '', '//evil.example', 'x')$$,
  '23514', null, 'a protocol-relative link is refused'
);
select throws_ok(
  $$select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001', 'member_joined', 't', '', 'https://evil.example', 'x')$$,
  '23514', null, 'an off-site link is refused'
);
select throws_ok(
  $$select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001', 'member_joined', '', '', '/', 'x')$$,
  '23514', null, 'an empty title is refused'
);

-- Preferences decide the inbox row and the push fan-out.
insert into public.push_subscriptions (id, profile_id, endpoint, p256dh, auth)
values ('b0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid,
        'https://push.example/bob', 'bob-key', 'bob-auth');

select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                      'role_changed', 'You are now an admin', '', '/more/flat', 'role:1');
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.dedupe_key = 'role:1'),
  1, 'a push-by-default type queues a push for each of the person''s devices'
);
select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                      'member_left', 'Carol left Flat A', '', '/more/flat', 'left:1');
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.dedupe_key = 'left:1'),
  0, 'an inbox-only type queues no push'
);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.set_notification_preference('member_left', true, true)$$,
  'a person can turn push on for a type'
);
select throws_ok(
  $$select public.set_notification_preference('nonsense', true, true)$$,
  '23503', null, 'preferences for an unknown type are refused'
);
reset role;
select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                      'member_left', 'Erin left Flat A', '', '/more/flat', 'left:2');
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.dedupe_key = 'left:2'),
  1, 'the saved preference overrides the default'
);

set local role authenticated;
select public.set_notification_preference('role_changed', true, false);
reset role;
select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                      'role_changed', 'You are a member again', '', '/more/flat', 'role:2');
select is(
  (select count(*)::int from public.notifications where dedupe_key = 'role:2'),
  1, 'with push off the inbox row still exists'
);
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.dedupe_key = 'role:2'),
  0, 'and no push is queued'
);

set local role authenticated;
select public.set_notification_preference('member_joined', false, false);
reset role;
select is(
  private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                 'member_joined', 'Fay joined Flat A', '', '/more/flat', 'joined:3'),
  null, 'with the inbox off for a type nothing is created'
);
select is(
  (select count(*)::int from public.notifications where dedupe_key = 'joined:3'),
  0, 'not even a row'
);

select private.notify(current_setting('t.carol')::uuid, 'a0000000-0000-0000-0000-000000000001',
                      'role_changed', 'You are now an admin', '', '/more/flat', 'role:3');
select is(
  (select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
    where n.dedupe_key = 'role:3'),
  0, 'a person with no devices gets the inbox row and no push'
);

-- Carol saves a preference of her own so bob's view of others can be checked.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.set_notification_preference('member_left', false, false);
reset role;

-- Isolation: each person sees only their own rows.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.notifications where recipient_id <> current_setting('t.bob')::uuid),
  0, 'bob sees no one else''s notifications, even in his own flat'
);
select cmp_ok(
  (select count(*)::int from public.notifications), '>', 0, 'bob sees his own'
);
select is(
  (select count(*)::int from public.notification_preferences where profile_id = current_setting('t.carol')::uuid),
  0, 'bob cannot read carol''s preferences'
);
select throws_ok(
  $$insert into public.notifications (recipient_id, household_id, type, title, body, href, dedupe_key)
    values (current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001', 'member_joined', 't', '', '/', 'forged')$$,
  '42501', null, 'the browser cannot insert a notification'
);
select throws_ok(
  $$update public.notifications set title = 'changed'$$, '42501', null, 'the browser cannot edit a notification'
);
select throws_ok(
  $$delete from public.notifications$$, '42501', null, 'the browser cannot delete a notification'
);
select throws_ok(
  $$insert into public.notification_preferences (profile_id, type) values (current_setting('t.bob')::uuid, 'member_joined')$$,
  '42501', null, 'preferences are written only through the function'
);
select throws_ok(
  $$select * from public.push_outbox$$, '42501', null, 'the browser cannot read the push outbox'
);
select is(
  (select count(*)::int from public.push_subscriptions), 1, 'bob sees his own device'
);
select throws_ok(
  $$select p256dh from public.push_subscriptions$$, '42501', null, 'but not its secret keys'
);
reset role;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.push_subscriptions), 0, 'carol cannot see bob''s device'
);
reset role;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.notifications), 0, 'someone in another flat sees nothing of bob''s'
);
reset role;

-- Reading and snoozing.
select set_config('t.bob_unread',
  (select id::text from public.notifications where dedupe_key = 'joined:1'), true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select public.mark_read(current_setting('t.bob_unread')::uuid);
reset role;
select is(
  (select read_at from public.notifications where id = current_setting('t.bob_unread')::uuid),
  null, 'marking someone else''s notification read changes nothing'
);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.mark_read(current_setting('t.bob_unread')::uuid);
reset role;
select isnt(
  (select read_at from public.notifications where id = current_setting('t.bob_unread')::uuid),
  null, 'a person can mark their own notification read'
);

set local role authenticated;
select public.mark_all_read();
reset role;
select is(
  (select count(*)::int from public.notifications
    where recipient_id = current_setting('t.bob')::uuid and read_at is null),
  0, 'mark_all_read clears every unread notification'
);

select private.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                      'test_reminder', 'Bins out tonight', '', '/rota', 'bins:1');
select set_config('t.reminder', (select id::text from public.notifications where dedupe_key = 'bins:1'), true);

set local role authenticated;
select throws_ok(
  $$select public.snooze(current_setting('t.bob_unread')::uuid, now() + interval '1 hour')$$,
  'P0001', 'not_snoozable', 'a type that cannot be snoozed is refused'
);
select lives_ok(
  $$select public.snooze(current_setting('t.reminder')::uuid, now() + interval '1 hour')$$,
  'a reminder can be snoozed'
);
select throws_ok(
  $$select public.snooze(current_setting('t.reminder')::uuid, now() - interval '1 minute')$$,
  'P0001', 'invalid_snooze', 'snoozing into the past is refused'
);
select throws_ok(
  $$select public.snooze(current_setting('t.reminder')::uuid, now() + interval '8 days')$$,
  'P0001', 'invalid_snooze', 'snoozing for more than a week is refused'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.snooze(current_setting('t.reminder')::uuid, now() + interval '1 hour')$$,
  'P0001', 'not_found', 'nobody can snooze someone else''s notification'
);
reset role;

-- Devices.
set local role authenticated;
select lives_ok(
  $$select public.save_push_subscription('https://push.example/carol', 'carol-key', 'carol-auth', 'Safari on iPhone')$$,
  'a person can save a device'
);
select is(
  (select count(*)::int from public.push_subscriptions), 1, 'and sees it'
);
select throws_ok(
  $$select public.save_push_subscription('http://push.example/plain', 'k', 'a', 'ua')$$,
  'P0001', 'invalid_subscription', 'a plain http endpoint is refused'
);
reset role;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.save_push_subscription('https://push.example/carol', 'new-key', 'new-auth', 'Chrome');
reset role;
select is(
  (select profile_id from public.push_subscriptions where endpoint = 'https://push.example/carol'),
  current_setting('t.bob')::uuid, 'the same device saved by a new person moves to that person'
);

select set_config('t.moved', (select id::text from public.push_subscriptions where endpoint = 'https://push.example/carol'), true);
set local role authenticated;
delete from public.push_subscriptions where id = current_setting('t.moved')::uuid;
reset role;
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/carol'),
  0, 'a person can remove their own device'
);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
delete from public.push_subscriptions;
reset role;
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/bob'),
  1, 'but cannot remove someone else''s'
);

-- The service role may notify; the browser's roles may not.
set local role service_role;
select lives_ok(
  $$select public.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001',
                         'test_reminder', 'Rent due', '', '/money', 'rent:1')$$,
  'the service role can notify'
);
reset role;
set local role authenticated;
select throws_ok(
  $$select public.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001', 'test_reminder', 'x', '', '/', 'y')$$,
  '42501', null, 'a signed-in person cannot'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.notify(current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001', 'test_reminder', 'x', '', '/', 'y')$$,
  '42501', null, 'a visitor cannot'
);
reset role;

select * from finish();
rollback;
