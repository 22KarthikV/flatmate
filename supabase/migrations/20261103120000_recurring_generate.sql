-- Recurring: the monthly generator (SPEC-recurring R2, R3, R7, R8, R9, R12, R13).
--
-- Each day a job looks at every running template and creates the months that are due to appear:
-- 7 days before the due date for rent and fixed bills, 14 for variable bills. It never goes back
-- (a month whose due date has passed is not created), never creates a month twice (the instance
-- insert is the lock: only the run whose insert wins writes any money), and does nothing for a
-- paused or ended template.
--   * A fixed bill becomes an ordinary ledger expense through the ledger's own writer.
--   * A variable bill waits, with its payer asked for the amount; entering it writes the expense.
--   * Rent becomes one private charge per person, and nothing goes near the ledger.
-- Before creating anything the job pauses any template that can no longer run as described (its
-- payer or collector left, or someone with a share left), and tells every admin, because the app
-- never guesses new rooms or percentages. Equal bills carry on over whoever is in the flat.
-- Every function takes the time as a parameter so tests can move through it.

-- "Today" in the flats' calendar at a given moment.
create or replace function private.recurring_london_date(p_now timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_now at time zone 'Europe/London')::date;
$$;

-- The owners and admins of a flat: who hears about things that need an admin.
create or replace function private.recurring_notify_admins(
  p_household uuid, p_type text, p_title text, p_body text, p_href text, p_dedupe text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select m.profile_id from public.memberships m
     where m.household_id = p_household and m.left_at is null and m.role in ('owner', 'admin')
     order by m.profile_id
  loop
    perform private.notify(r.profile_id, p_household, p_type, left(p_title, 80), left(p_body, 200), p_href, p_dedupe);
  end loop;
end;
$$;

-- Who shares a bill this month, with their hundredths of a percent for a percentage bill (null for
-- an equal one). An equal bill with nobody listed is shared by everyone in the flat; with people
-- listed, by those of them still in the flat.
create or replace function private.recurring_bill_sharers(p_template uuid)
returns table (profile_id uuid, basis_points integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.recurring_templates;
begin
  select * into t from public.recurring_templates where id = p_template;
  if t.split_mode = 'percent' then
    return query
      select s.profile_id, s.share_value::integer
        from public.recurring_template_shares s
       where s.template_id = t.id
       order by s.profile_id;
  elsif exists (select 1 from public.recurring_template_shares s where s.template_id = t.id) then
    return query
      select s.profile_id, null::integer
        from public.recurring_template_shares s
        join public.memberships m
          on m.household_id = t.household_id and m.profile_id = s.profile_id and m.left_at is null
       where s.template_id = t.id
       order by s.profile_id;
  else
    return query
      select m.profile_id, null::integer
        from public.memberships m
       where m.household_id = t.household_id and m.left_at is null
       order by m.profile_id;
  end if;
end;
$$;

-- Writes the ledger expense for one month of a bill and tells the sharers. Returns the expense id.
create or replace function private.recurring_post_bill(
  t public.recurring_templates, p_instance uuid, p_due date, p_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_points integer[];
  v_shares bigint[];
  v_expense uuid;
  r record;
begin
  select array_agg(x.profile_id order by x.profile_id), array_agg(x.basis_points order by x.profile_id)
    into v_ids, v_points
    from private.recurring_bill_sharers(t.id) x;
  if v_ids is null then
    raise exception 'no_sharers' using errcode = 'P0001';
  end if;
  if t.split_mode = 'percent' and exists (
    select 1 from unnest(v_ids) i where not private.recurring_is_member(t.household_id, i, false)
  ) then
    raise exception 'sharer_left' using errcode = 'P0001';
  end if;

  select array_agg(s.pence order by s.profile_id) into v_shares
    from private.recurring_split_bill(p_amount, t.split_mode, v_ids, v_points) s;

  v_expense := private.ledger_write_expense(
    t.household_id, t.paid_by, null, p_amount,
    left(t.name || ', ' || to_char(p_due, 'FMMonth YYYY'), 80), 'bills', p_due,
    t.paid_by, v_ids, v_shares
  );

  for r in
    select s.profile_id, s.pence
      from private.recurring_split_bill(p_amount, t.split_mode, v_ids, v_points) s
     where s.pence > 0 and s.profile_id <> t.paid_by
  loop
    perform private.notify(
      r.profile_id, t.household_id, 'recurring_posted',
      left(t.name || ' for ' || to_char(p_due, 'FMMonth') || ' is created', 80),
      'Your share is ' || private.format_pence(r.pence) || '.',
      '/money/expenses/' || v_expense, 'recurring_posted:' || p_instance
    );
  end loop;
  return v_expense;
end;
$$;

-- Creates one month of a template if it does not exist yet. The instance insert decides: if another
-- run (or an earlier day) already made it, nothing else is written.
create or replace function private.recurring_create_instance(
  t public.recurring_templates, p_period date, p_due date, p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instance uuid;
  v_expense uuid;
  r record;
  v_collector text;
begin
  insert into public.recurring_instances (template_id, household_id, period, due_on, status)
  values (t.id, t.household_id, p_period, p_due,
          case when t.kind = 'rent' then 'posted' else 'awaiting_amount' end)
  on conflict (template_id, period) do nothing
  returning id into v_instance;
  if v_instance is null then
    return;
  end if;

  if t.kind = 'rent' then
    select display_name into v_collector from public.profiles where id = t.paid_by;
    for r in
      select s.profile_id, s.share_value, ro.name as room_name
        from public.recurring_template_shares s
        left join public.recurring_rooms ro on ro.id = s.room_id
       where s.template_id = t.id and s.profile_id <> t.paid_by
         and private.recurring_is_member(t.household_id, s.profile_id, false)
       order by s.profile_id
    loop
      insert into public.rent_charges
        (household_id, template_id, instance_id, period, profile_id, collector_id, amount_pence, due_on, room_name)
      values
        (t.household_id, t.id, v_instance, p_period, r.profile_id, t.paid_by, r.share_value, p_due, r.room_name)
      on conflict (template_id, period, profile_id) do nothing;
      perform private.notify(
        r.profile_id, t.household_id, 'rent_charged',
        left('Your rent for ' || to_char(p_due, 'FMMonth') || ' is ' || private.format_pence(r.share_value), 80),
        'Due ' || to_char(p_due, 'FMDD Mon') || ' to ' || coalesce(v_collector, 'the collector') || '.',
        '/money/rent', 'rent_charged:' || v_instance
      );
    end loop;
  elsif t.amount_mode = 'fixed' then
    v_expense := private.recurring_post_bill(t, v_instance, p_due, t.amount_pence);
    update public.recurring_instances set status = 'posted', expense_id = v_expense where id = v_instance;
  else
    perform private.notify(
      t.paid_by, t.household_id, 'bill_amount_needed',
      left('Enter this month''s ' || t.name || ' amount', 80),
      'It is due on ' || to_char(p_due, 'FMDD Mon') || '. Open it to type the amount from the bill or letter.',
      '/money/recurring/instances/' || v_instance || '/amount',
      'bill_amount:' || v_instance || ':' || to_char(private.recurring_london_date(p_now), 'YYYYMMDD')
    );
  end if;
end;
$$;

-- Creates whatever months of one template have come inside their window.
create or replace function private.recurring_generate_template(p_template uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.recurring_templates;
  v_today date := private.recurring_london_date(p_now);
  v_lead integer;
  v_period date;
  v_due date;
begin
  select * into t from public.recurring_templates where id = p_template for update;
  if not found or t.ended_at is not null or t.paused_at is not null then
    return;
  end if;
  v_lead := case when t.kind = 'bill' and t.amount_mode = 'variable' then 14 else 7 end;

  foreach v_period in array array[
    date_trunc('month', v_today)::date,
    (date_trunc('month', v_today) + interval '1 month')::date
  ] loop
    continue when not (extract(month from v_period)::smallint = any (t.active_months));
    v_due := v_period + (t.due_day - 1);
    -- Never back-fill a month that is already past due; wait until the window opens.
    continue when v_due < v_today or v_due - v_lead > v_today;
    perform private.recurring_create_instance(t, v_period, v_due, p_now);
  end loop;
end;
$$;

-- Pauses any running template that can no longer work as described, and tells every admin.
create or replace function private.recurring_pause_orphans(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.recurring_templates;
  v_reason text;
  v_who text;
  v_what text;
  r record;
begin
  for t in
    select * from public.recurring_templates
     where ended_at is null and paused_at is null
     order by id
     for update
  loop
    v_reason := null;
    if not private.recurring_is_member(t.household_id, t.paid_by, t.kind = 'rent') then
      v_reason := 'payer_left';
      select display_name into v_who from public.profiles where id = t.paid_by;
    elsif t.split_mode in ('amounts', 'percent') then
      select p.display_name into v_who
        from public.recurring_template_shares s
        join public.profiles p on p.id = s.profile_id
       where s.template_id = t.id and not private.recurring_is_member(t.household_id, s.profile_id, false)
       order by s.profile_id limit 1;
      if found then
        v_reason := 'member_left';
      end if;
    elsif exists (select 1 from public.recurring_template_shares s where s.template_id = t.id)
          and not exists (select 1 from private.recurring_bill_sharers(t.id)) then
      v_reason := 'member_left';
      v_who := 'Everyone who shared it';
    end if;

    if v_reason is not null then
      update public.recurring_templates set paused_at = p_now, paused_reason = v_reason where id = t.id;
      insert into public.recurring_template_log (template_id, household_id, changed_by, change, detail)
      values (t.id, t.household_id, t.created_by, 'paused', jsonb_build_object('by', 'system', 'reason', v_reason));
      v_what := case when t.kind = 'rent' then 'the rent' else t.name end;
      perform private.recurring_notify_admins(
        t.household_id, 'recurring_attention',
        case v_reason
          when 'payer_left' then left(coalesce(v_who, 'The person it was set to') || ' is no longer ' ||
            case when t.kind = 'rent' then 'able to collect' else 'paying' end || ', so ' || v_what || ' is paused', 80)
          else left(coalesce(v_who, 'A flatmate') || ' left, so ' || v_what || ' is paused', 80)
        end,
        case v_reason
          when 'payer_left' then 'Choose who ' || case when t.kind = 'rent' then 'collects' else 'pays' end || ' it and resume it. Nothing new is created until then.'
          else 'Please check ' || case when t.kind = 'rent' then 'the rooms' else 'the shares' end || ' and resume it. Nothing new is created until then.'
        end,
        '/money/recurring/' || t.id,
        'recurring_paused:' || t.id || ':' || to_char(private.recurring_london_date(p_now), 'YYYYMMDD')
      );
    elsif t.kind = 'rent' then
      -- A new flatmate has no room: they are not charged until an admin places them.
      for r in
        select m.profile_id, p.display_name
          from public.memberships m
          join public.profiles p on p.id = m.profile_id
         where m.household_id = t.household_id and m.left_at is null and m.profile_id <> t.paid_by
           and not exists (select 1 from public.recurring_template_shares s
                            where s.template_id = t.id and s.profile_id = m.profile_id)
         order by m.profile_id
      loop
        perform private.recurring_notify_admins(
          t.household_id, 'recurring_attention',
          r.display_name || ' has no room in the rent yet',
          'They are not charged until an admin adds them to a room when editing the rent.',
          '/money/recurring/' || t.id,
          'rent_noroom:' || t.id || ':' || r.profile_id
        );
      end loop;
    end if;
  end loop;
end;
$$;

-- The daily work, in order: pause what cannot run, then create what is due.
create or replace function private.recurring_generate(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform private.recurring_pause_orphans(p_now);
  for r in
    select id from public.recurring_templates where ended_at is null and paused_at is null order by id
  loop
    perform private.recurring_generate_template(r.id, p_now);
  end loop;
end;
$$;

-- Saving or resuming a template creates an upcoming month at once when it is already inside its
-- window, as the template's owner would expect (replaces the placeholder from the previous migration).
create or replace function private.recurring_after_save(p_template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recurring_generate_template(p_template, now());
end;
$$;

-- The payer of a variable bill types this month's amount. It writes the ledger expense, splits it
-- by the template's rule, marks the month posted and tells the sharers. Once only: a mistake is
-- fixed by editing or voiding that expense in the ledger.
create or replace function public.enter_bill_amount(p_instance uuid, p_amount_pence bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  i public.recurring_instances;
  t public.recurring_templates;
  v_expense uuid;
begin
  select * into i from public.recurring_instances where id = p_instance for update;
  if not found or not exists (
    select 1 from public.memberships m
     where m.household_id = i.household_id and m.profile_id = v_caller and m.left_at is null
  ) then
    raise exception 'instance_not_found' using errcode = 'P0001';
  end if;
  select * into t from public.recurring_templates where id = i.template_id;
  if t.kind <> 'bill' or t.amount_mode <> 'variable' then
    raise exception 'instance_not_found' using errcode = 'P0001';
  end if;
  if t.paid_by <> v_caller then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if i.status = 'posted' then
    raise exception 'already_entered' using errcode = 'P0001';
  end if;
  if i.status <> 'awaiting_amount' then
    raise exception 'not_awaiting' using errcode = 'P0001';
  end if;

  v_expense := private.recurring_post_bill(t, i.id, i.due_on, p_amount_pence);
  update public.recurring_instances set status = 'posted', expense_id = v_expense where id = i.id;
  return v_expense;
end;
$$;

revoke all on function private.recurring_london_date(timestamptz) from public, anon, authenticated;
revoke all on function private.recurring_notify_admins(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.recurring_bill_sharers(uuid) from public, anon, authenticated;
revoke all on function private.recurring_post_bill(public.recurring_templates, uuid, date, bigint) from public, anon, authenticated;
revoke all on function private.recurring_create_instance(public.recurring_templates, date, date, timestamptz) from public, anon, authenticated;
revoke all on function private.recurring_generate_template(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.recurring_pause_orphans(timestamptz) from public, anon, authenticated;
revoke all on function private.recurring_generate(timestamptz) from public, anon, authenticated;
revoke all on function private.recurring_after_save(uuid) from public, anon, authenticated;
revoke all on function public.enter_bill_amount(uuid, bigint) from public, anon;
grant execute on function public.enter_bill_amount(uuid, bigint) to authenticated;

comment on function public.enter_bill_amount(uuid, bigint) is
  'The payer of a variable bill enters this month''s amount, once. Writes the ledger expense and tells the sharers.';
