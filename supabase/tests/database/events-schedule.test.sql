begin;
select plan(34);

-- Events: the hourly job (SPEC-events E3). The job takes the time as a parameter, so these tests
-- move through it. Flat A: Alice (owner, organiser), Bea (admin), Cy, Di, Ed = five people.

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
  ('00000000-0000-0000-0000-000000000005', 'ed@example.com', '{"full_name": "Ed"}');
select set_config('t.' || split_part(u.email, '@', 1), p.id::text, true)
  from auth.users u join public.profiles p on p.user_id = u.id;

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.alice')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bea')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.cy')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.di')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.ed')::uuid, 'member');
-- Bea has a phone that takes push, so the outbox shows what would be sent.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (current_setting('t.bea')::uuid, 'https://push.example/bea', 'k', 'a');

create function pg_temp.opts(p_a int, p_b int) returns jsonb language sql as
  $$ select jsonb_build_array(
       jsonb_build_object('startsAt', (now() + make_interval(days => p_a))::text),
       jsonb_build_object('startsAt', (now() + make_interval(days => p_b))::text)) $$;
-- The id of the n-th date of an event (0 = earliest).
create function pg_temp.opt(p_event text, p_n int) returns uuid language sql as
  $$ select id from public.event_options where event_id = p_event::uuid order by starts_at offset p_n limit 1 $$;
create function pg_temp.vote(p_who text, p_event text, p_n int, p_answer text) returns void language plpgsql as $$
begin
  perform pg_temp.as_user(p_who);
  perform public.cast_event_vote(pg_temp.opt(p_event, p_n), p_answer);
  reset role;
end $$;
create function pg_temp.propose(p_title text, p_a int, p_b int, p_deadline_days int) returns text language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.as_user(current_setting('t.alice'));
  v_id := public.propose_event(p_title, '', null, pg_temp.opts(p_a, p_b), now() + make_interval(days => p_deadline_days));
  reset role;
  return v_id::text;
end $$;

create function pg_temp.propose_h(p_title text, p_a int, p_b int, p_deadline_hours int) returns text language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.as_user(current_setting('t.alice'));
  v_id := public.propose_event(p_title, '', null,
    jsonb_build_array(jsonb_build_object('startsAt', (now() + make_interval(hours => p_a))::text),
                      jsonb_build_object('startsAt', (now() + make_interval(hours => p_b))::text)),
    now() + make_interval(hours => p_deadline_hours));
  reset role;
  return v_id::text;
end $$;

select is((select count(*)::int from cron.job where jobname = 'events-hourly' and schedule = '47 * * * *'
             and command = 'select private.run_events_hourly()'), 1, 'the events job is scheduled at minute 47');
select is((select count(*)::int from cron.job where schedule like '47 %' and jobname <> 'events-hourly'), 0,
  'and no other job uses that minute');

-- ---------------------------------------------------------------------------------------------
-- The deadline picks the date with the most yes.
select set_config('t.pick', pg_temp.propose('Pick one', 5, 6, 2), true);
select pg_temp.vote(current_setting('t.bea'), current_setting('t.pick'), 1, 'yes');
select pg_temp.vote(current_setting('t.cy'), current_setting('t.pick'), 1, 'yes');
select pg_temp.vote(current_setting('t.di'), current_setting('t.pick'), 0, 'yes');
select set_config('t.dl', (select vote_deadline::text from public.events where id = current_setting('t.pick')::uuid), true);
delete from public.notifications;
select private.events_run(current_setting('t.dl')::timestamptz - interval '1 hour');
select is((select status from public.events where id = current_setting('t.pick')::uuid), 'voting', 'before the deadline nothing happens');
select private.events_run(current_setting('t.dl')::timestamptz + interval '1 minute');
select is((select status || '/' || confirmed_by || '/' || (confirmed_option_id = pg_temp.opt(current_setting('t.pick'), 1))::text
             from public.events where id = current_setting('t.pick')::uuid),
  'confirmed/deadline/true', 'just after it the date with the most yes is confirmed');
select is((select count(*)::int from public.notifications where type = 'event_confirmed'), 5, 'everyone is told');
select private.events_run(current_setting('t.dl')::timestamptz + interval '2 minutes');
select private.events_run(current_setting('t.dl')::timestamptz + interval '1 hour');
select is((select count(*)::int from public.notifications where type = 'event_confirmed'), 5, 'running the job again tells nobody twice');
select is((select count(*)::int from public.push_outbox o join public.notifications n on n.id = o.notification_id
            where n.type = 'event_confirmed' and n.recipient_id = current_setting('t.bea')::uuid), 1,
  'a phone with push gets one message for it');
select is((select t.push_title || ' / ' || t.push_body from public.notification_types t where t.type = 'event_confirmed'),
  'An event is confirmed / Open FlatMate to see when.', 'whose text is fixed and names nothing');

-- ---------------------------------------------------------------------------------------------
-- A tie goes to the organiser, is reminded once after 24 hours, and is settled after 48.
select set_config('t.tie', pg_temp.propose('Tied', 5, 6, 2), true);
select pg_temp.vote(current_setting('t.bea'), current_setting('t.tie'), 0, 'yes');
select pg_temp.vote(current_setting('t.cy'), current_setting('t.tie'), 1, 'yes');
select set_config('t.tdl', (select vote_deadline::text from public.events where id = current_setting('t.tie')::uuid), true);
delete from public.notifications;
select private.events_run(current_setting('t.tdl')::timestamptz + interval '1 minute');
select is((select status from public.events where id = current_setting('t.tie')::uuid), 'tiebreak', 'a tie at the deadline waits for the organiser');
select is((select count(*)::int from public.notifications where type = 'event_tiebreak' and recipient_id = current_setting('t.alice')::uuid), 1, 'who is asked straight away');
select private.events_run(current_setting('t.tdl')::timestamptz + interval '12 hours');
select is((select status from public.events where id = current_setting('t.tie')::uuid), 'tiebreak', 'twelve hours later it is still waiting');
select private.events_run(current_setting('t.tdl')::timestamptz + interval '25 hours');
select private.events_run(current_setting('t.tdl')::timestamptz + interval '26 hours');
select is((select count(*)::int from public.notifications where type = 'event_tiebreak'), 2, 'the organiser is reminded once, after 24 hours');
select private.events_run(current_setting('t.tdl')::timestamptz + interval '49 hours');
select is((select status || '/' || confirmed_by || '/' || (confirmed_option_id = pg_temp.opt(current_setting('t.tie'), 0))::text
             from public.events where id = current_setting('t.tie')::uuid),
  'confirmed/auto_tiebreak/true', 'after 48 hours the earliest tied date is chosen');

-- ---------------------------------------------------------------------------------------------
-- Nobody said yes.
select set_config('t.none', pg_temp.propose('Nobody', 5, 6, 2), true);
select pg_temp.vote(current_setting('t.bea'), current_setting('t.none'), 0, 'maybe');
select pg_temp.vote(current_setting('t.cy'), current_setting('t.none'), 1, 'no');
delete from public.notifications;
select private.events_run((select vote_deadline from public.events where id = current_setting('t.none')::uuid) + interval '1 minute');
select is((select status || '/' || cancelled_reason from public.events where id = current_setting('t.none')::uuid),
  'cancelled/Nobody could make any of the dates', 'with no yes at all the event is cancelled and says why');
select is((select count(*)::int from public.notifications where type = 'event_cancelled'), 5, 'and everyone is told');

-- ---------------------------------------------------------------------------------------------
-- The same job run by the cron entry point: one run per hour, recorded.
select private.run_events_hourly();
select private.run_events_hourly();
select is((select count(*)::int from public.job_runs where job_name = 'events-hourly'), 1, 'a second call in the same hour does nothing');
select is((select status from public.job_runs where job_name = 'events-hourly'), 'succeeded', 'and the run is recorded as succeeded');

-- ---------------------------------------------------------------------------------------------
-- Vote reminders: a day before the deadline, only to people who have not voted.
select set_config('t.rem', pg_temp.propose('Reminded', 8, 9, 3), true);
select pg_temp.vote(current_setting('t.bea'), current_setting('t.rem'), 0, 'maybe');
select pg_temp.vote(current_setting('t.cy'), current_setting('t.rem'), 1, 'no');
select set_config('t.rdl', (select vote_deadline::text from public.events where id = current_setting('t.rem')::uuid), true);
delete from public.notifications;
select private.events_run(current_setting('t.rdl')::timestamptz - interval '30 hours');
select is((select count(*)::int from public.notifications where type = 'event_vote_reminder'), 0, 'too early for a reminder');
select private.events_run(current_setting('t.rdl')::timestamptz - interval '23 hours');
select private.events_run(current_setting('t.rdl')::timestamptz - interval '22 hours');
select is((select string_agg(p.display_name, ',' order by p.display_name) from public.notifications n
             join public.profiles p on p.id = n.recipient_id where n.type = 'event_vote_reminder'),
  'Alice,Di,Ed', 'the three who have not voted are reminded, once');
select matches((select title from public.notifications where type = 'event_vote_reminder' and recipient_id = current_setting('t.ed')::uuid),
  '^Vote on Reminded before \w{3} \d{1,2} \w{3}$', 'with the deadline day in London time');

select set_config('t.short', pg_temp.propose_h('Short notice', 100, 101, 12), true);
delete from public.notifications;
select private.events_run(now() + interval '1 hour');
select is((select count(*)::int from public.notifications where type = 'event_vote_reminder'
             and dedupe_key = 'event_vote_reminder:' || current_setting('t.short')), 0,
  'an event proposed inside the last day gets no extra reminder');

-- ---------------------------------------------------------------------------------------------
-- Event reminders: a day before and two hours before, not to people who said no.
select set_config('t.ev', pg_temp.propose('Film night', 20, 21, 2), true);
select pg_temp.vote(current_setting('t.ed'), current_setting('t.ev'), 0, 'no');
select pg_temp.vote(current_setting('t.bea'), current_setting('t.ev'), 0, 'yes');
select pg_temp.vote(current_setting('t.cy'), current_setting('t.ev'), 0, 'yes');
select pg_temp.vote(current_setting('t.di'), current_setting('t.ev'), 0, 'yes');
select set_config('t.s', (select starts_at::text from public.events where id = current_setting('t.ev')::uuid), true);
select is((select status from public.events where id = current_setting('t.ev')::uuid), 'confirmed', 'the film night is confirmed');
delete from public.notifications;
select private.events_run(current_setting('t.s')::timestamptz - interval '26 hours');
select is((select count(*)::int from public.notifications where type = 'event_reminder'), 0, 'too early for the day-before reminder');
select private.events_run(current_setting('t.s')::timestamptz - interval '23 hours');
select private.events_run(current_setting('t.s')::timestamptz - interval '22 hours');
select is((select count(*)::int from public.notifications where type = 'event_reminder' and dedupe_key like '%:day'), 4,
  'about a day before, four people are reminded, once each');
select is((select count(*)::int from public.notifications where type = 'event_reminder' and recipient_id = current_setting('t.ed')::uuid), 0,
  'and not the one who said no');
select matches((select title from public.notifications where type = 'event_reminder' and recipient_id = current_setting('t.cy')::uuid),
  '^Film night is (today|tomorrow), \d\d:\d\d$', 'in plain words');
select private.events_run(current_setting('t.s')::timestamptz - interval '90 minutes');
select private.events_run(current_setting('t.s')::timestamptz - interval '30 minutes');
select is((select count(*)::int from public.notifications where type = 'event_reminder' and dedupe_key like '%:hour'), 4,
  'and about two hours before, four more, once each');
select private.events_run(current_setting('t.s')::timestamptz + interval '1 hour');
select is((select count(*)::int from public.notifications where type = 'event_reminder'), 8, 'nothing is sent once it has started');

-- A reminder whose moment was already past when the date was confirmed is skipped.
select set_config('t.late', pg_temp.propose_h('Last minute', 20, 30, 10), true);
select pg_temp.vote(current_setting('t.bea'), current_setting('t.late'), 0, 'yes');
select pg_temp.vote(current_setting('t.cy'), current_setting('t.late'), 0, 'yes');
select pg_temp.vote(current_setting('t.di'), current_setting('t.late'), 0, 'yes');
delete from public.notifications;
select private.events_run(now() + interval '1 hour');
select is((select count(*)::int from public.notifications where type = 'event_reminder'), 0,
  'confirming at the last minute sends no day-before reminder');
select private.events_run(now() + interval '19 hours');
select is((select count(*)::int from public.notifications where type = 'event_reminder'
             and dedupe_key = 'event_reminder:' || current_setting('t.late') || ':hour'), 5,
  'but the two-hour reminder still arrives');

-- ---------------------------------------------------------------------------------------------
-- Closed flats are left alone, and everything sent is generic on a lock screen.
select set_config('t.closed', pg_temp.propose('Closed down', 40, 41, 30), true);
update public.households set closed_at = now() where id = 'a0000000-0000-0000-0000-000000000001';
delete from public.notifications;
select private.events_run(now() + interval '31 days');
select is((select status from public.events where id = current_setting('t.closed')::uuid), 'voting', 'a closed flat is not touched');
select is((select count(*)::int from public.notifications), 0, 'and nobody is told anything');
update public.households set closed_at = null where id = 'a0000000-0000-0000-0000-000000000001';

select ok(
  not exists (select 1 from public.notification_types t
    where t.type like 'event\_%' and (t.push_title ilike '%film%' or t.push_body ilike '%film%'
       or t.push_title ilike '%alice%' or t.push_body ilike '%pizza%')),
  'no push text carries an event title or a person');
select is((select count(*)::int from public.notification_types where type like 'event\_%'), 8, 'all eight event types exist');

select * from finish();
rollback;
