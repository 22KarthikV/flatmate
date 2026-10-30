-- Ledger: adding, correcting and cancelling expenses (SPEC-ledger L2, L4, L8, L9).
--
-- These three functions are the only writers of expenses and shares. Each derives the caller from
-- auth.uid(), checks the rules again in the database (the app has computed the split, but nothing is
-- trusted), and writes the notifications in the same transaction. A correction voids the old
-- expense and adds a new one that points back at it; nothing is ever rewritten or deleted.
--
-- Money types push fixed, generic text (set in the previous migration). That is done where the
-- worker already reads its text from, so deliver-push needs no change:
-- claim_push_outbox now prefers the type's push_title and push_body over the notification's own.

-- £4.20. Amounts here are always between 1p and £10,000.
create or replace function private.format_pence(p_pence bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select '£' || to_char(p_pence / 100.0, 'FM9,999,990.00');
$$;

-- Today's date in the flats' timezone (Europe/London), which is what "today" means to a person.
create or replace function private.ledger_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/London')::date;
$$;

-- Validates one expense and writes it with its shares. Returns the new id. p_replaces is the expense
-- being corrected, or null. Zero-pence shares are dropped.
create or replace function private.ledger_write_expense(
  p_household uuid,
  p_caller uuid,
  p_replaces uuid,
  p_amount_pence bigint,
  p_description text,
  p_category text,
  p_occurred_on date,
  p_paid_by uuid,
  p_profile_ids uuid[],
  p_share_pence bigint[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_description text := btrim(coalesce(p_description, ''));
  v_id uuid;
  v_index integer;
begin
  if p_amount_pence is null or p_amount_pence not between 1 and 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if char_length(v_description) not between 1 and 80 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;
  if p_category is null
     or p_category not in ('groceries', 'household', 'bills', 'takeaway', 'transport', 'fun', 'other') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_occurred_on is null
     or p_occurred_on > private.ledger_today() + 30
     or p_occurred_on < (private.ledger_today() - interval '5 years')::date then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_paid_by is null
     or p_profile_ids is null or p_share_pence is null
     or coalesce(cardinality(p_profile_ids), 0) = 0
     or cardinality(p_profile_ids) <> cardinality(p_share_pence)
     or array_position(p_profile_ids, null) is not null
     or array_position(p_share_pence, null) is not null
     or (select count(distinct x) from unnest(p_profile_ids) x) <> cardinality(p_profile_ids)
     or exists (select 1 from unnest(p_share_pence) s where s < 0) then
    raise exception 'invalid_shares' using errcode = '22023';
  end if;
  if (select sum(s) from unnest(p_share_pence) s) <> p_amount_pence then
    raise exception 'shares_must_add_up' using errcode = '23514';
  end if;

  insert into public.expenses
    (household_id, paid_by, created_by, amount_pence, description, category, occurred_on, replaces_id)
  values
    (p_household, p_paid_by, p_caller, p_amount_pence, v_description, p_category, p_occurred_on, p_replaces)
  returning id into v_id;

  for v_index in 1 .. cardinality(p_profile_ids) loop
    if p_share_pence[v_index] > 0 then
      insert into public.expense_shares (expense_id, household_id, profile_id, share_pence)
      values (v_id, p_household, p_profile_ids[v_index], p_share_pence[v_index]);
    end if;
  end loop;

  return v_id;
end;
$$;

-- Tells the people an expense involves (the payer and everyone with a share) that it was added.
create or replace function private.ledger_notify_added(p_expense uuid, p_caller uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.expenses;
  v_actor text;
  v_payer text;
  r record;
  v_body text;
begin
  select * into e from public.expenses where id = p_expense;
  select display_name into v_actor from public.profiles where id = p_caller;
  select display_name into v_payer from public.profiles where id = e.paid_by;

  for r in
    select x.pid, coalesce(sh.share_pence, 0) as share
      from (
        select e.paid_by as pid
        union
        select s.profile_id from public.expense_shares s where s.expense_id = e.id
      ) x
      left join public.expense_shares sh on sh.expense_id = e.id and sh.profile_id = x.pid
     where x.pid <> p_caller
       and exists (select 1 from public.memberships m
                    where m.household_id = e.household_id and m.profile_id = x.pid and m.left_at is null)
  loop
    if r.pid = e.paid_by then
      v_body := 'You paid ' || private.format_pence(e.amount_pence)
        || case when r.share > 0 then ' and your share is ' || private.format_pence(r.share) else '' end || '.';
    else
      v_body := 'Your share is ' || private.format_pence(r.share) || '.'
        || case when e.paid_by <> p_caller then ' Paid by ' || v_payer || '.' else '' end;
    end if;
    perform private.notify(
      r.pid, e.household_id, 'expense_added',
      left(v_actor || ' added ' || e.description, 80), v_body,
      '/money/expenses/' || e.id, 'expense:' || e.id
    );
  end loop;
end;
$$;

create or replace function public.add_expense(
  p_amount_pence bigint,
  p_description text,
  p_category text,
  p_occurred_on date,
  p_paid_by uuid,
  p_profile_ids uuid[],
  p_share_pence bigint[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
  v_id uuid;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_id := private.ledger_write_expense(
    v_household, v_caller, null, p_amount_pence, p_description, p_category, p_occurred_on,
    p_paid_by, p_profile_ids, p_share_pence
  );
  perform private.ledger_notify_added(v_id, v_caller);
  return v_id;
end;
$$;

-- Finds an expense the caller may correct or cancel: they must be in its flat, and either added it
-- or be an owner or admin there. Someone outside the flat gets "not found", never "not allowed", so
-- another flat's expense ids reveal nothing. Locks the row so two cancellations cannot race.
create or replace function private.ledger_lock_editable(p_expense uuid, p_caller uuid)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.expenses;
begin
  select * into e from public.expenses where id = p_expense for update;
  if not found or not exists (
    select 1 from public.memberships m
     where m.household_id = e.household_id and m.profile_id = p_caller and m.left_at is null
  ) then
    raise exception 'expense_not_found' using errcode = 'P0001';
  end if;
  if e.created_by <> p_caller and not exists (
    select 1 from public.memberships m
     where m.household_id = e.household_id and m.profile_id = p_caller and m.left_at is null
       and m.role in ('owner', 'admin')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if e.voided_at is not null then
    raise exception 'already_voided' using errcode = 'P0001';
  end if;
  return e;
end;
$$;

create or replace function public.edit_expense(
  p_expense_id uuid,
  p_amount_pence bigint,
  p_description text,
  p_category text,
  p_occurred_on date,
  p_paid_by uuid,
  p_profile_ids uuid[],
  p_share_pence bigint[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_old public.expenses;
  v_new public.expenses;
  v_new_id uuid;
  v_actor text;
  r record;
  v_body text;
begin
  v_old := private.ledger_lock_editable(p_expense_id, v_caller);

  update public.expenses set voided_at = now(), voided_by = v_caller where id = v_old.id;
  v_new_id := private.ledger_write_expense(
    v_old.household_id, v_caller, v_old.id, p_amount_pence, p_description, p_category,
    p_occurred_on, p_paid_by, p_profile_ids, p_share_pence
  );
  select * into v_new from public.expenses where id = v_new_id;

  -- Everyone the old or the new version involved hears about it, including anyone taken out.
  select display_name into v_actor from public.profiles where id = v_caller;
  for r in
    select x.pid, coalesce(sh.share_pence, 0) as share
      from (
        select ex.paid_by as pid from public.expenses ex where ex.id in (v_old.id, v_new.id)
        union
        select s.profile_id from public.expense_shares s where s.expense_id in (v_old.id, v_new.id)
      ) x
      left join public.expense_shares sh on sh.expense_id = v_new.id and sh.profile_id = x.pid
     where x.pid <> v_caller
       and exists (select 1 from public.memberships m
                    where m.household_id = v_new.household_id and m.profile_id = x.pid and m.left_at is null)
  loop
    if r.share > 0 then
      v_body := 'Your share is now ' || private.format_pence(r.share) || '.';
    elsif r.pid = v_new.paid_by then
      v_body := 'You paid ' || private.format_pence(v_new.amount_pence) || '.';
    else
      v_body := 'You are no longer part of this expense.';
    end if;
    perform private.notify(
      r.pid, v_new.household_id, 'expense_changed',
      left(v_actor || ' changed ' || v_new.description, 80), v_body,
      '/money/expenses/' || v_new.id, 'expense_changed:' || v_new.id
    );
  end loop;

  return v_new.id;
end;
$$;

create or replace function public.void_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  e public.expenses;
  v_actor text;
  r record;
  v_body text;
begin
  e := private.ledger_lock_editable(p_expense_id, v_caller);
  update public.expenses set voided_at = now(), voided_by = v_caller where id = e.id;

  select display_name into v_actor from public.profiles where id = v_caller;
  for r in
    select x.pid, coalesce(sh.share_pence, 0) as share
      from (
        select e.paid_by as pid
        union
        select s.profile_id from public.expense_shares s where s.expense_id = e.id
      ) x
      left join public.expense_shares sh on sh.expense_id = e.id and sh.profile_id = x.pid
     where x.pid <> v_caller
       and exists (select 1 from public.memberships m
                    where m.household_id = e.household_id and m.profile_id = x.pid and m.left_at is null)
  loop
    if r.pid = e.paid_by then
      v_body := 'You paid ' || private.format_pence(e.amount_pence) || '; it no longer counts.';
    else
      v_body := 'Your share of ' || private.format_pence(r.share) || ' no longer counts.';
    end if;
    perform private.notify(
      r.pid, e.household_id, 'expense_voided',
      left(v_actor || ' cancelled ' || e.description, 80), v_body,
      '/money/expenses/' || e.id, 'expense_voided:' || e.id
    );
  end loop;
end;
$$;

revoke all on function private.format_pence(bigint) from public, anon, authenticated;
revoke all on function private.ledger_today() from public, anon, authenticated;
revoke all on function private.ledger_write_expense(uuid, uuid, uuid, bigint, text, text, date, uuid, uuid[], bigint[])
  from public, anon, authenticated;
revoke all on function private.ledger_notify_added(uuid, uuid) from public, anon, authenticated;
revoke all on function private.ledger_lock_editable(uuid, uuid) from public, anon, authenticated;

revoke all on function public.add_expense(bigint, text, text, date, uuid, uuid[], bigint[]) from public, anon;
revoke all on function public.edit_expense(uuid, bigint, text, text, date, uuid, uuid[], bigint[]) from public, anon;
revoke all on function public.void_expense(uuid) from public, anon;
grant execute on function public.add_expense(bigint, text, text, date, uuid, uuid[], bigint[]) to authenticated;
grant execute on function public.edit_expense(uuid, bigint, text, text, date, uuid, uuid[], bigint[]) to authenticated;
grant execute on function public.void_expense(uuid) to authenticated;

comment on function public.add_expense(bigint, text, text, date, uuid, uuid[], bigint[]) is
  'Adds a shared expense with its shares (two aligned arrays) to the caller''s flat and tells the people it involves.';
comment on function public.edit_expense(uuid, bigint, text, text, date, uuid, uuid[], bigint[]) is
  'Corrects an expense: voids it and adds a replacement. Creator or an admin only.';
comment on function public.void_expense(uuid) is
  'Cancels an expense; it stops counting. Creator or an admin only.';

-- Push text: a type with fixed text sends that, so an amount never reaches a lock screen. Every
-- other type sends the notification's own title and body, exactly as before.
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
  select c.id, c.attempts, s.endpoint, s.p256dh, s.auth,
         coalesce(t.push_title, n.title), coalesce(t.push_body, n.body), n.href
    from claimed c
    join public.push_subscriptions s on s.id = c.subscription_id
    join public.notifications n on n.id = c.notification_id
    left join public.notification_types t on t.type = n.type;
$$;
