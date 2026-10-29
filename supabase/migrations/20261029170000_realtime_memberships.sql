-- Live flat updates: tell signed-in members the moment someone joins, leaves or changes role,
-- so open screens refresh without anyone navigating away and back.
--
-- Realtime applies row-level security per subscriber, so people only ever hear about rows of their
-- own flat (the memberships select policy). Nothing else is published.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memberships'
  ) then
    alter publication supabase_realtime add table public.memberships;
  end if;
end;
$$;
