begin;
select plan(84);

-- Recurring: saving, editing, pausing, resuming, skipping and ending templates (SPEC-recurring
-- R3, R4, R10 to R13, R17, R18). Flat A: Sam (owner), Dee (admin), Alice, Bob, Cara (members) and
-- Lou (who has left). Flat B: Zed (owner).

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'sam@example.com', '{"full_name": "Sam"}'),
  ('00000000-0000-0000-0000-000000000002', 'dee@example.com', '{"full_name": "Dee"}'),
  ('00000000-0000-0000-0000-000000000003', 'alice@example.com', '{"full_name": "Alice"}'),
  ('00000000-0000-0000-0000-000000000004', 'bob@example.com', '{"full_name": "Bob"}'),
  ('00000000-0000-0000-0000-000000000005', 'cara@example.com', '{"full_name": "Cara"}'),
  ('00000000-0000-0000-0000-000000000006', 'zed@example.com', '{"full_name": "Zed"}'),
  ('00000000-0000-0000-0000-000000000007', 'lou@example.com', '{"full_name": "Lou"}');
select set_config('t.sam', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'), true);
select set_config('t.dee', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000002'), true);
select set_config('t.alice', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000003'), true);
select set_config('t.bob', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000004'), true);
select set_config('t.cara', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000005'), true);
select set_config('t.zed', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000006'), true);
select set_config('t.lou', (select id::text from public.profiles where user_id = '00000000-0000-0000-0000-000000000007'), true);

insert into public.households (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Flat A', current_setting('t.sam')::uuid),
  ('b0000000-0000-0000-0000-000000000001', 'Flat B', current_setting('t.zed')::uuid);
insert into public.memberships (household_id, profile_id, role) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.sam')::uuid, 'owner'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.dee')::uuid, 'admin'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.alice')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.bob')::uuid, 'member'),
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.cara')::uuid, 'member'),
  ('b0000000-0000-0000-0000-000000000001', current_setting('t.zed')::uuid, 'owner');
insert into public.memberships (household_id, profile_id, role, left_at, left_reason) values
  ('a0000000-0000-0000-0000-000000000001', current_setting('t.lou')::uuid, 'member', now(), 'left');

-- Helpers to build payloads.
create function pg_temp.person(p_who text, p_pence bigint) returns jsonb language sql as
  $$ select jsonb_build_object('profile_id', current_setting('t.' || p_who), 'pence', p_pence) $$;
create function pg_temp.share(p_who text, p_points bigint) returns jsonb language sql as
  $$ select jsonb_build_object('profile_id', current_setting('t.' || p_who), 'basis_points', p_points) $$;
create function pg_temp.bill(p_extra jsonb) returns jsonb language sql as
  $$ select jsonb_build_object(
       'kind', 'bill', 'name', 'Gas', 'paid_by', current_setting('t.alice'), 'due_day', 12,
       'amount_mode', 'variable', 'amount_pence', null, 'split_mode', 'equal', 'people', '[]'::jsonb,
       'active_months', '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb) || p_extra $$;
create function pg_temp.rent(p_extra jsonb) returns jsonb language sql as
  $$ select jsonb_build_object(
       'kind', 'rent', 'name', 'Rent', 'collector_id', current_setting('t.sam'), 'due_day', 6,
       'active_months', '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
       'rooms', jsonb_build_array(
         jsonb_build_object('name', 'Front', 'rent_pence', 80000, 'people', jsonb_build_array(pg_temp.person('sam', 80000))),
         jsonb_build_object('name', 'Big room', 'rent_pence', 120000, 'people', jsonb_build_array(pg_temp.person('alice', 60000), pg_temp.person('bob', 60000))),
         jsonb_build_object('name', 'Box room', 'rent_pence', 55000, 'people', jsonb_build_array(pg_temp.person('cara', 55000))))
     ) || p_extra $$;

select ok(
  not has_function_privilege('anon', 'public.save_recurring_template(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.save_recurring_template(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.pause_recurring_template(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.end_recurring_template(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.recurring_is_member(uuid, uuid, boolean)', 'execute'),
  'signed-in people can call the template functions, anon cannot, and the helpers are private'
);

-- Members cannot manage templates.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{}')) $sql$, '42501', 'not_allowed', 'a member cannot create a bill');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent('{}')) $sql$, '42501', 'not_allowed', 'a member cannot create a rent');
select throws_ok($sql$ select public.pause_recurring_template(gen_random_uuid()) $sql$, '42501', 'not_allowed', 'a member cannot pause');
select throws_ok($sql$ select public.resume_recurring_template(gen_random_uuid()) $sql$, '42501', 'not_allowed', 'or resume');
select throws_ok($sql$ select public.skip_recurring_month(gen_random_uuid(), date '2027-01-01') $sql$, '42501', 'not_allowed', 'or skip');
select throws_ok($sql$ select public.end_recurring_template(gen_random_uuid()) $sql$, '42501', 'not_allowed', 'or end');
reset role;

-- An admin creates a variable equal bill (everyone in the flat) and a fixed percentage bill.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select set_config('t.gas', public.save_recurring_template(null, pg_temp.bill('{}'))::text, true);
select is((select kind || ':' || name || ':' || amount_mode || ':' || split_mode || ':' || due_day::text from public.recurring_templates where id = current_setting('t.gas')::uuid),
  'bill:Gas:variable:equal:12', 'an admin creates a variable equal bill');
select is((select paid_by from public.recurring_templates where id = current_setting('t.gas')::uuid), current_setting('t.alice')::uuid, 'paid by the chosen member');
select is((select count(*)::int from public.recurring_template_shares where template_id = current_setting('t.gas')::uuid), 0, 'an equal bill with nobody listed means everyone in the flat');
select is((select created_by from public.recurring_templates where id = current_setting('t.gas')::uuid), current_setting('t.dee')::uuid, 'created_by is the caller, not anything passed in');
select is((select change from public.recurring_template_log where template_id = current_setting('t.gas')::uuid), 'created', 'the change log records it');

select set_config('t.wifi', public.save_recurring_template(null, pg_temp.bill(jsonb_build_object(
  'name', 'Wi-Fi', 'amount_mode', 'fixed', 'amount_pence', 3200, 'split_mode', 'percent',
  'people', jsonb_build_array(pg_temp.share('alice', 5000), pg_temp.share('bob', 2500), pg_temp.share('cara', 2500)),
  'active_months', '[1,2,3]'::jsonb)))::text, true);
select is((select array_agg(share_value order by share_value) from public.recurring_template_shares where template_id = current_setting('t.wifi')::uuid),
  array[2500, 2500, 5000]::bigint[], 'a percentage bill stores each person''s hundredths of a percent');
select is((select active_months from public.recurring_templates where id = current_setting('t.wifi')::uuid), array[1,2,3]::smallint[], 'and its active months');
select is((select amount_pence from public.recurring_templates where id = current_setting('t.wifi')::uuid), 3200::bigint, 'and its fixed amount');

-- Validation.
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"name": ""}')) $sql$, '22023', 'invalid_name', 'a name is needed');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill(jsonb_build_object('name', repeat('x', 51)))) $sql$, '22023', 'invalid_name', 'and at most 50 characters');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"due_day": 29}')) $sql$, '22023', 'invalid_due_day', 'the due day is 1 to 28');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"due_day": 0}')) $sql$, '22023', 'invalid_due_day', 'not 0');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"active_months": []}')) $sql$, '22023', 'invalid_months', 'at least one month');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"active_months": [13]}')) $sql$, '22023', 'invalid_months', 'and months 1 to 12');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"amount_mode": "fixed"}')) $sql$, '22023', 'invalid_amount', 'a fixed bill needs an amount');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"amount_pence": 100}')) $sql$, '22023', 'invalid_amount', 'a variable bill has none');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"amount_mode": "fixed", "amount_pence": 1000001}')) $sql$, '22023', 'invalid_amount', 'the amount is at most £10,000');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill(jsonb_build_object('split_mode', 'percent',
  'people', jsonb_build_array(pg_temp.share('alice', 6000), pg_temp.share('bob', 3000))))) $sql$, '22023', 'invalid_shares', 'percentages must add up to 100');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"split_mode": "percent"}')) $sql$, '22023', 'invalid_shares', 'a percentage bill needs people');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill(jsonb_build_object('people', jsonb_build_array(pg_temp.share('alice', null), pg_temp.share('alice', null))))) $sql$, '22023', 'invalid_shares', 'each person once');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill(jsonb_build_object('paid_by', current_setting('t.zed')))) $sql$, 'P0001', 'not_a_member', 'the payer must be in the flat (not another flat)');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill(jsonb_build_object('paid_by', current_setting('t.lou')))) $sql$, 'P0001', 'not_a_member', 'nor someone who left');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill(jsonb_build_object('people', jsonb_build_array(pg_temp.share('lou', null))))) $sql$, 'P0001', 'not_a_member', 'nor can a leaver share it');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.bill('{"kind": "party"}')) $sql$, '22023', 'invalid_kind', 'the kind is rent or bill');

-- The rent: three rooms and four people besides the collector.
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent(jsonb_build_object('collector_id', current_setting('t.alice')))) $sql$,
  'P0001', 'collector_must_be_admin', 'the collector must be an owner or admin');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent(jsonb_build_object('collector_id', current_setting('t.lou')))) $sql$,
  'P0001', 'collector_must_be_admin', 'and still in the flat');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent('{"rooms": []}')) $sql$, '22023', 'invalid_rooms', 'a rent needs rooms');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent(jsonb_build_object('rooms', jsonb_build_array(
  jsonb_build_object('name', 'A', 'rent_pence', 1000, 'people', jsonb_build_array(pg_temp.person('alice', 500))),
  jsonb_build_object('name', 'B', 'rent_pence', 1000, 'people', jsonb_build_array(pg_temp.person('alice', 500))))))) $sql$,
  '22023', 'invalid_rooms', 'a person cannot be in two rooms');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent(jsonb_build_object('rooms', jsonb_build_array(
  jsonb_build_object('name', 'A', 'rent_pence', 1000, 'people', '[]'::jsonb))))) $sql$, '22023', 'invalid_rooms', 'a room needs someone in it');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent(jsonb_build_object('rooms', jsonb_build_array(
  jsonb_build_object('name', 'A', 'rent_pence', 1000, 'people', jsonb_build_array(pg_temp.person('zed', 500))))))) $sql$,
  'P0001', 'not_a_member', 'a room cannot hold someone from another flat');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent(jsonb_build_object('rooms', jsonb_build_array(
  jsonb_build_object('name', 'A', 'rent_pence', 1000001, 'people', jsonb_build_array(pg_temp.person('alice', 500))))))) $sql$,
  '22023', 'invalid_amount', 'a room''s rent is at most £10,000');
select throws_ok($sql$ select public.save_recurring_template(null, pg_temp.rent(jsonb_build_object('rooms', jsonb_build_array(
  jsonb_build_object('name', 'A', 'rent_pence', 1000, 'people', jsonb_build_array(pg_temp.person('alice', 0))))))) $sql$,
  '22023', 'invalid_amount', 'and each person pays at least 1p');

select set_config('t.rent', public.save_recurring_template(null, pg_temp.rent('{}'))::text, true);
select is((select kind || ':' || amount_mode || ':' || split_mode || ':' || coalesce(amount_pence::text, 'none') from public.recurring_templates where id = current_setting('t.rent')::uuid),
  'rent:fixed:amounts:none', 'a rent keeps its money in rooms and shares, not on the template');
select is((select paid_by from public.recurring_templates where id = current_setting('t.rent')::uuid), current_setting('t.sam')::uuid, 'the collector is the payee');
select is((select count(*)::int from public.recurring_rooms where template_id = current_setting('t.rent')::uuid), 3, 'three rooms');
select is((select sum(rent_pence)::bigint from public.recurring_rooms where template_id = current_setting('t.rent')::uuid), 255000::bigint, 'the rooms add up to the total rent');
select is((select count(*)::int from public.recurring_template_shares where template_id = current_setting('t.rent')::uuid and room_id is not null), 4, 'four people are placed in rooms');
select is((select s.share_value from public.recurring_template_shares s where s.template_id = current_setting('t.rent')::uuid and s.profile_id = current_setting('t.cara')::uuid), 55000::bigint, 'each with their own pence');
select is((select r.name from public.recurring_template_shares s join public.recurring_rooms r on r.id = s.room_id where s.template_id = current_setting('t.rent')::uuid and s.profile_id = current_setting('t.bob')::uuid), 'Big room', 'in the right room');
reset role;

-- Editing a rent replaces its rooms and shares; the change log says who edited.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is(public.save_recurring_template(current_setting('t.rent')::uuid, pg_temp.rent(jsonb_build_object('name', 'Rent 2027', 'due_day', 7,
  'rooms', jsonb_build_array(
    jsonb_build_object('name', 'Front', 'rent_pence', 90000, 'people', jsonb_build_array(pg_temp.person('sam', 90000))),
    jsonb_build_object('name', 'Rest', 'rent_pence', 175000, 'people', jsonb_build_array(pg_temp.person('alice', 60000), pg_temp.person('bob', 60000), pg_temp.person('cara', 55000)))))))::text,
  current_setting('t.rent'), 'editing returns the same template');
select is((select name || ':' || due_day::text from public.recurring_templates where id = current_setting('t.rent')::uuid), 'Rent 2027:7', 'the rules changed');
select is((select count(*)::int from public.recurring_rooms where template_id = current_setting('t.rent')::uuid), 2, 'the rooms were replaced');
select is((select count(*)::int from public.recurring_template_shares where template_id = current_setting('t.rent')::uuid), 4, 'and the shares');
select is((select array_agg(change order by created_at, change) from public.recurring_template_log where template_id = current_setting('t.rent')::uuid), array['created', 'edited'], 'the log keeps both');
select is((select changed_by from public.recurring_template_log where template_id = current_setting('t.rent')::uuid and change = 'edited'), current_setting('t.sam')::uuid, 'and who edited');
select throws_ok($sql$ select public.save_recurring_template(current_setting('t.rent')::uuid, pg_temp.bill('{}')) $sql$, '22023', 'invalid_kind', 'a rent cannot be turned into a bill');
reset role;

-- Another flat's admin cannot see or touch this flat's templates.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000006", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.save_recurring_template(current_setting('t.rent')::uuid, pg_temp.rent('{}')) $sql$, 'P0001', 'template_not_found', 'another flat''s admin cannot edit it');
select throws_ok($sql$ select public.pause_recurring_template(current_setting('t.rent')::uuid) $sql$, 'P0001', 'template_not_found', 'or pause it');
select throws_ok($sql$ select public.end_recurring_template(current_setting('t.gas')::uuid) $sql$, 'P0001', 'template_not_found', 'or end it');
select throws_ok($sql$ select public.skip_recurring_month(current_setting('t.gas')::uuid, date '2027-01-01') $sql$, 'P0001', 'template_not_found', 'or skip a month');
reset role;

-- Pause, resume.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.pause_recurring_template(current_setting('t.gas')::uuid) $sql$, 'an admin pauses a bill');
select is((select paused_reason from public.recurring_templates where id = current_setting('t.gas')::uuid), 'admin', 'the reason is "admin"');
select throws_ok($sql$ select public.pause_recurring_template(current_setting('t.gas')::uuid) $sql$, 'P0001', 'already_paused', 'it cannot be paused twice');
select lives_ok($sql$ select public.resume_recurring_template(current_setting('t.gas')::uuid) $sql$, 'and resumed');
select is((select paused_at from public.recurring_templates where id = current_setting('t.gas')::uuid), null, 'which clears the pause');
select throws_ok($sql$ select public.resume_recurring_template(current_setting('t.gas')::uuid) $sql$, 'P0001', 'not_paused', 'only a paused template can be resumed');
reset role;

-- Resume needs a workable template: someone who left cannot be paid, or named.
update public.memberships set left_at = now(), left_reason = 'left' where profile_id = current_setting('t.cara')::uuid;
update public.recurring_templates set paused_at = now(), paused_reason = 'member_left' where id = current_setting('t.rent')::uuid;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($sql$ select public.resume_recurring_template(current_setting('t.rent')::uuid) $sql$, 'P0001', 'cannot_resume', 'a rent with someone gone cannot resume until it is edited');
select lives_ok($sql$ select public.save_recurring_template(current_setting('t.rent')::uuid, pg_temp.rent(jsonb_build_object('rooms', jsonb_build_array(
  jsonb_build_object('name', 'Front', 'rent_pence', 90000, 'people', jsonb_build_array(pg_temp.person('sam', 90000))),
  jsonb_build_object('name', 'Rest', 'rent_pence', 120000, 'people', jsonb_build_array(pg_temp.person('alice', 60000), pg_temp.person('bob', 60000))))))) $sql$,
  'an admin edits the rooms for who is left');
select lives_ok($sql$ select public.resume_recurring_template(current_setting('t.rent')::uuid) $sql$, 'and then resumes');
select is((select paused_at from public.recurring_templates where id = current_setting('t.rent')::uuid), null, 'it is running again');
reset role;

-- Skipping a month.
select set_config('t.next', (date_trunc('month', private.ledger_today()) + interval '2 months')::date::text, true);
select set_config('t.past', (date_trunc('month', private.ledger_today()) - interval '2 months')::date::text, true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($sql$ select public.skip_recurring_month(current_setting('t.gas')::uuid, current_setting('t.next')::date) $sql$, 'an upcoming month can be skipped');
select is((select status from public.recurring_instances where template_id = current_setting('t.gas')::uuid and period = current_setting('t.next')::date), 'skipped', 'it is recorded as skipped');
select is((select due_on from public.recurring_instances where template_id = current_setting('t.gas')::uuid and period = current_setting('t.next')::date),
  current_setting('t.next')::date + 11, 'with its due date');
select is((select expense_id from public.recurring_instances where template_id = current_setting('t.gas')::uuid and period = current_setting('t.next')::date), null, 'and no expense');
select throws_ok($sql$ select public.skip_recurring_month(current_setting('t.gas')::uuid, current_setting('t.next')::date) $sql$, 'P0001', 'already_created', 'a month cannot be skipped twice');
select throws_ok($sql$ select public.skip_recurring_month(current_setting('t.gas')::uuid, current_setting('t.past')::date) $sql$, 'P0001', 'month_passed', 'a month already past cannot be skipped');
select throws_ok($sql$ select public.skip_recurring_month(current_setting('t.gas')::uuid, current_setting('t.next')::date + 5) $sql$, '22023', 'invalid_period', 'a period is the first of a month');
select is((select count(*)::int from public.recurring_template_log where template_id = current_setting('t.gas')::uuid and change = 'skipped'), 1, 'the skip is logged');

-- Ending.
select lives_ok($sql$ select public.end_recurring_template(current_setting('t.wifi')::uuid) $sql$, 'an admin ends a template');
select isnt((select ended_at from public.recurring_templates where id = current_setting('t.wifi')::uuid), null, 'it is marked ended, not deleted');
select throws_ok($sql$ select public.end_recurring_template(current_setting('t.wifi')::uuid) $sql$, 'P0001', 'already_ended', 'it cannot be ended twice');
select throws_ok($sql$ select public.save_recurring_template(current_setting('t.wifi')::uuid, pg_temp.bill('{}')) $sql$, 'P0001', 'template_ended', 'an ended template cannot be edited');
select throws_ok($sql$ select public.pause_recurring_template(current_setting('t.wifi')::uuid) $sql$, 'P0001', 'template_ended', 'paused');
select throws_ok($sql$ select public.skip_recurring_month(current_setting('t.wifi')::uuid, current_setting('t.next')::date) $sql$, 'P0001', 'template_ended', 'or skipped');
reset role;

-- Rent stays private after saving: a member sees the bills but not the rent template.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.recurring_templates where kind = 'rent'), 0, 'a member still cannot see the rent template');
select is((select count(*)::int from public.recurring_templates where kind = 'bill'), 2, 'but sees the bills');
select is((select count(*)::int from public.recurring_rooms), 0, 'and no rooms');
reset role;

select * from finish();
rollback;
