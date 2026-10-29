begin;
select plan(2);

select ok(
  exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memberships'
  ),
  'membership changes are published to realtime'
);
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('invites', 'profiles', 'households')),
  0,
  'and nothing more personal is'
);

select * from finish();
rollback;
