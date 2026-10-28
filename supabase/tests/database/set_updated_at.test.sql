begin;
select plan(5);

select has_function('public', 'set_updated_at', array[]::text[], 'set_updated_at() exists');

select is(
  (select p.proconfig
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'),
  array['search_path=""'],
  'set_updated_at() pins an empty search_path'
);

create temp table widgets (
  id int primary key,
  label text not null,
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on widgets
  for each row execute function public.set_updated_at();

insert into widgets values (1, 'before', '2000-01-01 00:00:00+00');

update widgets set label = 'after' where id = 1;

select ok(
  (select updated_at from widgets where id = 1) > '2000-01-01 00:00:00+00'::timestamptz,
  'an update moves updated_at forward'
);

select is(
  (select updated_at from widgets where id = 1),
  now(),
  'updated_at is stamped with the transaction time'
);

select is(
  (select label from widgets where id = 1),
  'after',
  'the trigger does not disturb the update itself'
);

select * from finish();
rollback;
