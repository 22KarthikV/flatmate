begin;
select plan(82);

-- Events: proposing, voting, the majority rule, tie-breaks, editing and cancelling (SPEC-events E2).
--
-- Flat A: Alice (owner, organiser), Bea (admin), Cy, Di, Ed (members) = five people, so three yes
-- confirm a date. Flat G: Gus, with an event of his own that nobody in A can touch.

create function pg_temp.as_user(p text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.profiles where id = p::uuid), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-000000000002', 'bea@example.com', '{"full_name": "Bea"}'),
  ('00000000-0000-0000-0000-000000000003', 'cy@example.com', '{"full_name": "Cy"}'),
  ('00000000-0000-0000-0000-000000000004', 'di@example.com', '{"full_name": "Di"}'),
  ('00000000-0000-0000-0000-000000000005', 'ed@example.com', '{"full_name": "Ed"}'),
  ('00000000-0000-0000-0000-000000000009', 'gus@example.com', '{"full_name": "Gus"}');
select set_config('t.' || split_part(u.email, '@', 1), p.id::text, true)
  from auth.users u join public.profiles p on p.user_id = u.id;

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid),
  ('90000000-0000-0000-0000-000000000001', 'Flat G', current_setting('t.gus')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bea')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.cy')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.di')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.ed')::uuid, 'member'),
  ('90000000-0000-0000-0000-000000000001', current_setting('t.gus')::uuid, 'owner');

create function pg_temp.opts(p_a int, p_b int) returns jsonb language sql as
  $$ select jsonb_build_array(
       jsonb_build_object('startsAt', (now() + make_interval(days => p_a))::text),
       jsonb_build_object('startsAt', (now() + make_interval(days => p_b))::text, 'endsAt', (now() + make_interval(days => p_b, hours => 2))::text)) $$;
create function pg_temp.dl(p_days int) returns timestamptz language sql as
  $$ select now() + make_interval(days => p_days) $$;

-- The rule on its own, against the same vectors the TypeScript tests use (src/features/events/parity-vectors.ts).
create temp table vectors (name text, members int, yes int[], early_outcome text, early_dates int[], dl_outcome text, dl_dates int[]);
insert into vectors values
  ('1 of 1', 1, '{1,0}', 'confirm', '{0}', 'confirm', '{0}'),
  ('1 of 2', 2, '{1,0}', 'wait', '{}', 'confirm', '{0}'),
  ('2 of 2', 2, '{0,2}', 'confirm', '{1}', 'confirm', '{1}'),
  ('2 of 3', 3, '{2,1}', 'confirm', '{0}', 'confirm', '{0}'),
  ('2 of 4', 4, '{2,1}', 'wait', '{}', 'confirm', '{0}'),
  ('3 of 4', 4, '{1,3}', 'confirm', '{1}', 'confirm', '{1}'),
  ('3 of 5', 5, '{3,2}', 'confirm', '{0}', 'confirm', '{0}'),
  ('2 of 5 then deadline', 5, '{1,2,0}', 'wait', '{}', 'confirm', '{1}'),
  ('tie at deadline', 6, '{2,2,1}', 'wait', '{}', 'tiebreak', '{0,1}'),
  ('nobody yes', 3, '{0,0}', 'wait', '{}', 'cancel', '{}'),
  ('two cross, more yes', 3, '{2,3}', 'confirm', '{1}', 'confirm', '{1}'),
  ('two cross, level', 3, '{2,2}', 'tiebreak', '{0,1}', 'tiebreak', '{0,1}');
select is(
  (select count(*)::int from vectors v, lateral private.events_decide(v.yes, v.members, false) d
    where (d.outcome, d.dates) is distinct from (v.early_outcome, v.early_dates)),
  0, 'the early rule matches every shared vector');
select is(
  (select count(*)::int from vectors v, lateral private.events_decide(v.yes, v.members, true) d
    where (d.outcome, d.dates) is distinct from (v.dl_outcome, v.dl_dates)),
  0, 'the deadline rule matches every shared vector');

-- ---------------------------------------------------------------------------------------------
-- Privileges and notification types.
select ok(
  has_function_privilege('authenticated', 'public.propose_event(text, text, text, jsonb, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.update_event(uuid, text, text, text, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.add_event_option(uuid, timestamptz, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.remove_event_option(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.cast_event_vote(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.cancel_event(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.decide_event_tie(uuid, uuid)', 'execute'),
  'signed-in people can call the event functions');
select ok(
  not has_function_privilege('anon', 'public.propose_event(text, text, text, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.cast_event_vote(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.cancel_event(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.events_evaluate(uuid, timestamptz, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'private.events_confirm(uuid, uuid, text, timestamptz)', 'execute'),
  'anon cannot call them and the internal ones are closed to everyone');
select is(
  (select count(*)::int from public.notification_types where type like 'event\_%'
     and push_title is not null and push_body is not null),
  8, 'the eight event notification types exist with fixed push text');
select is(
  (select string_agg(type || ':' || default_in_app || default_push || snoozable, ',' order by type)
     from public.notification_types where type like 'event\_%'),
  'event_cancelled:truetruefalse,event_changed:truefalsefalse,event_confirmed:truetruefalse,event_organiser_changed:truefalsefalse,event_proposed:truetruefalse,event_reminder:truetruetrue,event_tiebreak:truetruefalse,event_vote_reminder:truetruetrue',
  'the defaults are the ones the spec states');
select ok(
  not exists (select 1 from public.notification_types where type like 'event\_%'
     and (push_title ~ '[0-9{}]' or push_body ~ '[0-9{}]')),
  'push text is generic: no numbers, names or placeholders');

-- ---------------------------------------------------------------------------------------------
-- Proposing.
select pg_temp.as_user(current_setting('t.alice'));
select set_config('t.pizza', public.propose_event('Pizza night', 'Bring toppings', 'Our kitchen', pg_temp.opts(5, 6), pg_temp.dl(2))::text, true);
reset role;
select is((select title || '/' || status || '/' || location from public.events where id = current_setting('t.pizza')::uuid),
  'Pizza night/voting/Our kitchen', 'Alice proposed an event, and it is open for voting');
select is((select count(*)::int from public.event_options where event_id = current_setting('t.pizza')::uuid), 2, 'with two dates');
select is((select count(*)::int from public.notifications where type = 'event_proposed' and dedupe_key = 'event_proposed:' || current_setting('t.pizza')),
  4, 'the other four flatmates are told');
select is((select count(*)::int from public.notifications where type = 'event_proposed' and recipient_id = current_setting('t.alice')::uuid),
  0, 'the organiser is not told about her own action');
select is((select title from public.notifications where type = 'event_proposed' and recipient_id = current_setting('t.cy')::uuid),
  'Alice proposed: Pizza night', 'the inbox row names the event');

select pg_temp.as_user(current_setting('t.alice'));
select throws_ok($sql$select public.propose_event('', '', null, pg_temp.opts(5, 6), pg_temp.dl(2))$sql$, 'P0001', 'invalid_title', 'a title is needed');
select throws_ok($sql$select public.propose_event(repeat('x', 81), '', null, pg_temp.opts(5, 6), pg_temp.dl(2))$sql$, 'P0001', 'invalid_title', 'a title over 80 characters is refused');
select throws_ok($sql$select public.propose_event('x', repeat('x', 501), null, pg_temp.opts(5, 6), pg_temp.dl(2))$sql$, 'P0001', 'invalid_description', 'a long description is refused');
select throws_ok($sql$select public.propose_event('x', '', repeat('x', 101), pg_temp.opts(5, 6), pg_temp.dl(2))$sql$, 'P0001', 'invalid_location', 'a long place is refused');
select throws_ok($sql$select public.propose_event('x', '', null, jsonb_build_array(jsonb_build_object('startsAt', (now() + interval '5 days')::text)), pg_temp.dl(2))$sql$,
  'P0001', 'invalid_options', 'one date is not enough');
select throws_ok($sql$select public.propose_event('x', '', null, (select jsonb_agg(jsonb_build_object('startsAt', (now() + make_interval(days => d))::text)) from generate_series(5, 13) d), pg_temp.dl(2))$sql$,
  'P0001', 'invalid_options', 'nine dates are too many');
select throws_ok($sql$select public.propose_event('x', '', null, jsonb_build_array(jsonb_build_object('startsAt', (now() - interval '1 day')::text), jsonb_build_object('startsAt', (now() + interval '5 days')::text)), pg_temp.dl(2))$sql$,
  'P0001', 'option_in_past', 'a date in the past is refused');
select throws_ok($sql$select public.propose_event('x', '', null, jsonb_build_array(jsonb_build_object('startsAt', '2099-01-01T10:00:00Z'), jsonb_build_object('startsAt', '2099-01-01T10:00:00Z')), pg_temp.dl(2))$sql$,
  'P0001', 'invalid_options', 'the same time twice is refused');
select throws_ok($sql$select public.propose_event('x', '', null, pg_temp.opts(5, 6), pg_temp.dl(5))$sql$, 'P0001', 'invalid_deadline', 'voting must close before the first date');
select throws_ok($sql$select public.propose_event('x', '', null, pg_temp.opts(5, 6), pg_temp.dl(-1))$sql$, 'P0001', 'invalid_deadline', 'voting must close in the future');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Voting: three of five confirm. Maybe and no never do.
select set_config('t.o1', (select id::text from public.event_options where event_id = current_setting('t.pizza')::uuid order by starts_at limit 1), true);
select set_config('t.o2', (select id::text from public.event_options where event_id = current_setting('t.pizza')::uuid order by starts_at desc limit 1), true);

select pg_temp.as_user(current_setting('t.bea'));
select is(public.cast_event_vote(current_setting('t.o1')::uuid, 'yes'), 'voting', 'one yes of five: still voting');
reset role;
select pg_temp.as_user(current_setting('t.cy'));
select is(public.cast_event_vote(current_setting('t.o1')::uuid, 'yes'), 'voting', 'two yes of five: still voting');
select is(public.cast_event_vote(current_setting('t.o2')::uuid, 'maybe'), 'voting', 'a maybe on another date changes nothing');
reset role;
select pg_temp.as_user(current_setting('t.di'));
select is(public.cast_event_vote(current_setting('t.o1')::uuid, 'maybe'), 'voting', 'a maybe does not count towards a majority');
select is(public.cast_event_vote(current_setting('t.o1')::uuid, 'no'), 'voting', 'changing to no does not confirm either');
reset role;
select is((select count(*)::int from public.event_votes where profile_id = current_setting('t.di')::uuid and event_id = current_setting('t.pizza')::uuid),
  1, 'a second answer from the same person updates, not duplicates');
select pg_temp.as_user(current_setting('t.di'));
select is(public.cast_event_vote(current_setting('t.o1')::uuid, null), 'voting', 'an answer can be cleared');
reset role;
select is((select count(*)::int from public.event_votes where profile_id = current_setting('t.di')::uuid), 0, 'and the row is gone');

select pg_temp.as_user(current_setting('t.ed'));
select is(public.cast_event_vote(current_setting('t.o1')::uuid, 'yes'), 'confirmed', 'the third yes of five confirms the date');
reset role;
select is((select status || '/' || confirmed_by || '/' || (confirmed_option_id = current_setting('t.o1')::uuid)::text from public.events where id = current_setting('t.pizza')::uuid),
  'confirmed/majority/true', 'confirmed by majority on the first date');
select is((select starts_at from public.events where id = current_setting('t.pizza')::uuid),
  (select starts_at from public.event_options where id = current_setting('t.o1')::uuid), 'its start time is copied to the event');
select is((select count(*)::int from public.notifications where type = 'event_confirmed' and dedupe_key = 'event_confirmed:' || current_setting('t.pizza')),
  5, 'everyone, including the last voter, is told once');
select matches((select title from public.notifications where type = 'event_confirmed' and recipient_id = current_setting('t.cy')::uuid),
  '^Pizza night is on: \w{3} \d{1,2} \w{3}, \d{2}:\d{2}$', 'the inbox row says when, in London time');

select is(private.events_evaluate(current_setting('t.pizza')::uuid, now(), true), 'confirmed', 'evaluating again changes nothing');
select is((select count(*)::int from public.notifications where type = 'event_confirmed' and dedupe_key = 'event_confirmed:' || current_setting('t.pizza')),
  5, 'and tells nobody twice');
select pg_temp.as_user(current_setting('t.di'));
select throws_ok(format($sql$select public.cast_event_vote('%s', 'yes')$sql$, current_setting('t.o2')), 'P0001', 'event_not_open', 'nobody can vote on a confirmed event');
reset role;

-- ---------------------------------------------------------------------------------------------
-- A leaver's vote stops counting: two yes plus one who left is not three.
select pg_temp.as_user(current_setting('t.alice'));
select set_config('t.walk', public.propose_event('Walk', '', null, pg_temp.opts(7, 8), pg_temp.dl(3))::text, true);
reset role;
select set_config('t.w1', (select id::text from public.event_options where event_id = current_setting('t.walk')::uuid order by starts_at limit 1), true);
select pg_temp.as_user(current_setting('t.alice'));
select public.cast_event_vote(current_setting('t.w1')::uuid, 'yes');
reset role;
select pg_temp.as_user(current_setting('t.cy'));
select public.cast_event_vote(current_setting('t.w1')::uuid, 'yes');
reset role;
update public.memberships set left_at = now(), left_reason = 'left'
 where profile_id = current_setting('t.cy')::uuid;
select is((select string_agg(yes || '/' || members, ',') from private.events_tally(current_setting('t.walk')::uuid)), '1/4,0/4',
  'a member who left does not count as a voter or in the total');
select pg_temp.as_user(current_setting('t.bea'));
select is(public.cast_event_vote(current_setting('t.w1')::uuid, 'yes'), 'voting', 'two yes of four is not a majority');
reset role;
select pg_temp.as_user(current_setting('t.di'));
select is(public.cast_event_vote(current_setting('t.w1')::uuid, 'yes'), 'confirmed', 'three yes of four is');
reset role;
select pg_temp.as_user(current_setting('t.cy'));
select throws_ok(format($sql$select public.cast_event_vote('%s', 'yes')$sql$, current_setting('t.w1')), 'P0001', 'event_not_found',
  'someone who left cannot vote');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Deadline rules go through events_evaluate with a moved clock. (Cy has left: four people remain.)
select pg_temp.as_user(current_setting('t.alice'));
select set_config('t.tie', public.propose_event('Tied', '', null, pg_temp.opts(9, 10), pg_temp.dl(4))::text, true);
select set_config('t.none', public.propose_event('Nobody', '', null, pg_temp.opts(11, 12), pg_temp.dl(4))::text, true);
reset role;
select set_config('t.t1', (select id::text from public.event_options where event_id = current_setting('t.tie')::uuid order by starts_at limit 1), true);
select set_config('t.t2', (select id::text from public.event_options where event_id = current_setting('t.tie')::uuid order by starts_at desc limit 1), true);
select pg_temp.as_user(current_setting('t.alice'));
select public.cast_event_vote(current_setting('t.t1')::uuid, 'yes');
reset role;
select pg_temp.as_user(current_setting('t.bea'));
select public.cast_event_vote(current_setting('t.t2')::uuid, 'yes');
reset role;
delete from public.notifications;
select is(private.events_evaluate(current_setting('t.tie')::uuid, now(), false), 'voting', 'before the deadline a split vote waits');
select is(private.events_evaluate(current_setting('t.tie')::uuid, now() + interval '5 days', true), 'tiebreak', 'at the deadline a tie goes to the organiser');
select is((select count(*)::int from public.notifications where type = 'event_tiebreak' and recipient_id = current_setting('t.alice')::uuid), 1, 'who is asked to pick');
select is(private.events_evaluate(current_setting('t.tie')::uuid, now() + interval '6 days', true), 'tiebreak', 'running it again leaves the tie alone');
select is((select count(*)::int from public.notifications where type = 'event_tiebreak'), 1, 'and does not ask twice');

select pg_temp.as_user(current_setting('t.bea'));
select throws_ok(format($sql$select public.decide_event_tie('%s', '%s')$sql$, current_setting('t.tie'), current_setting('t.t1')), '42501', 'not_allowed',
  'only the organiser picks after a tie');
reset role;
select pg_temp.as_user(current_setting('t.alice'));
select throws_ok(format($sql$select public.cast_event_vote('%s', 'yes')$sql$, current_setting('t.t1')), 'P0001', 'event_not_open', 'voting has stopped during a tie');
select throws_ok(format($sql$select public.decide_event_tie('%s', '%s')$sql$, current_setting('t.tie'), gen_random_uuid()), 'P0001', 'invalid_option', 'a date that was not tied cannot be picked');
select lives_ok(format($sql$select public.decide_event_tie('%s', '%s')$sql$, current_setting('t.tie'), current_setting('t.t2')), 'the organiser picks a tied date');
reset role;
select is((select status || '/' || confirmed_by || '/' || (confirmed_option_id = current_setting('t.t2')::uuid)::text from public.events where id = current_setting('t.tie')::uuid),
  'confirmed/organiser/true', 'and it is confirmed by the organiser');

select is(private.events_evaluate(current_setting('t.none')::uuid, now() + interval '5 days', true), 'cancelled', 'with no yes at all the event is cancelled');
select is((select cancelled_reason || '/' || coalesce(cancelled_by::text, 'app') from public.events where id = current_setting('t.none')::uuid),
  'Nobody could make any of the dates/app', 'with the stated reason and no person blamed');
select is((select count(*)::int from public.notifications where type = 'event_cancelled' and dedupe_key = 'event_cancelled:' || current_setting('t.none')),
  4, 'everyone still in the flat is told');

-- ---------------------------------------------------------------------------------------------
-- A vote after the deadline but before the job has run is refused.
select pg_temp.as_user(current_setting('t.alice'));
select set_config('t.late', public.propose_event('Late', '', null, pg_temp.opts(9, 10), pg_temp.dl(1))::text, true);
reset role;
update public.events set vote_deadline = now() - interval '1 minute' where id = current_setting('t.late')::uuid;
select pg_temp.as_user(current_setting('t.bea'));
select throws_ok(format($sql$select public.cast_event_vote('%s', 'yes')$sql$, (select id from public.event_options where event_id = current_setting('t.late')::uuid limit 1)),
  'P0001', 'voting_closed', 'voting ends at the deadline');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Editing: only the organiser, and everyone else hears about a real change once.
select pg_temp.as_user(current_setting('t.alice'));
select set_config('t.edit', public.propose_event('Board games', '', null, pg_temp.opts(9, 10), pg_temp.dl(3))::text, true);
reset role;
delete from public.notifications;
select pg_temp.as_user(current_setting('t.bea'));
select throws_ok(format($sql$select public.update_event('%s', 'Hacked', '', null)$sql$, current_setting('t.edit')), '42501', 'not_allowed', 'an admin cannot edit another person''s event');
reset role;
select pg_temp.as_user(current_setting('t.alice'));
select lives_ok(format($sql$select public.update_event('%s', 'Board games night', '', 'Lounge', null)$sql$, current_setting('t.edit')), 'the organiser can fix the title and place');
select lives_ok(format($sql$select public.update_event('%s', 'Board games night', '', 'Lounge', null)$sql$, current_setting('t.edit')), 'saving with no change is quiet');
select throws_ok(format($sql$select public.update_event('%s', 'x', '', null, now() + interval '20 days')$sql$, current_setting('t.edit')), 'P0001', 'invalid_deadline', 'the deadline must stay before the first date');
select lives_ok(format($sql$select public.update_event('%s', 'Board games night', '', 'Lounge', now() + interval '4 days')$sql$, current_setting('t.edit')), 'the deadline can move later');
reset role;
select is((select count(*)::int from public.notifications where type = 'event_changed' and recipient_id = current_setting('t.bea')::uuid), 2,
  'each real change is told once (the quiet save said nothing)');
select is((select count(*)::int from public.notifications where type = 'event_changed' and recipient_id = current_setting('t.alice')::uuid), 0, 'not to the editor');

-- Dates: add one, drop one, never fewer than two.
select pg_temp.as_user(current_setting('t.alice'));
select lives_ok(format($sql$select public.add_event_option('%s', now() + interval '12 days')$sql$, current_setting('t.edit')), 'the organiser adds a date');
select throws_ok(format($sql$select public.add_event_option('%s', now() + interval '3 days')$sql$, current_setting('t.edit')), 'P0001', 'invalid_deadline', 'a date before voting closes is refused');
select lives_ok(format($sql$select public.remove_event_option('%s')$sql$, (select id from public.event_options where event_id = current_setting('t.edit')::uuid order by starts_at limit 1)), 'and drops one, leaving two');
select throws_ok(format($sql$select public.remove_event_option('%s')$sql$, (select id from public.event_options where event_id = current_setting('t.edit')::uuid and removed_at is null order by starts_at limit 1)), 'P0001', 'too_few_options', 'but never fewer than two');
reset role;
select is((select count(*)::int from public.event_options where event_id = current_setting('t.edit')::uuid), 3, 'a dropped date keeps its row as history');

-- ---------------------------------------------------------------------------------------------
-- Cancelling: the organiser or an admin, never an ordinary member.
delete from public.notifications;
select pg_temp.as_user(current_setting('t.ed'));
select throws_ok(format($sql$select public.cancel_event('%s', 'no')$sql$, current_setting('t.edit')), '42501', 'not_allowed', 'an ordinary member cannot cancel');
reset role;
select pg_temp.as_user(current_setting('t.bea'));
select lives_ok(format($sql$select public.cancel_event('%s', 'Venue closed')$sql$, current_setting('t.edit')), 'an admin can');
select throws_ok(format($sql$select public.cancel_event('%s')$sql$, current_setting('t.edit')), 'P0001', 'event_not_open', 'but not twice');
reset role;
select is((select status || '/' || cancelled_reason from public.events where id = current_setting('t.edit')::uuid), 'cancelled/Venue closed', 'the reason is kept');
select is((select count(*)::int from public.notifications where type = 'event_cancelled' and recipient_id <> current_setting('t.bea')::uuid), 3,
  'the other flatmates are told, not the canceller');

-- A confirmed event can be cancelled by its organiser.
select pg_temp.as_user(current_setting('t.alice'));
select lives_ok(format($sql$select public.cancel_event('%s')$sql$, current_setting('t.pizza')), 'a confirmed event can be cancelled');
reset role;
select is((select status from public.events where id = current_setting('t.pizza')::uuid), 'cancelled', 'and stays in the history');

-- ---------------------------------------------------------------------------------------------
-- Other flats: another flat's event looks like it does not exist.
select pg_temp.as_user(current_setting('t.gus'));
select throws_ok(format($sql$select public.cast_event_vote('%s', 'yes')$sql$, current_setting('t.o2')), 'P0001', 'event_not_found', 'Gus cannot vote in flat A');
select throws_ok(format($sql$select public.cancel_event('%s')$sql$, current_setting('t.walk')), 'P0001', 'event_not_found', 'or cancel its events');
select throws_ok(format($sql$select public.update_event('%s', 'x', '', null)$sql$, current_setting('t.walk')), 'P0001', 'event_not_found', 'or edit them');
select is((select count(*)::int from public.events), 0, 'or see them');
reset role;

-- The cap of ten open events per flat.
select pg_temp.as_user(current_setting('t.alice'));
select lives_ok($sql$select public.propose_event('Open ' || n, '', null, pg_temp.opts(20, 21), pg_temp.dl(3)) from generate_series(1, 9) n$sql$, 'nine more open events fit');
select throws_ok($sql$select public.propose_event('One too many', '', null, pg_temp.opts(20, 21), pg_temp.dl(3))$sql$, 'P0001', 'too_many_open_events', 'but not an eleventh open one');
reset role;

set local role anon;
select throws_ok($sql$select public.cast_event_vote('00000000-0000-0000-0000-000000000000', 'yes')$sql$, '42501', null, 'anon cannot vote');
reset role;

select * from finish();
rollback;
