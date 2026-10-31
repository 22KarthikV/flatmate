begin;
select plan(36);

-- Extras E: the noticeboard (SPEC-extras E). Posts expire by themselves unless an admin pins them.

select has_table('public', 'board_posts', 'board_posts exists');
select ok((select relrowsecurity from pg_class where oid = 'public.board_posts'::regclass), 'row-level security is enabled');
select ok(
  not exists (select 1 from unnest(array['select','insert','update','delete','truncate']) p(priv)
               where has_table_privilege('anon', 'public.board_posts', p.priv)),
  'anon has no privileges on the board');
select ok(
  not exists (select 1 from unnest(array['insert','update','delete','truncate']) p(priv)
               where has_table_privilege('authenticated', 'public.board_posts', p.priv))
  and has_table_privilege('authenticated', 'public.board_posts', 'select'),
  'the browser role can only read the board');
select ok(
  not has_function_privilege('anon', 'public.post_to_board(text, integer, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.pin_board_post(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.delete_board_post(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.post_to_board(text, integer, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.pin_board_post(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.delete_board_post(uuid)', 'execute'),
  'signed-in people can call the board functions; anon cannot');
select results_eq(
  $$select default_in_app, default_push, snoozable, push_title, push_body from public.notification_types where type = 'board_posted'$$,
  $$values (true, false, false, 'New note'::text, 'A flatmate posted a note on the noticeboard.'::text)$$,
  'board_posted is in the registry: inbox only, with fixed push text');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name": "Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', '{"full_name": "Dave"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name": "Frank"}');
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), true);
select set_config('t.carol', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000c'), true);
select set_config('t.dave', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000d'), true);
select set_config('t.frank', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000f'), true);
insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('d0000000-0000-0000-0000-000000000001', 'Flat D', current_setting('t.dave')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.carol')::uuid, 'member'),
  ('d0000000-0000-0000-0000-000000000001', current_setting('t.dave')::uuid, 'owner');
insert into public.memberships (household_id, profile_id, role, left_at, left_reason)
values ('a0000000-0000-0000-0000-000000000001', current_setting('t.frank')::uuid, 'member', now(), 'left');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (current_setting('t.carol')::uuid, 'https://push.example/carol', 'k', 'a');

-- Bob posts.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.p1', public.post_to_board('  Landlord visiting Thursday 10am ', 3, false)::text, true);
select throws_ok($$ select public.post_to_board('   ', 7, false) $$, '22023', 'invalid_body', 'an empty post is refused');
select throws_ok($$ select public.post_to_board(repeat('x', 281), 7, false) $$, '22023', 'invalid_body', 'a 281 character post is refused');
select throws_ok($$ select public.post_to_board('x', 2, false) $$, '22023', 'invalid_expiry', 'an expiry other than 1, 3, 7 or 30 days is refused');
select throws_ok($$ select public.post_to_board('Rule', 7, true) $$, '42501', 'not_allowed', 'a member cannot post pinned');
select throws_ok(format($$ select public.pin_board_post(%L, true) $$, current_setting('t.p1')), '42501', 'not_allowed', 'a member cannot pin');
reset role;

select results_eq(
  $$select body, author_id, household_id, pinned_at is null, expires_at > now() + interval '2 days 23 hours' and expires_at < now() + interval '3 days 1 hour'
      from public.board_posts where id = current_setting('t.p1')::uuid$$,
  $$select 'Landlord visiting Thursday 10am'::text, current_setting('t.bob')::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, true, true$$,
  'the post is trimmed, belongs to the flat and expires in 3 days');

-- Notifications: others in the flat, not the author, not the leaver, no post text, no push by default.
select is((select count(*)::int from public.notifications where dedupe_key = 'board:' || current_setting('t.p1')), 2,
  'Alice and Carol are told');
select is((select count(*)::int from public.notifications where dedupe_key = 'board:' || current_setting('t.p1')
            and recipient_id in (current_setting('t.bob')::uuid, current_setting('t.frank')::uuid)), 0,
  'the author and a former member are not');
select ok(not exists (select 1 from public.notifications where dedupe_key = 'board:' || current_setting('t.p1')
                       and (title || body) ilike '%landlord%'), 'the notification does not contain the post''s words');
select is((select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
            where n.type = 'board_posted'), 0, 'no push is queued by default');

-- Visibility: another flat sees nothing; expired and deleted posts are invisible through the policy.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.board_posts), 0, 'another flat sees no posts');
select throws_ok(format($$ select public.delete_board_post(%L) $$, current_setting('t.p1')), 'P0001', 'post_not_found', 'deleting another flat''s post is "not found"');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.board_posts), 1, 'a member sees the live post');
reset role;
update public.board_posts set expires_at = now() - interval '1 minute' where id = current_setting('t.p1')::uuid;
set local role authenticated;
select is((select count(*)::int from public.board_posts), 0, 'an expired post is invisible to members through the policy');
reset role;
update public.board_posts set expires_at = now() + interval '1 day' where id = current_setting('t.p1')::uuid;

-- Constraint: an unpinned post with no expiry is refused by the table.
select throws_ok($$ insert into public.board_posts (household_id, author_id, body)
  values ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'forever') $$,
  '23514', null, 'an unpinned post with no expiry is refused');

-- Delete: another member cannot; the author and an admin can.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(format($$ select public.delete_board_post(%L) $$, current_setting('t.p1')), '42501', 'not_allowed', 'another member cannot delete someone else''s post');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.delete_board_post(current_setting('t.p1')::uuid);
select is((select count(*)::int from public.board_posts), 0, 'a deleted post disappears at once');
select throws_ok(format($$ select public.delete_board_post(%L) $$, current_setting('t.p1')), 'P0001', 'post_not_found', 'and cannot be deleted twice');
select set_config('t.p2', public.post_to_board('Boiler engineer 8 to 12', 1, false)::text, true);
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select public.delete_board_post(current_setting('t.p2')::uuid);
reset role;
select is((select deleted_by from public.board_posts where id = current_setting('t.p2')::uuid), current_setting('t.alice')::uuid,
  'an admin can delete any post');

-- Pinning: admin only, at most three, unpinning sets a 7 day expiry.
set local role authenticated;
select set_config('t.r1', public.post_to_board('House rule one', 7, true)::text, true);
select set_config('t.r2', public.post_to_board('House rule two', 7, true)::text, true);
select set_config('t.r3', public.post_to_board('House rule three', 7, true)::text, true);
select throws_ok($$ select public.post_to_board('House rule four', 7, true) $$, 'P0001', 'too_many_pinned', 'the fourth pin is refused');
reset role;
select ok((select pinned_at is not null and expires_at is null from public.board_posts where id = current_setting('t.r1')::uuid),
  'a post made pinned has no expiry');
update public.board_posts set created_at = created_at - interval '1 day' where author_id = current_setting('t.alice')::uuid;
set local role authenticated;
select set_config('t.n1', public.post_to_board('A normal note', 7, false)::text, true);
select throws_ok(format($$ select public.pin_board_post(%L, true) $$, current_setting('t.n1')), 'P0001', 'too_many_pinned', 'pinning a fourth existing post is refused');
select public.pin_board_post(current_setting('t.r1')::uuid, false);
select public.pin_board_post(current_setting('t.n1')::uuid, true);
reset role;
select ok((select pinned_at is null and expires_at > now() + interval '6 days 23 hours' from public.board_posts where id = current_setting('t.r1')::uuid),
  'unpinning gives the post a 7 day expiry');
select ok((select pinned_at is not null from public.board_posts where id = current_setting('t.n1')::uuid), 'and frees a pin for another post');
set local role authenticated;
select lives_ok(format($$ select public.pin_board_post(%L, true) $$, current_setting('t.n1')), 'pinning an already pinned post is harmless');
reset role;

-- Posting too fast: 5 a day, counted by London date, deleted posts included (Bob has made 2 today).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;
select public.post_to_board('Bob ' || n, 1, false) from generate_series(1, 3) n;
select throws_ok($$ select public.post_to_board('Bob 6', 1, false) $$, 'P0001', 'posting_too_fast', 'a sixth post in a day is refused');
reset role;

-- Account deletion removes the person's posts.
select public.anonymise_profile('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.board_posts where author_id = current_setting('t.bob')::uuid), 0,
  'deleting an account deletes the person''s posts');

-- Retention.
insert into public.board_posts (household_id, author_id, body, expires_at, deleted_at, deleted_by)
values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'old deleted', now() + interval '1 day', now() - interval '40 days', current_setting('t.alice')::uuid),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'recent deleted', now() + interval '1 day', now() - interval '5 days', current_setting('t.alice')::uuid);
insert into public.board_posts (household_id, author_id, body, expires_at)
values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'old expired', now() - interval '40 days'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'recent expired', now() - interval '5 days');
select private.run_board_retention(now());
select private.run_board_retention(now());
select is((select string_agg(body, ',' order by body) from public.board_posts where body in ('old deleted', 'recent deleted', 'old expired', 'recent expired')),
  'recent deleted,recent expired', 'retention removes only rows older than 30 days');
select is((select count(*)::int from public.job_runs where job_name = 'board-retention'), 1, 'and is recorded once however often it runs');
select ok(exists (select 1 from cron.job where jobname = 'board-retention' and schedule = '37 3 * * *'), 'scheduled at 03:37 UTC');

select * from finish();
rollback;
