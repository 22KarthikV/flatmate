-- Rota: availability (SPEC-rota T5, T18, assumption 9).
--
-- Each person says which days of the coming week they are around. The window opens at the start of
-- the Sunday a week ahead and closes at 18:00 London on the Saturday before the week starts.
-- Whoever has not answered by then is treated as around every day, and the rows say so ("assumed").
-- Two nudges go out first, and each states the deadline and what happens if it is missed. Days are
-- London calendar dates, never midnight timestamps, so the clocks changing cannot shift anything.

-- ---------------------------------------------------------------------------------------------
-- The deadline is a flat setting. Only the default exists in this module; the column is here so a
-- later change to the day or hour needs no new table.
alter table public.households
  add column availability_deadline text not null default 'saturday 18:00'
    check (availability_deadline = 'saturday 18:00');

comment on column public.households.availability_deadline is
  'When next week''s availability closes. Only ''saturday 18:00'' (London) exists so far.';

-- ---------------------------------------------------------------------------------------------
-- Notification types: in-app only, with no push text because they never push. The nudge can be snoozed.
insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('availability_open', true, false, false),
  ('availability_nudge', true, false, true);

-- ---------------------------------------------------------------------------------------------
create table public.availability (
  household_id uuid not null references public.households (id),
  profile_id uuid not null references public.profiles (id),
  on_date date not null,
  available boolean not null,
  -- True when the person never answered and the app filled the week in as "around".
  assumed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (household_id, profile_id, on_date)
);

create index availability_by_date on public.availability (household_id, on_date);

comment on table public.availability is
  'Which days a person is around. Everyone in the flat can read it, because the rota depends on it.';

alter table public.availability enable row level security;
revoke all on public.availability from anon, authenticated;
grant select on public.availability to authenticated;

create policy availability_select_members on public.availability
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

-- ---------------------------------------------------------------------------------------------
-- The window, in London time.
create or replace function private.rota_window_opens(p_week date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_week - 7)::timestamp) at time zone 'Europe/London';
$$;

create or replace function private.rota_window_closes(p_week date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_week - 1)::timestamp + interval '18 hours') at time zone 'Europe/London';
$$;

-- The week people are being asked about: the one starting on the next Sunday, London time.
create or replace function private.rota_upcoming_week(p_now timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select d - extract(dow from d)::int + 7
    from (select (p_now at time zone 'Europe/London')::date as d) t;
$$;

revoke all on function private.rota_window_opens(date) from public, anon, authenticated;
revoke all on function private.rota_window_closes(date) from public, anon, authenticated;
revoke all on function private.rota_upcoming_week(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Saying which days you are around. Seven answers, Sunday first. The caller is whoever is signed in.
create or replace function private.rota_set_availability(p_now timestamptz, p_week_start date, p_days boolean[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_week_start is null or extract(dow from p_week_start) <> 0 then
    raise exception 'invalid_week' using errcode = '22023';
  end if;
  if p_days is null or array_length(p_days, 1) is distinct from 7 or array_position(p_days, null) is not null then
    raise exception 'invalid_days' using errcode = '22023';
  end if;

  if p_now < private.rota_window_opens(p_week_start) then
    raise exception 'window_not_open' using errcode = 'P0001';
  end if;
  if p_now >= private.rota_window_closes(p_week_start) then
    raise exception 'window_closed' using errcode = 'P0001';
  end if;

  insert into public.availability (household_id, profile_id, on_date, available, assumed, updated_at)
  select v_household, v_caller, p_week_start + (t.ord - 1)::int, t.answer, false, p_now
    from unnest(p_days) with ordinality as t(answer, ord)
  on conflict (household_id, profile_id, on_date)
  do update set available = excluded.available, assumed = false, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.set_availability(p_week_start date, p_days boolean[])
returns void
language sql
security definer
set search_path = ''
as $$
  select private.rota_set_availability(now(), p_week_start, p_days);
$$;

revoke all on function private.rota_set_availability(timestamptz, date, boolean[]) from public, anon, authenticated;
revoke all on function public.set_availability(date, boolean[]) from public, anon;
grant execute on function public.set_availability(date, boolean[]) to authenticated;

comment on function public.set_availability(date, boolean[]) is
  'Say which of the seven days of a coming week (Sunday first) you are around. Only while the window is open.';

-- ---------------------------------------------------------------------------------------------
-- Assumed available. Once a week's window has closed, anyone in a flat that uses the rota who has
-- no answers for it is filled in as around every day, marked assumed. Safe to run again, and the
-- generation job (a later task) calls the per-flat part before it builds a week.
create or replace function private.rota_assume_available_for(p_household uuid, p_week date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added integer;
begin
  insert into public.availability (household_id, profile_id, on_date, available, assumed)
  select p_household, m.profile_id, p_week + d, true, true
    from public.memberships m
   cross join generate_series(0, 6) d
   where m.household_id = p_household and m.left_at is null
     and not exists (
       select 1 from public.availability a
        where a.household_id = p_household and a.profile_id = m.profile_id
          and a.on_date between p_week and p_week + 6
     )
  on conflict do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

create or replace function private.rota_assume_available(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := private.rota_upcoming_week(p_now);
  v_total integer := 0;
  r record;
begin
  if p_now < private.rota_window_closes(v_week) then
    return 0;
  end if;
  for r in
    select h.id from public.households h
     where h.closed_at is null
       and exists (select 1 from public.chores c where c.household_id = h.id and c.archived_at is null)
  loop
    v_total := v_total + private.rota_assume_available_for(r.id, v_week);
  end loop;
  return v_total;
end;
$$;

revoke all on function private.rota_assume_available_for(uuid, date) from public, anon, authenticated;
revoke all on function private.rota_assume_available(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Telling people. Each message states the deadline and the consequence in the same plain words as
-- the screen. Current members of a flat that uses the rota who have not answered; once per person
-- per message per week, and never after the window has closed.
create or replace function private.rota_send_availability_notifications(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := private.rota_upcoming_week(p_now);
  v_opens timestamptz := private.rota_window_opens(v_week);
  v_closes timestamptz := private.rota_window_closes(v_week);
  v_first timestamptz := ((v_week - 4)::timestamp + interval '9 hours') at time zone 'Europe/London';
  v_last timestamptz := ((v_week - 1)::timestamp + interval '9 hours') at time zone 'Europe/London';
  v_rule constant text :=
    'Answer by Saturday 6pm. If you do not, you will be treated as available every day this week and can be given any chore.';
  r record;
begin
  if p_now < v_opens or p_now >= v_closes then
    return;
  end if;

  for r in
    select m.profile_id, m.household_id
      from public.memberships m
      join public.households h on h.id = m.household_id and h.closed_at is null
     where m.left_at is null
       and exists (select 1 from public.chores c where c.household_id = h.id and c.archived_at is null)
       and not exists (
         select 1 from public.availability a
          where a.household_id = m.household_id and a.profile_id = m.profile_id
            and a.on_date between v_week and v_week + 6 and not a.assumed
       )
  loop
    perform private.notify(
      r.profile_id, r.household_id, 'availability_open',
      'Next week''s rota: which days are you around?', v_rule,
      '/rota/availability', 'avail_open:' || v_week
    );
    if p_now >= v_first then
      perform private.notify(
        r.profile_id, r.household_id, 'availability_nudge',
        'Reminder: tell us which days you are around', v_rule,
        '/rota/availability', 'avail_nudge1:' || v_week
      );
    end if;
    if p_now >= v_last then
      perform private.notify(
        r.profile_id, r.household_id, 'availability_nudge',
        'This morning is the last chance: which days are you around?', v_rule,
        '/rota/availability', 'avail_nudge2:' || v_week
      );
    end if;
  end loop;
end;
$$;

revoke all on function private.rota_send_availability_notifications(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Hourly, at 17 minutes past (the ledger runs at 08:00 and the push worker every minute). Once per
-- hour however often it is triggered, recorded in job_runs.
create or replace function private.run_rota_availability()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('rota-availability', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.rota_send_availability_notifications(now());
    perform private.rota_assume_available(now());
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.run_rota_availability() from public, anon, authenticated;

select cron.schedule('rota-availability', '17 * * * *', 'select private.run_rota_availability()');
