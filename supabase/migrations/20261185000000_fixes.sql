-- Extras D: the fix-it log, part 1 (SPEC-extras D). Independent of every other extras tool.
--
-- Anyone in a flat reports a problem; reports have a status and an optional person chasing the
-- landlord, and a timeline that is never rewritten. No photos in this version. Nobody writes a table
-- directly; the functions below find the caller's flat themselves. The three notification types are
-- registered here so report_fix can announce itself; status and chaser functions follow in the next
-- migration.

create table public.fix_reports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  title text not null check (char_length(title) between 1 and 80),
  details text check (details is null or char_length(details) between 1 and 500),
  location text check (location is null or char_length(location) between 1 and 40),
  status text not null default 'open' check (status in ('open', 'in_progress', 'fixed')),
  reported_by uuid not null references public.profiles (id),
  chaser_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  fixed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  -- An admin removes a report that should not be there.
  hidden_at timestamptz,
  check ((status = 'fixed') = (fixed_at is not null)),
  constraint fix_reports_id_household unique (id, household_id)
);
create index fix_reports_flat on public.fix_reports (household_id, status, created_at desc)
  where hidden_at is null;
create index fix_reports_stale on public.fix_reports (last_activity_at)
  where status <> 'fixed' and hidden_at is null;

create table public.fix_updates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  report_id uuid not null,
  kind text not null check (kind in ('note', 'status', 'chaser', 'system')),
  body text not null check (char_length(body) between 1 and 300),
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (report_id, household_id) references public.fix_reports (id, household_id)
);
create index fix_updates_report on public.fix_updates (report_id, created_at);

comment on table public.fix_reports is
  'A problem the flat has reported. Written only by the fix-it functions; hidden reports are invisible to members.';
comment on table public.fix_updates is
  'The timeline of a report: notes, status changes, chaser changes. Never changed or deleted (except by the retention purge).';

-- The timeline is never rewritten. Only the retention purge may delete, and it says so. (No truncate
-- trigger: the tests of other modules truncate households with cascade, and nothing in the app truncates.)
create or replace function private.fix_refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('flatmate.fix_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'fix_updates_are_permanent' using errcode = '42501';
end;
$$;

revoke all on function private.fix_refuse_change() from public, anon, authenticated;

create trigger fix_updates_refuse_row
  before update or delete on public.fix_updates
  for each row execute function private.fix_refuse_change();

alter table public.fix_reports enable row level security;
alter table public.fix_updates enable row level security;
revoke all on public.fix_reports, public.fix_updates from anon, authenticated;
grant select on public.fix_reports, public.fix_updates to authenticated;

create policy fix_reports_select_members on public.fix_reports
  for select to authenticated
  using ((select authz.is_household_member(household_id)) and hidden_at is null);

create policy fix_updates_select_members on public.fix_updates
  for select to authenticated
  using (
    (select authz.is_household_member(household_id))
    and exists (select 1 from public.fix_reports r where r.id = report_id and r.hidden_at is null)
  );

-- Notification types. Only fix_status and fix_stale push, and only fixed generic text.
insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('fix_reported', true, false, false),
  ('fix_status', true, true, false),
  ('fix_stale', true, true, true);

update public.notification_types set push_title = 'New fix-it report',
  push_body = 'A flatmate reported a problem. Open FlatMate to see it.' where type = 'fix_reported';
update public.notification_types set push_title = 'Fix-it update',
  push_body = 'A problem you follow has an update. Open FlatMate to see it.' where type = 'fix_status';
update public.notification_types set push_title = 'Fix-it reminder',
  push_body = 'A problem is still waiting. Open FlatMate to see it.' where type = 'fix_stale';

-- The caller's flat, or an error.
create or replace function private.fix_household()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = (select authz.current_profile_id()) and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_household;
end;
$$;

revoke all on function private.fix_household() from public, anon, authenticated;

-- Writes a timeline line and refreshes the report's clock.
create or replace function private.fix_add_update(p_report uuid, p_kind text, p_body text, p_author uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.fix_updates (household_id, report_id, kind, body, author_id)
  select r.household_id, r.id, p_kind, p_body, p_author from public.fix_reports r where r.id = p_report
  returning id into v_id;
  update public.fix_reports set last_activity_at = now() where id = p_report;
  return v_id;
end;
$$;

revoke all on function private.fix_add_update(uuid, text, text, uuid) from public, anon, authenticated;

-- Reports a problem. Everyone else in the flat gets an inbox note (no push by default).
create or replace function public.report_fix(
  p_title text,
  p_details text default null,
  p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.fix_household();
  v_caller uuid := (select authz.current_profile_id());
  v_title text := btrim(coalesce(p_title, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_id uuid;
  v_name text;
  r record;
begin
  if char_length(v_title) not between 1 and 80 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if v_details is not null and char_length(v_details) > 500 then
    raise exception 'invalid_details' using errcode = '22023';
  end if;
  if v_location is not null and char_length(v_location) > 40 then
    raise exception 'invalid_location' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fix:' || v_household::text, 0));
  if (select count(*) from public.fix_reports f
       where f.household_id = v_household and f.status <> 'fixed' and f.hidden_at is null) >= 50 then
    raise exception 'too_many_open' using errcode = 'P0001';
  end if;

  insert into public.fix_reports (household_id, title, details, location, reported_by)
  values (v_household, v_title, v_details, v_location, v_caller)
  returning id into v_id;

  select display_name into v_name from public.profiles where id = v_caller;
  for r in
    select m.profile_id from public.memberships m
     where m.household_id = v_household and m.left_at is null and m.profile_id <> v_caller
  loop
    perform private.notify(
      r.profile_id, v_household, 'fix_reported',
      left(v_name || ' reported a problem', 80), '',
      '/more/fixes/' || v_id, 'fix_reported:' || v_id
    );
  end loop;
  return v_id;
end;
$$;

-- Adds a note to a report's timeline. Any member.
create or replace function public.add_fix_note(p_report uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.fix_household();
  v_caller uuid := (select authz.current_profile_id());
  v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) not between 1 and 300 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  perform 1 from public.fix_reports r
   where r.id = p_report and r.household_id = v_household and r.hidden_at is null for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  return private.fix_add_update(p_report, 'note', v_body, v_caller);
end;
$$;

revoke all on function public.report_fix(text, text, text) from public, anon;
revoke all on function public.add_fix_note(uuid, text) from public, anon;
grant execute on function public.report_fix(text, text, text) to authenticated;
grant execute on function public.add_fix_note(uuid, text) to authenticated;
