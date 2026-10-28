begin;
select plan(15);

select has_extension('pg_cron', 'pg_cron is enabled');
select has_extension('pg_net', 'pg_net is enabled');
select has_schema('private', 'private schema exists');

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
  'app roles cannot use the private schema'
);

-- The heartbeat job is registered hourly and calls the helper.
select is(
  (select schedule from cron.job where jobname = 'heartbeat'),
  '0 * * * *',
  'heartbeat runs at the top of every hour'
);
select matches(
  (select command from cron.job where jobname = 'heartbeat'),
  'invoke_edge_function',
  'heartbeat calls private.invoke_edge_function'
);

-- Registering again updates in place instead of duplicating.
select private.register_edge_job('heartbeat', '30 * * * *', 'heartbeat');
select is(
  (select count(*)::int from cron.job where jobname = 'heartbeat'),
  1,
  'registering a job twice leaves one job'
);
select is(
  (select schedule from cron.job where jobname = 'heartbeat'),
  '30 * * * *',
  'registering again replaces the schedule'
);
select private.register_edge_job('heartbeat', '0 * * * *', 'heartbeat');

-- Without configuration the invoker does nothing instead of failing the cron run.
select is(
  private.invoke_edge_function('heartbeat'),
  null::bigint,
  'invoke_edge_function is a no-op while secrets are not configured'
);

-- With configuration it queues one HTTP request.
select vault.create_secret('http://kong:8000', 'project_url');
select vault.create_secret('s3cret-value', 'scheduler_secret');

select isnt(
  private.invoke_edge_function('heartbeat'),
  null::bigint,
  'invoke_edge_function queues a request once configured'
);

-- Secret verification.
set local role service_role;
select is(public.verify_scheduler_secret('s3cret-value'), true, 'the right secret verifies');
select is(public.verify_scheduler_secret('wrong'), false, 'a wrong secret does not verify');
select is(public.verify_scheduler_secret(''), false, 'an empty secret does not verify');
reset role;

set local role anon;
select throws_ok(
  $$select public.verify_scheduler_secret('s3cret-value')$$,
  '42501', null, 'anon cannot call verify_scheduler_secret'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select public.verify_scheduler_secret('s3cret-value')$$,
  '42501', null, 'authenticated cannot call verify_scheduler_secret'
);
reset role;

select * from finish();
rollback;
