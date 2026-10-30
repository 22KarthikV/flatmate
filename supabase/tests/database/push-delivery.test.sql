begin;
select plan(37);

-- Push delivery plumbing (SPEC-notifications N5, N6, N12): a worker claims due outbox rows without
-- two workers ever getting the same one, reports what happened, and retention deletes only what it should.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.create_household('Flat A');
reset role;
insert into public.memberships (household_id, profile_id)
select h.id, p.id from public.households h, public.profiles p where h.name = 'Flat A' and p.display_name = 'Bob';

select set_config('t.bob', (select id::text from public.profiles where display_name = 'Bob'), true);
select set_config('t.flat', (select id::text from public.households where name = 'Flat A'), true);

-- Bob has two phones. A role change pushes by default, so it queues one row per phone.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  (current_setting('t.bob')::uuid, 'https://push.example/phone', 'k1', 'a1'),
  (current_setting('t.bob')::uuid, 'https://push.example/laptop', 'k2', 'a2');
select private.notify(current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'role_changed',
  'You are now an admin', 'Alice changed your role in Flat A.', '/more/flat', 'k:1');

-- Claiming ------------------------------------------------------------------------------------
set local role service_role;
create temp table claimed as select * from public.claim_push_outbox(10);
grant all on claimed to public;
reset role;

select is((select count(*)::int from claimed), 2, 'a worker claims both due rows');
select is((select count(*)::int from claimed where attempts = 1), 2, 'claiming counts as the first attempt');
select results_eq(
  $$select distinct title, body, href from claimed$$,
  $$values ('You are now an admin'::text, 'Alice changed your role in Flat A.'::text, '/more/flat'::text)$$,
  'a claim carries the title, line and path, and nothing else about the notification'
);
select results_eq(
  $$select endpoint from claimed order by 1$$,
  $$values ('https://push.example/laptop'::text), ('https://push.example/phone'::text)$$,
  'each claimed row names its own device'
);

set local role service_role;
select is((select count(*)::int from public.claim_push_outbox(10)), 0, 'a second worker gets nothing: the rows are leased');
reset role;

-- Once the lease runs out they can be claimed again, one at a time, never the same row twice.
update public.push_outbox set next_attempt_at = now() - interval '1 second';
set local role service_role;
create temp table first_claim as select outbox_id from public.claim_push_outbox(1);
create temp table second_claim as select outbox_id from public.claim_push_outbox(1);
grant all on first_claim, second_claim to public;
reset role;
select is((select count(*)::int from first_claim), 1, 'a limit of one claims one row');
select isnt(
  (select outbox_id from first_claim), (select outbox_id from second_claim),
  'the next claim gets a different row'
);
set local role service_role;
select is((select count(*)::int from public.claim_push_outbox(10)), 0, 'and then nothing is left to claim');
reset role;

-- Reporting results ---------------------------------------------------------------------------
select set_config('t.phone_out', (select o.id::text from public.push_outbox o
  join public.push_subscriptions s on s.id = o.subscription_id where s.endpoint = 'https://push.example/phone'), true);
select set_config('t.laptop_out', (select o.id::text from public.push_outbox o
  join public.push_subscriptions s on s.id = o.subscription_id where s.endpoint = 'https://push.example/laptop'), true);

set local role service_role;
select public.complete_push(current_setting('t.phone_out')::uuid, 'sent', null, null);
reset role;
select isnt((select sent_at from public.push_outbox where id = current_setting('t.phone_out')::uuid), null, 'sent is recorded');
select results_eq(
  $$select last_success_at is not null, failed_at is null from public.push_subscriptions where endpoint = 'https://push.example/phone'$$,
  $$values (true, true)$$,
  'a success marks the device healthy'
);

set local role service_role;
select public.complete_push(current_setting('t.laptop_out')::uuid, 'retry', 60, 'HTTP 503');
reset role;
select is(
  (select next_attempt_at from public.push_outbox where id = current_setting('t.laptop_out')::uuid),
  now() + interval '60 seconds',
  'a failure schedules the retry after the delay it was given'
);
select is(
  (select last_error from public.push_outbox where id = current_setting('t.laptop_out')::uuid),
  'HTTP 503',
  'and records why'
);
select isnt(
  (select failed_at from public.push_subscriptions where endpoint = 'https://push.example/laptop'), null,
  'and marks the device as having trouble'
);
set local role service_role;
select is((select count(*)::int from public.claim_push_outbox(10)), 0, 'a retry is not claimed before it is due');
reset role;
update public.push_outbox set next_attempt_at = now() - interval '1 second' where id = current_setting('t.laptop_out')::uuid;
set local role service_role;
select is((select count(*)::int from public.claim_push_outbox(10)), 1, 'it is claimed again once due');

select public.complete_push(current_setting('t.laptop_out')::uuid, 'give_up', null, 'HTTP 503');
reset role;
select is(
  (select next_attempt_at from public.push_outbox where id = current_setting('t.laptop_out')::uuid),
  'infinity'::timestamptz,
  'giving up parks the row forever'
);
set local role service_role;
select is((select count(*)::int from public.claim_push_outbox(10)), 0, 'a parked row is never claimed again');

-- A late report about something already sent changes nothing.
select public.complete_push(current_setting('t.phone_out')::uuid, 'retry', 60, 'late');
reset role;
select is(
  (select last_error from public.push_outbox where id = current_setting('t.phone_out')::uuid), null,
  'a sent row ignores a late failure report'
);

-- A device the push service says is gone is removed, with its queued rows.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.bob')::uuid, 'https://push.example/old', 'k3', 'a3');
select private.notify(current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'role_changed',
  'You are now a member', '', '/more/flat', 'k:2');
select set_config('t.old_out', (select o.id::text from public.push_outbox o
  join public.push_subscriptions s on s.id = o.subscription_id where s.endpoint = 'https://push.example/old'), true);
set local role service_role;
select public.complete_push(current_setting('t.old_out')::uuid, 'gone', null, null);
reset role;
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/old'), 0,
  'a gone device is deleted');
select is((select count(*)::int from public.push_outbox where id = current_setting('t.old_out')::uuid), 0,
  'with its outbox rows');

-- Who may call these ----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select * from public.claim_push_outbox(10)$$, '42501', null, 'a signed-in person cannot claim');
select throws_ok($$select public.complete_push(gen_random_uuid(), 'sent', null, null)$$, '42501', null,
  'a signed-in person cannot report results');
reset role;
set local role anon;
select throws_ok($$select * from public.claim_push_outbox(10)$$, '42501', null, 'anon cannot claim');
reset role;
set local role service_role;
select throws_ok($$select public.complete_push(gen_random_uuid(), 'nonsense', null, null)$$, 'P0001', 'invalid_result',
  'an unknown result is refused');
reset role;

-- Retention -------------------------------------------------------------------------------------
insert into public.notifications (id, recipient_id, household_id, type, title, href, dedupe_key, created_at, read_at) values
  ('00000000-0000-0000-0000-0000000000a1', current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'member_left', 'old read', '/x', 'r:1', now() - interval '101 days', now() - interval '100 days'),
  ('00000000-0000-0000-0000-0000000000a2', current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'member_left', 'recent read', '/x', 'r:2', now() - interval '11 days', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000a3', current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'member_left', 'old unread', '/x', 'r:3', now() - interval '200 days', null),
  ('00000000-0000-0000-0000-0000000000a4', current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'member_left', 'sent long ago', '/x', 'r:4', now() - interval '21 days', null),
  ('00000000-0000-0000-0000-0000000000a5', current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'member_left', 'sent recently', '/x', 'r:5', now() - interval '3 days', null),
  ('00000000-0000-0000-0000-0000000000a6', current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'member_left', 'parked long ago', '/x', 'r:6', now() - interval '21 days', null),
  ('00000000-0000-0000-0000-0000000000a7', current_setting('t.bob')::uuid, current_setting('t.flat')::uuid, 'member_left', 'still waiting', '/x', 'r:7', now() - interval '21 days', null);

insert into public.push_outbox (id, notification_id, subscription_id, sent_at, next_attempt_at)
select o.id, o.n, (select id from public.push_subscriptions where endpoint = 'https://push.example/phone'), o.sent, o.next
  from (values
    ('00000000-0000-0000-0000-0000000000b4'::uuid, '00000000-0000-0000-0000-0000000000a4'::uuid, now() - interval '20 days', now() - interval '20 days'),
    ('00000000-0000-0000-0000-0000000000b5'::uuid, '00000000-0000-0000-0000-0000000000a5'::uuid, now() - interval '2 days', now() - interval '2 days'),
    ('00000000-0000-0000-0000-0000000000b6'::uuid, '00000000-0000-0000-0000-0000000000a6'::uuid, null::timestamptz, 'infinity'::timestamptz),
    ('00000000-0000-0000-0000-0000000000b7'::uuid, '00000000-0000-0000-0000-0000000000a7'::uuid, null::timestamptz, now() - interval '1 minute')
  ) as o(id, n, sent, next);

insert into public.job_runs (job_name, idempotency_key, created_at) values
  ('deliver-push', 'old-run', now() - interval '8 days'),
  ('deliver-push', 'new-run', now() - interval '1 day'),
  ('heartbeat', 'ancient-run', now() - interval '30 days');

select private.run_notification_retention();
select private.run_notification_retention();

select is((select count(*)::int from public.notifications where id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'a read notification over 90 days old is deleted');
select is((select count(*)::int from public.notifications where id = '00000000-0000-0000-0000-0000000000a2'), 1,
  'a recently read one is kept');
select is((select count(*)::int from public.notifications where id = '00000000-0000-0000-0000-0000000000a3'), 1,
  'an unread one is kept however old');
select is((select count(*)::int from public.push_outbox where id = '00000000-0000-0000-0000-0000000000b4'), 0,
  'an outbox row sent over 14 days ago is deleted');
select is((select count(*)::int from public.push_outbox where id = '00000000-0000-0000-0000-0000000000b5'), 1,
  'one sent recently is kept');
select is((select count(*)::int from public.push_outbox where id = '00000000-0000-0000-0000-0000000000b6'), 0,
  'a parked row for a notification over 14 days old is deleted');
select is((select count(*)::int from public.push_outbox where id = '00000000-0000-0000-0000-0000000000b7'), 1,
  'a row still waiting to be sent is kept');
select is((select count(*)::int from public.job_runs where idempotency_key = 'old-run'), 0,
  'old delivery run records are deleted');
select is((select count(*)::int from public.job_runs where idempotency_key in ('new-run', 'ancient-run')), 2,
  'recent delivery runs and other jobs'' records are kept');
select is((select count(*)::int from public.job_runs where job_name = 'notification-retention'), 1,
  'running retention twice in a day records one run');
select is((select status from public.job_runs where job_name = 'notification-retention'), 'succeeded', 'and it succeeded');

select is((select schedule from cron.job where jobname = 'deliver-push'), '* * * * *', 'the outbox is drained every minute');
select is((select schedule from cron.job where jobname = 'notification-retention'), '17 3 * * *', 'retention runs daily');

select * from finish();
rollback;
