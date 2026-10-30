-- Ledger: the data model (SPEC-ledger L1 to L3, L8, L9).
--
-- Shared expenses and settle-up, kept as an honest record: money is whole pence, nothing is ever
-- rewritten or deleted (a correction is a void plus a new row), and balances are always summed from
-- the rows, never stored, so they cannot drift. Members of a flat can read its books; nobody writes
-- the tables directly. The functions that add, correct and settle (later migrations) are the only
-- writers. The database re-checks what the app computes: shares sum to the amount, and everyone
-- named is in the flat.

-- ---------------------------------------------------------------------------------------------
-- Flat setting used by the nudge job (a later task): after how many days of owing a person is
-- reminded. null switches nudges off.
alter table public.households
  add column nudge_after_days smallint default 7 check (nudge_after_days in (3, 7, 14));

comment on column public.households.nudge_after_days is
  'Days someone must have owed money before a gentle reminder; null means never nudge.';

-- ---------------------------------------------------------------------------------------------
-- Notification types for the ledger, with generic push text. An amount must never reach a lock
-- screen (SPEC-ledger L8), so a type can carry a fixed title and body that the push worker sends
-- instead of the inbox row's own text. The inbox row keeps the full detail.
alter table public.notification_types
  add column push_title text check (char_length(push_title) between 1 and 80),
  add column push_body text check (char_length(push_body) <= 200),
  add constraint notification_types_push_text_together check ((push_title is null) = (push_body is null));

comment on column public.notification_types.push_title is
  'When set (with push_body), a push for this type shows this fixed text instead of the notification''s own.';

insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('expense_added', true, true, false),
  ('expense_changed', true, false, false),
  ('expense_voided', true, false, false),
  ('settlement_pending', true, true, false),
  ('settlement_confirmed', true, true, false),
  ('settlement_declined', true, true, false),
  ('payment_nudge', true, false, true);

update public.notification_types set push_title = 'New expense',
  push_body = 'Someone in your flat added an expense. Open FlatMate to see your share.'
 where type = 'expense_added';
update public.notification_types set push_title = 'Expense changed',
  push_body = 'An expense that includes you was changed. Open FlatMate to see it.'
 where type = 'expense_changed';
update public.notification_types set push_title = 'Expense cancelled',
  push_body = 'An expense that included you was cancelled. Open FlatMate to see it.'
 where type = 'expense_voided';
update public.notification_types set push_title = 'Payment to confirm',
  push_body = 'Someone says they paid you. Open FlatMate to confirm.'
 where type = 'settlement_pending';
update public.notification_types set push_title = 'Payment confirmed',
  push_body = 'Your payment was confirmed.'
 where type = 'settlement_confirmed';
update public.notification_types set push_title = 'Payment not confirmed',
  push_body = 'Your payment was not confirmed. Open FlatMate for details.'
 where type = 'settlement_declined';
update public.notification_types set push_title = 'Flat money reminder',
  push_body = 'A gentle reminder about money in your flat.'
 where type = 'payment_nudge';

-- ---------------------------------------------------------------------------------------------
-- Tables.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  paid_by uuid not null references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  amount_pence bigint not null check (amount_pence between 1 and 1000000),
  description text not null check (char_length(description) between 1 and 80),
  category text not null
    check (category in ('groceries', 'household', 'bills', 'takeaway', 'transport', 'fun', 'other')),
  occurred_on date not null,
  -- Set when this expense is a correction of an earlier one (which is then voided).
  replaces_id uuid references public.expenses (id),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((voided_at is null) = (voided_by is null)),
  -- Lets the shares carry the flat too, so their policy needs no join.
  constraint expenses_id_household unique (id, household_id)
);

create index expenses_household_date on public.expenses (household_id, occurred_on desc, created_at desc);
create index expenses_replaces on public.expenses (replaces_id) where replaces_id is not null;
create index expenses_paid_by on public.expenses (household_id, paid_by);

create table public.expense_shares (
  expense_id uuid not null,
  household_id uuid not null,
  profile_id uuid not null references public.profiles (id),
  share_pence bigint not null check (share_pence >= 0),
  primary key (expense_id, profile_id),
  foreign key (expense_id, household_id) references public.expenses (id, household_id)
);

create index expense_shares_person on public.expense_shares (household_id, profile_id);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  -- The payer ("I paid") and the receiver, who confirms.
  from_profile uuid not null references public.profiles (id),
  to_profile uuid not null references public.profiles (id),
  amount_pence bigint not null check (amount_pence between 1 and 1000000),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  -- The receiver, or an admin acting for someone who has left.
  confirmed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (from_profile <> to_profile),
  check ((status = 'pending') = (decided_at is null)),
  check ((status = 'confirmed') = (confirmed_by is not null))
);

create index settlements_household on public.settlements (household_id, status, created_at desc);
create index settlements_to_pending on public.settlements (to_profile) where status = 'pending';
create index settlements_from on public.settlements (from_profile);

comment on table public.expenses is
  'A shared expense. Append-only: a correction voids the old row and adds a new one (replaces_id).';
comment on table public.expense_shares is
  'What each person owes towards an expense, in pence. Must sum to the expense amount.';
comment on table public.settlements is
  'A payment between two flatmates. Pending until the receiver confirms; only confirmed ones move balances.';

-- ---------------------------------------------------------------------------------------------
-- Integrity that does not depend on who is writing.

-- Everyone named in a row must be an active member of that row's flat at the time.
create or replace function private.ledger_check_people()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_people uuid[];
  v_person uuid;
begin
  if tg_table_name = 'expenses' then
    v_people := array[new.paid_by, new.created_by];
  elsif tg_table_name = 'expense_shares' then
    v_people := array[new.profile_id];
  else
    v_people := array[new.from_profile, new.to_profile];
  end if;

  foreach v_person in array v_people loop
    if not exists (
      select 1 from public.memberships
       where household_id = new.household_id and profile_id = v_person and left_at is null
    ) then
      raise exception 'not_a_member' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

create trigger expenses_people before insert on public.expenses
  for each row execute function private.ledger_check_people();
create trigger expense_shares_people before insert on public.expense_shares
  for each row execute function private.ledger_check_people();
create trigger settlements_people before insert on public.settlements
  for each row execute function private.ledger_check_people();

-- The shares of an expense add up to its amount exactly. Checked when the transaction commits, so an
-- expense and its shares can go in together.
create or replace function private.ledger_check_share_sum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense uuid;
  v_amount bigint;
  v_sum bigint;
begin
  if tg_table_name = 'expenses' then
    v_expense := new.id;
  else
    v_expense := new.expense_id;
  end if;

  select e.amount_pence, coalesce((select sum(s.share_pence) from public.expense_shares s where s.expense_id = e.id), 0)
    into v_amount, v_sum
    from public.expenses e
   where e.id = v_expense;
  if v_sum is distinct from v_amount then
    raise exception 'shares_must_add_up' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger expenses_shares_add_up after insert on public.expenses
  deferrable initially deferred for each row execute function private.ledger_check_share_sum();
create constraint trigger expense_shares_add_up after insert on public.expense_shares
  deferrable initially deferred for each row execute function private.ledger_check_share_sum();

-- Append-only. The only changes ever allowed: voiding an expense once, and deciding a pending
-- settlement once. Everything else is refused, whoever asks.
create or replace function private.ledger_guard_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.voided_at is null and new.voided_at is not null
     and (to_jsonb(new) - 'voided_at' - 'voided_by') = (to_jsonb(old) - 'voided_at' - 'voided_by') then
    return new;
  end if;
  raise exception 'ledger_is_append_only' using errcode = 'P0001';
end;
$$;

create or replace function private.ledger_guard_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'pending' and new.status <> 'pending'
     and (to_jsonb(new) - 'status' - 'decided_at' - 'confirmed_by')
       = (to_jsonb(old) - 'status' - 'decided_at' - 'confirmed_by') then
    return new;
  end if;
  raise exception 'ledger_is_append_only' using errcode = 'P0001';
end;
$$;

create or replace function private.ledger_refuse_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'ledger_is_append_only' using errcode = 'P0001';
end;
$$;

create trigger expenses_append_only before update or delete on public.expenses
  for each row execute function private.ledger_guard_expense();
create trigger settlements_append_only before update or delete on public.settlements
  for each row execute function private.ledger_guard_settlement();
create trigger expense_shares_append_only before update or delete on public.expense_shares
  for each row execute function private.ledger_refuse_change();
create trigger expenses_no_truncate before truncate on public.expenses
  for each statement execute function private.ledger_refuse_change();
create trigger expense_shares_no_truncate before truncate on public.expense_shares
  for each statement execute function private.ledger_refuse_change();
create trigger settlements_no_truncate before truncate on public.settlements
  for each statement execute function private.ledger_refuse_change();

revoke all on function private.ledger_check_people() from public, anon, authenticated;
revoke all on function private.ledger_check_share_sum() from public, anon, authenticated;
revoke all on function private.ledger_guard_expense() from public, anon, authenticated;
revoke all on function private.ledger_guard_settlement() from public, anon, authenticated;
revoke all on function private.ledger_refuse_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security: members of a flat read its books. There are no write policies and no write
-- grants, so the browser cannot change any of it; the functions in later migrations do.
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements enable row level security;

revoke all on public.expenses, public.expense_shares, public.settlements from anon, authenticated;
grant select on public.expenses, public.expense_shares, public.settlements to authenticated;

create policy expenses_select_members on public.expenses
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

create policy expense_shares_select_members on public.expense_shares
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

create policy settlements_select_members on public.settlements
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

-- ---------------------------------------------------------------------------------------------
-- Balances, derived from the rows every time. Positive means the person is owed money, negative
-- means they owe it. Voided expenses and settlements that are not confirmed do not count. Current
-- members always appear (at zero if need be); a former member appears only while money is open.
-- For any flat the balances add up to exactly zero: each expense adds its amount to the payer and
-- takes the shares from the sharers, and each settlement moves the same amount between two people.
create or replace function public.household_balances(p_household_id uuid)
returns table (profile_id uuid, balance_pence bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select authz.is_household_member(p_household_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
  with moves as (
    select e.paid_by as who, e.amount_pence as pence
      from public.expenses e
     where e.household_id = p_household_id and e.voided_at is null
    union all
    select s.profile_id, -s.share_pence
      from public.expense_shares s
      join public.expenses e on e.id = s.expense_id
     where e.household_id = p_household_id and e.voided_at is null
    union all
    select st.from_profile, st.amount_pence
      from public.settlements st
     where st.household_id = p_household_id and st.status = 'confirmed'
    union all
    select st.to_profile, -st.amount_pence
      from public.settlements st
     where st.household_id = p_household_id and st.status = 'confirmed'
    union all
    select m.profile_id, 0
      from public.memberships m
     where m.household_id = p_household_id and m.left_at is null
  ),
  totals as (
    select mv.who, sum(mv.pence)::bigint as total
      from moves mv
     group by mv.who
  )
  select t.who, t.total
    from totals t
   where t.total <> 0
      or exists (
        select 1 from public.memberships m
         where m.household_id = p_household_id and m.profile_id = t.who and m.left_at is null
      )
   order by t.who;
end;
$$;

revoke all on function public.household_balances(uuid) from public, anon;
grant execute on function public.household_balances(uuid) to authenticated;

comment on function public.household_balances(uuid) is
  'Net balance per person in a flat, in pence (positive: owed money). Members only. Always sums to zero.';
