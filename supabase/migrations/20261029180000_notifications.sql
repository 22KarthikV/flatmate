-- Notifications (SPEC-notifications N1 to N5, N7).
--
-- One row per recipient per event, written only by private.notify in the same transaction as the
-- event it describes. People read their own rows and mark them read or snoozed through functions;
-- they never write notifications. Push delivery hangs off the same transaction: notify queues one
-- push_outbox row per device, and a worker (a later task) sends them.

-- The kinds of notification, with who gets what by default. A saved preference overrides these.
-- Each module's migration adds its own types here.
create table public.notification_types (
  type text primary key check (type ~ '^[a-z][a-z0-9_]*$'),
  default_in_app boolean not null,
  default_push boolean not null,
  snoozable boolean not null default false
);

comment on table public.notification_types is
  'Registry of notification types and their default channels. Modules add rows in their own migrations.';

insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('member_joined', true, false, false),
  ('member_left', true, false, false),
  ('role_changed', true, true, false);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  household_id uuid not null references public.households (id),
  type text not null references public.notification_types (type),
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 200),
  -- An internal path only, so a notification can never send someone off-site.
  href text not null check (char_length(href) <= 200 and href ~ '^/([^/\\]|$)'),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  snoozed_until timestamptz,
  constraint notifications_one_per_event unique (recipient_id, dedupe_key)
);

create index notifications_inbox on public.notifications (recipient_id, read_at, created_at desc);

create table public.notification_preferences (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null references public.notification_types (type),
  in_app boolean not null,
  push boolean not null,
  primary key (profile_id, type)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 2048),
  p256dh text not null,
  auth text not null,
  user_agent text check (char_length(user_agent) <= 200),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failed_at timestamptz
);

create index push_subscriptions_profile on public.push_subscriptions (profile_id);

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  constraint push_outbox_one_per_device unique (notification_id, subscription_id)
);

create index push_outbox_due on public.push_outbox (next_attempt_at) where sent_at is null;

alter table public.notification_types enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;

revoke all on public.notification_types, public.notifications, public.notification_preferences,
  public.push_subscriptions, public.push_outbox from anon, authenticated;

grant select on public.notification_types to authenticated;
grant select on public.notifications to authenticated;
grant select on public.notification_preferences to authenticated;
-- A device's secret keys are never readable from the browser.
grant select (id, profile_id, user_agent, created_at, last_success_at, failed_at)
  on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;
-- push_outbox: no grants, no policies. Only the service role reaches it.

create policy notification_types_select on public.notification_types
  for select to authenticated using (true);

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = (select authz.current_profile_id()));

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using (profile_id = (select authz.current_profile_id()));

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (profile_id = (select authz.current_profile_id()));

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (profile_id = (select authz.current_profile_id()));

-- Writes a notification for one recipient. Returns its id, or null when nothing was created
-- (same dedupe key already used, or the person turned this type off in their inbox).
-- A push is queued for each of the person's devices only when push is on for this type, and never
-- without an inbox row behind it.
create or replace function private.notify(
  p_recipient uuid,
  p_household uuid,
  p_type text,
  p_title text,
  p_body text,
  p_href text,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in_app boolean;
  v_push boolean;
  v_id uuid;
begin
  if not exists (
    select 1 from public.memberships
     where profile_id = p_recipient and household_id = p_household and left_at is null
  ) then
    raise exception 'recipient_not_in_household' using errcode = 'P0001';
  end if;

  select coalesce(pr.in_app, t.default_in_app), coalesce(pr.push, t.default_push)
    into v_in_app, v_push
    from public.notification_types t
    left join public.notification_preferences pr
      on pr.type = t.type and pr.profile_id = p_recipient
   where t.type = p_type;
  if not found then
    raise exception 'unknown_type' using errcode = '23503';
  end if;

  if not v_in_app then
    return null;
  end if;

  insert into public.notifications (recipient_id, household_id, type, title, body, href, dedupe_key)
  values (p_recipient, p_household, p_type, p_title, coalesce(p_body, ''), p_href, p_dedupe_key)
  on conflict (recipient_id, dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;

  if v_push then
    insert into public.push_outbox (notification_id, subscription_id)
    select v_id, s.id from public.push_subscriptions s where s.profile_id = p_recipient;
  end if;

  return v_id;
end;
$$;

-- The same, for the service role (Edge Functions and scheduled jobs in later modules).
create or replace function public.notify(
  p_recipient uuid,
  p_household uuid,
  p_type text,
  p_title text,
  p_body text,
  p_href text,
  p_dedupe_key text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.notify(p_recipient, p_household, p_type, p_title, p_body, p_href, p_dedupe_key);
$$;

create or replace function public.mark_read(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = p_id and recipient_id = (select authz.current_profile_id());
$$;

create or replace function public.mark_all_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = now()
   where recipient_id = (select authz.current_profile_id()) and read_at is null;
$$;

-- Hides a reminder from the unread count until p_until (at most a week away).
create or replace function public.snooze(p_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snoozable boolean;
begin
  select t.snoozable into v_snoozable
    from public.notifications n
    join public.notification_types t on t.type = n.type
   where n.id = p_id and n.recipient_id = (select authz.current_profile_id());
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not v_snoozable then
    raise exception 'not_snoozable' using errcode = 'P0001';
  end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '7 days' then
    raise exception 'invalid_snooze' using errcode = 'P0001';
  end if;

  update public.notifications set snoozed_until = p_until where id = p_id;
end;
$$;

create or replace function public.set_notification_preference(
  p_type text,
  p_in_app boolean,
  p_push boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := (select authz.current_profile_id());
begin
  if v_profile is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  insert into public.notification_preferences (profile_id, type, in_app, push)
  values (v_profile, p_type, p_in_app, p_push)
  on conflict (profile_id, type) do update set in_app = excluded.in_app, push = excluded.push;
end;
$$;

-- Saves this device for push. A device that changes hands (same endpoint) moves to the new person.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := (select authz.current_profile_id());
  v_id uuid;
begin
  if v_profile is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 2048
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid_subscription' using errcode = 'P0001';
  end if;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (v_profile, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        failed_at = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.notify(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_read(uuid) from public, anon;
revoke all on function public.mark_all_read() from public, anon;
revoke all on function public.snooze(uuid, timestamptz) from public, anon;
revoke all on function public.set_notification_preference(text, boolean, boolean) from public, anon;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.notify(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.mark_all_read() to authenticated;
grant execute on function public.snooze(uuid, timestamptz) to authenticated;
grant execute on function public.set_notification_preference(text, boolean, boolean) to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

comment on function private.notify(uuid, uuid, text, text, text, text, text) is
  'Writes one notification (and queues pushes) in the caller''s transaction. Idempotent per recipient and dedupe key.';

-- Live inbox: tell signed-in people the moment a notification arrives. Row-level security applies
-- per subscriber, so each person only hears about their own rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
