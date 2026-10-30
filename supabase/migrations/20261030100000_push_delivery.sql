-- Push delivery plumbing (SPEC-notifications N5, N6, N12).
--
-- The deliver-push Edge Function calls claim_push_outbox to take due rows, sends each push, and
-- reports back with complete_push. Claiming leases a row for a few minutes (skip locked inside the
-- claim, then a pushed-back next_attempt_at), so two overlapping runs never send the same push.
-- The retry delays and attempt cap live in the function, not here; the database only records them.
-- Both functions are for the service role only.

-- Takes up to p_limit due rows. A claimed row is pushed five minutes into the future, so if the
-- worker dies before reporting, the row simply comes round again.
create or replace function public.claim_push_outbox(p_limit integer default 25)
returns table (
  outbox_id uuid,
  attempts integer,
  endpoint text,
  p256dh text,
  auth text,
  title text,
  body text,
  href text
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select o.id
      from public.push_outbox o
     where o.sent_at is null and o.next_attempt_at <= now()
     order by o.next_attempt_at, o.id
     limit least(greatest(coalesce(p_limit, 25), 1), 100)
       for update skip locked
  ),
  claimed as (
    update public.push_outbox o
       set attempts = o.attempts + 1,
           next_attempt_at = now() + interval '5 minutes'
      from due
     where o.id = due.id
    returning o.id, o.attempts, o.notification_id, o.subscription_id
  )
  select c.id, c.attempts, s.endpoint, s.p256dh, s.auth, n.title, n.body, n.href
    from claimed c
    join public.push_subscriptions s on s.id = c.subscription_id
    join public.notifications n on n.id = c.notification_id;
$$;

-- Records what happened to one claimed row:
--   sent     delivered; the device is healthy
--   gone     the push service says the device no longer exists (404/410): remove it
--   retry    failed; try again after p_retry_in_seconds
--   give_up  failed for the last time; the row is parked and never claimed again
-- A row that is already sent is left alone, so a late or repeated report changes nothing.
create or replace function public.complete_push(
  p_outbox_id uuid,
  p_result text,
  p_retry_in_seconds integer default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription uuid;
begin
  if p_result not in ('sent', 'gone', 'retry', 'give_up') then
    raise exception 'invalid_result' using errcode = 'P0001';
  end if;

  select subscription_id into v_subscription
    from public.push_outbox
   where id = p_outbox_id and sent_at is null;
  if v_subscription is null then
    return;
  end if;

  if p_result = 'sent' then
    update public.push_outbox set sent_at = now(), last_error = null where id = p_outbox_id;
    update public.push_subscriptions set last_success_at = now(), failed_at = null where id = v_subscription;
  elsif p_result = 'gone' then
    -- The outbox rows for this device go with it (on delete cascade).
    delete from public.push_subscriptions where id = v_subscription;
  elsif p_result = 'retry' then
    update public.push_outbox
       set next_attempt_at = now() + make_interval(secs => greatest(coalesce(p_retry_in_seconds, 60), 1)),
           last_error = left(p_error, 200)
     where id = p_outbox_id;
    update public.push_subscriptions set failed_at = now() where id = v_subscription;
  else
    update public.push_outbox
       set next_attempt_at = 'infinity', last_error = left(p_error, 200)
     where id = p_outbox_id;
    update public.push_subscriptions set failed_at = now() where id = v_subscription;
  end if;
end;
$$;

revoke all on function public.claim_push_outbox(integer) from public, anon, authenticated;
revoke all on function public.complete_push(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.claim_push_outbox(integer) to service_role;
grant execute on function public.complete_push(uuid, text, integer, text) to service_role;

comment on function public.claim_push_outbox(integer) is
  'Leases due push_outbox rows for one worker (skip locked, 5 minute lease) and returns what to send. service_role only.';
comment on function public.complete_push(uuid, text, integer, text) is
  'Records the outcome of one claimed push: sent, gone, retry or give_up. Idempotent once sent. service_role only.';

-- Retention (N12): read notifications older than 90 days; outbox rows sent more than 14 days ago,
-- and parked ones whose notification is older than 14 days. Unread notifications are kept, and so is
-- anything still waiting to be sent. Delivery run records older than a week go too (one per minute).
create or replace function private.purge_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_outbox o
   where o.sent_at < now() - interval '14 days'
      or (
        o.sent_at is null
        and o.next_attempt_at = 'infinity'
        and exists (
          select 1 from public.notifications n
           where n.id = o.notification_id and n.created_at < now() - interval '14 days'
        )
      );

  delete from public.notifications where read_at < now() - interval '90 days';

  delete from public.job_runs where job_name = 'deliver-push' and created_at < now() - interval '7 days';
end;
$$;

-- Runs the purge once per UTC day, however often it is triggered, and records it in job_runs.
create or replace function private.run_notification_retention()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.job_runs (job_name, idempotency_key)
  values ('notification-retention', to_char(now() at time zone 'utc', 'YYYY-MM-DD'))
  on conflict (job_name, idempotency_key) do nothing
  returning id into v_run;
  if v_run is null then
    return;
  end if;

  begin
    perform private.purge_notifications();
    update public.job_runs set status = 'succeeded', finished_at = now() where id = v_run;
  exception when others then
    update public.job_runs set status = 'failed', error = left(sqlerrm, 200), finished_at = now() where id = v_run;
    raise;
  end;
end;
$$;

revoke all on function private.purge_notifications() from public, anon, authenticated;
revoke all on function private.run_notification_retention() from public, anon, authenticated;

-- Drain the outbox every minute through the existing scheduler; clean up once a day.
select private.register_edge_job('deliver-push', '* * * * *', 'deliver-push');
select cron.schedule(
  'notification-retention',
  '17 3 * * *',
  'select private.run_notification_retention()'
);
