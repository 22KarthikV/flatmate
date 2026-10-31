begin;
select plan(28);

-- Events: members joining and leaving while events are open (SPEC-events E3). Every leave path
-- (leave_household, remove_member, account deletion through end_memberships_for_account) can complete
-- a majority and confirms once; an organiser who leaves hands over to an admin; a flat closing does
-- nothing. Each flat has six people, so three yes is not yet a majority, and four is.

create function pg_temp.as_user(p text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.profiles where id = p::uuid), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Users u1..u40. Flat k (k = 1..5) has the people 6k-5 .. 6k: the first is the owner, the second
-- an admin, the rest members, joined one hour apart so "longest standing" is clear.
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'u' || n || '@example.com',
       jsonb_build_object('full_name', 'User ' || n)
  from generate_series(1, 32) n;
select set_config('t.u' || split_part(split_part(u.email, '@', 1), 'u', 2), p.id::text, true)
  from auth.users u join public.profiles p on p.user_id = u.id;

insert into public.households (id, name, created_by)
select ('a' || k || '000000-0000-0000-0000-000000000001')::uuid, 'Flat ' || k, current_setting('t.u' || (6 * k - 5))::uuid
  from generate_series(1, 5) k;
insert into public.memberships (household_id, profile_id, role, joined_at)
select ('a' || k || '000000-0000-0000-0000-000000000001')::uuid, current_setting('t.u' || (6 * (k - 1) + i))::uuid,
       case i when 1 then 'owner'::public.household_role when 2 then 'admin' else 'member' end,
       now() - make_interval(hours => 10 - i)
  from generate_series(1, 5) k, generate_series(1, 6) i;

create function pg_temp.opts() returns jsonb language sql as
  $$ select jsonb_build_array(
       jsonb_build_object('startsAt', (now() + interval '5 days')::text),
       jsonb_build_object('startsAt', (now() + interval '6 days')::text)) $$;
create function pg_temp.opt(p_event text, p_n int) returns uuid language sql as
  $$ select id from public.event_options where event_id = p_event::uuid order by starts_at offset p_n limit 1 $$;
-- Person i of flat k proposes; returns the event id.
create function pg_temp.propose(k int, i int, p_title text) returns text language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.as_user(current_setting('t.u' || (6 * (k - 1) + i)));
  v_id := public.propose_event(p_title, '', null, pg_temp.opts(), now() + interval '2 days');
  reset role;
  return v_id::text;
end $$;
create function pg_temp.vote(k int, i int, p_event text, p_n int, p_answer text) returns void language plpgsql as $$
begin
  perform pg_temp.as_user(current_setting('t.u' || (6 * (k - 1) + i)));
  perform public.cast_event_vote(pg_temp.opt(p_event, p_n), p_answer);
  reset role;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Joiners. Flat 1: an open event, then Zed joins.
select set_config('t.pizza', pg_temp.propose(1, 1, 'Pizza night'), true);
delete from public.notifications;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000099', 'zed@example.com', '{"full_name": "Zed"}');
select set_config('t.zed', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000099'), true);
insert into public.memberships (household_id, profile_id, role) values
  ('a1000000-0000-0000-0000-000000000001', current_setting('t.zed')::uuid, 'member');
select is((select count(*)::int from public.notifications where recipient_id = current_setting('t.zed')::uuid and type = 'event_proposed'),
  1, 'a joiner is asked about the event that is open');
select is((select title from public.notifications where recipient_id = current_setting('t.zed')::uuid and type = 'event_proposed'),
  'User 1 proposed: Pizza night', 'with the proposer''s name in the inbox');
select is((select count(*)::int from private.events_tally(current_setting('t.pizza')::uuid) where members = 7 and pos = 0),
  1, 'and counts in the total from now on (seven people)');
-- A confirmed or cancelled event is not offered to a joiner.
select set_config('t.done', pg_temp.propose(1, 1, 'Done'), true);
update public.events set status = 'cancelled', cancelled_at = now() where id = current_setting('t.done')::uuid;
delete from public.notifications;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000098', 'yan@example.com', '{"full_name": "Yan"}');
insert into public.memberships (household_id, profile_id, role)
  select 'a1000000-0000-0000-0000-000000000001', id, 'member' from public.profiles where user_id = '00000000-0000-0000-0000-000000000098';
select is((select count(*)::int from public.notifications where type = 'event_proposed'), 1,
  'a joiner hears only about events still being voted on');
select is((select count(*)::int from public.notifications where type = 'event_proposed'
             and recipient_id = (select id from public.profiles where user_id = '00000000-0000-0000-0000-000000000098')
             and dedupe_key = 'event_proposed:' || current_setting('t.pizza')), 1, 'which one is the pizza night');

-- ---------------------------------------------------------------------------------------------
-- Leaving completes a majority, by each of the three paths.

-- Flat 2: u8, u9, u10 vote yes (three of six). u12 then leaves the flat: three of five is a majority.
select set_config('t.e2', pg_temp.propose(2, 1, 'Leave path'), true);
select pg_temp.vote(2, 2, current_setting('t.e2'), 0, 'yes');
select pg_temp.vote(2, 3, current_setting('t.e2'), 0, 'yes');
select pg_temp.vote(2, 4, current_setting('t.e2'), 0, 'yes');
select is((select status from public.events where id = current_setting('t.e2')::uuid), 'voting', 'three yes of six is not a majority');
delete from public.notifications;
select pg_temp.as_user(current_setting('t.u12'));
select public.leave_household();
reset role;
select is((select status || '/' || confirmed_by from public.events where id = current_setting('t.e2')::uuid), 'confirmed/member_change',
  'when a flatmate leaves, three of five is a majority and the event is confirmed');
select is((select count(*)::int from public.notifications where type = 'event_confirmed' and dedupe_key = 'event_confirmed:' || current_setting('t.e2')), 5,
  'the five who remain are told, once');

-- Flat 3: removed by an admin.
select set_config('t.e3', pg_temp.propose(3, 1, 'Removal path'), true);
select pg_temp.vote(3, 2, current_setting('t.e3'), 0, 'yes');
select pg_temp.vote(3, 3, current_setting('t.e3'), 0, 'yes');
select pg_temp.vote(3, 4, current_setting('t.e3'), 0, 'yes');
select pg_temp.as_user(current_setting('t.u13'));
select public.remove_member(current_setting('t.u18')::uuid);
reset role;
select is((select status || '/' || confirmed_by from public.events where id = current_setting('t.e3')::uuid), 'confirmed/member_change',
  'a removal can complete a majority too');

-- Flat 4: the person deletes their account.
select set_config('t.e4', pg_temp.propose(4, 1, 'Deletion path'), true);
select pg_temp.vote(4, 2, current_setting('t.e4'), 0, 'yes');
select pg_temp.vote(4, 3, current_setting('t.e4'), 0, 'yes');
select pg_temp.vote(4, 4, current_setting('t.e4'), 0, 'yes');
select is(public.end_memberships_for_account('00000000-0000-0000-0000-000000000024'), 'ok', 'the account''s membership is ended');
select is((select status || '/' || confirmed_by from public.events where id = current_setting('t.e4')::uuid), 'confirmed/member_change',
  'as can an account being deleted');
select is((select count(*)::int from public.notifications where type = 'event_confirmed' and dedupe_key = 'event_confirmed:' || current_setting('t.e4')), 5,
  'with one set of messages');

-- A leaver's own votes stay but stop counting.
select set_config('t.e5', pg_temp.propose(5, 1, 'Votes stay'), true);
select pg_temp.vote(5, 2, current_setting('t.e5'), 0, 'yes');
select pg_temp.vote(5, 3, current_setting('t.e5'), 0, 'yes');
select pg_temp.vote(5, 6, current_setting('t.e5'), 0, 'yes');
select pg_temp.as_user(current_setting('t.u30'));
select public.leave_household();
reset role;
select is((select count(*)::int from public.event_votes where profile_id = current_setting('t.u30')::uuid), 1, 'the leaver''s answer is kept as history');
select is((select string_agg(yes || '/' || members, ',') from private.events_tally(current_setting('t.e5')::uuid)), '2/5,0/5',
  'but counts for nothing: two yes of five');
select is((select status from public.events where id = current_setting('t.e5')::uuid), 'voting', 'so the event is still open');

-- ---------------------------------------------------------------------------------------------
-- A confirmed event is never reopened or changed by later joins and leaves.
select is((select status from public.events where id = current_setting('t.e2')::uuid), 'confirmed', 'a confirmed event stays confirmed');
select private.events_evaluate(current_setting('t.e2')::uuid, now(), true);
select is((select count(*)::int from public.notifications where type = 'event_confirmed' and dedupe_key = 'event_confirmed:' || current_setting('t.e2')), 5,
  'and evaluating again does not tell anyone twice');

-- ---------------------------------------------------------------------------------------------
-- The organiser leaves: open and upcoming events pass to the longest-standing admin.
-- Flat 5 is people 25..30: u25 is the owner (in the flat longest), u26 an admin, u27 a member who
-- organises three events.
select set_config('t.h1', pg_temp.propose(5, 3, 'Handed over'), true);
select set_config('t.h2', pg_temp.propose(5, 3, 'Also handed over'), true);
select set_config('t.h3', pg_temp.propose(5, 3, 'Already cancelled'), true);
update public.events set status = 'cancelled', cancelled_at = now() where id = current_setting('t.h3')::uuid;
delete from public.notifications;
select pg_temp.as_user(current_setting('t.u27'));
select public.leave_household();
reset role;
select is((select organiser_id from public.events where id = current_setting('t.h1')::uuid), current_setting('t.u25')::uuid,
  'the longest-standing owner or admin becomes the organiser');
select is((select organiser_id from public.events where id = current_setting('t.h2')::uuid), current_setting('t.u25')::uuid, 'for each open event');
select is((select organiser_id from public.events where id = current_setting('t.h3')::uuid), current_setting('t.u27')::uuid, 'but not one that is already cancelled');
select is((select count(*)::int from public.notifications where type = 'event_organiser_changed' and recipient_id = current_setting('t.u25')::uuid), 2,
  'and the new organiser is told about each');
select is((select count(*)::int from public.notifications where type = 'event_organiser_changed' and recipient_id <> current_setting('t.u25')::uuid), 0,
  'nobody else is');

-- The new organiser can use the organiser's powers.
select pg_temp.as_user(current_setting('t.u25'));
select lives_ok(format($sql$select public.update_event('%s', 'Handed over, fixed', '', null)$sql$, current_setting('t.h1')), 'the new organiser can edit it');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Leaving never has to wait for an event, and a flat closing does nothing.
select set_config('t.cl', pg_temp.propose(1, 1, 'Flat closes'), true);
delete from public.notifications;
update public.memberships set left_at = now(), left_reason = 'flat_closed'
 where household_id = 'a1000000-0000-0000-0000-000000000001' and left_at is null;
select is((select status || '/' || organiser_id::text from public.events where id = current_setting('t.cl')::uuid),
  'voting/' || current_setting('t.u1'), 'closing a flat leaves its events as they were');
select is((select count(*)::int from public.notifications), 0, 'and tells nobody');

-- The existing leave functions are untouched: the trigger does the work.
select is((select count(*)::int from pg_trigger where tgname in ('events_note_member_joined', 'events_note_member_left') and not tgisinternal),
  2, 'both membership triggers exist');
select is((select count(*)::int from public.event_votes ev join public.events e on e.id = ev.event_id where e.status = 'confirmed' and ev.answer = 'yes'
             and e.id in (current_setting('t.e2')::uuid, current_setting('t.e3')::uuid, current_setting('t.e4')::uuid)), 9,
  'the votes behind each confirmation are all still there');
select is((select count(distinct confirmed_option_id)::int from public.events where id in (current_setting('t.e2')::uuid, current_setting('t.e3')::uuid, current_setting('t.e4')::uuid)),
  3, 'each of those events has exactly one confirmed date');

select * from finish();
rollback;
