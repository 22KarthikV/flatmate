begin;
select plan(16);

select has_table('public', 'job_runs', 'job_runs exists');
select col_not_null('public', 'job_runs', 'job_name', 'job_name is required');
select col_not_null('public', 'job_runs', 'idempotency_key', 'idempotency_key is required');
select col_not_null('public', 'job_runs', 'status', 'status is required');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.job_runs'::regclass),
  'row-level security is enabled'
);

-- Unique (job_name, idempotency_key): the second insert with the same pair is rejected.
insert into public.job_runs (job_name, idempotency_key) values ('heartbeat', '2026-10-28T12');
select throws_ok(
  $$insert into public.job_runs (job_name, idempotency_key) values ('heartbeat', '2026-10-28T12')$$,
  '23505',
  null,
  'the same job and key cannot be recorded twice'
);
select lives_ok(
  $$insert into public.job_runs (job_name, idempotency_key) values ('heartbeat', '2026-10-28T13')$$,
  'a different key for the same job is allowed'
);
select lives_ok(
  $$insert into public.job_runs (job_name, idempotency_key) values ('other', '2026-10-28T12')$$,
  'the same key under a different job is allowed'
);
select throws_ok(
  $$insert into public.job_runs (job_name, idempotency_key, status) values ('x', 'y', 'bogus')$$,
  '23514',
  null,
  'status must be a known value'
);
select is(
  (select status from public.job_runs where job_name = 'heartbeat' and idempotency_key = '2026-10-28T13'),
  'running',
  'new runs start as running'
);

-- Locked away from the app's roles.
set local role anon;
select throws_ok($$select * from public.job_runs$$, '42501', null, 'anon cannot read job_runs');
select throws_ok(
  $$insert into public.job_runs (job_name, idempotency_key) values ('a', 'b')$$,
  '42501', null, 'anon cannot write job_runs'
);
reset role;

set local role authenticated;
select throws_ok($$select * from public.job_runs$$, '42501', null, 'authenticated cannot read job_runs');
select throws_ok(
  $$insert into public.job_runs (job_name, idempotency_key) values ('a', 'b')$$,
  '42501', null, 'authenticated cannot write job_runs'
);
reset role;

-- Health probe works for the public roles and returns true.
set local role anon;
select is(public.health_ping(), true, 'anon can call health_ping()');
reset role;

select function_privs_are(
  'public', 'health_ping', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated can execute health_ping()'
);

select * from finish();
rollback;
