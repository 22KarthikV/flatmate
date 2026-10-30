-- Recurring: rent and monthly bills, the data model (SPEC-recurring R1 to R6, R9, R14, R16, R18, R21).
--
-- A template describes a rent or a bill once; an instance is one month of it. Bills become ordinary
-- ledger expenses (a later migration calls the ledger's own writer). Rent is private: it never goes
-- near the shared ledger and lives in its own charges and payments, which only the person it
-- concerns, the collector and admins can read. That rule is enforced here, by row-level security,
-- not by the screens. Nobody writes these tables directly; later migrations add the functions that
-- do. Money is whole pence, and generated rows are append-only.

-- ---------------------------------------------------------------------------------------------
-- Notification types for this module, each with fixed, generic push text: an amount must never
-- reach a lock screen (the same rule as the ledger). The inbox row keeps the detail.
--   rent_charged         your rent was created                         (you)
--   recurring_posted     a bill was created with a share for you
--   recurring_reminder   your rent is still unpaid                     (snoozable; rent only)
--   bill_amount_needed   the payer of a variable bill: enter this month's amount (also its reminders)
--   rent_payment_pending someone says they paid their rent             (collector and admins)
--   rent_payment_decided your rent payment was confirmed or not        (the payer)
--   recurring_attention  something needs an admin                      (admins, inbox only)
insert into public.notification_types (type, default_in_app, default_push, snoozable) values
  ('rent_charged', true, true, false),
  ('recurring_posted', true, true, false),
  ('recurring_reminder', true, true, true),
  ('bill_amount_needed', true, true, false),
  ('rent_payment_pending', true, true, false),
  ('rent_payment_decided', true, true, false),
  ('recurring_attention', true, false, false);

update public.notification_types set push_title = 'Your rent has been created',
  push_body = 'Open FlatMate to see what is due.' where type = 'rent_charged';
update public.notification_types set push_title = 'A bill has been created',
  push_body = 'Open FlatMate to see your share.' where type = 'recurring_posted';
update public.notification_types set push_title = 'A reminder about the flat',
  push_body = 'Open FlatMate to see what is due.' where type = 'recurring_reminder';
update public.notification_types set push_title = 'A bill needs its amount',
  push_body = 'Open FlatMate to enter it.' where type = 'bill_amount_needed';
update public.notification_types set push_title = 'A rent payment needs confirming',
  push_body = 'Open FlatMate to confirm it.' where type = 'rent_payment_pending';
update public.notification_types set push_title = 'Your rent payment was reviewed',
  push_body = 'Open FlatMate to see the result.' where type = 'rent_payment_decided';
update public.notification_types set push_title = 'Something needs a look in the flat',
  push_body = 'Open FlatMate to see what.' where type = 'recurring_attention';

-- ---------------------------------------------------------------------------------------------
-- Tables.
create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  kind text not null check (kind in ('rent', 'bill')),
  name text not null check (char_length(name) between 1 and 50),
  -- Rent: the collector, who must be an owner or admin. Bill: who pays the supplier.
  paid_by uuid not null references public.profiles (id),
  due_day smallint not null check (due_day between 1 and 28),
  amount_mode text not null check (amount_mode in ('fixed', 'variable')),
  amount_pence bigint check (amount_pence between 1 and 1000000),
  split_mode text not null check (split_mode in ('equal', 'percent', 'amounts')),
  active_months smallint[] not null default '{1,2,3,4,5,6,7,8,9,10,11,12}'
    check (cardinality(active_months) >= 1 and active_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  paused_at timestamptz,
  paused_reason text check (paused_reason in ('admin', 'member_left', 'payer_left')),
  ended_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((paused_at is null) = (paused_reason is null)),
  -- Rent is always fixed, split by amounts, with its money in the shares and rooms, not on the row.
  check (kind <> 'rent' or (amount_mode = 'fixed' and split_mode = 'amounts' and amount_pence is null)),
  -- A bill is fixed (with an amount) or variable (without one), split equally or by percentage.
  check (kind <> 'bill' or (split_mode in ('equal', 'percent') and ((amount_mode = 'fixed') = (amount_pence is not null))))
);

create index recurring_templates_household on public.recurring_templates (household_id, kind);

create trigger set_updated_at before update on public.recurring_templates
  for each row execute function public.set_updated_at();

-- Rent only: the rooms. A room's rent is split equally between its occupants.
create table public.recurring_rooms (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.recurring_templates (id),
  household_id uuid not null references public.households (id),
  name text not null check (char_length(name) between 1 and 30),
  rent_pence bigint not null check (rent_pence between 1 and 1000000)
);

create index recurring_rooms_template on public.recurring_rooms (template_id);

-- share_value is pence for rent ('amounts'), hundredths of a percent for 'percent' bills, and null
-- for 'equal' bills (the rows then say who is included; no rows means everyone in the flat).
create table public.recurring_template_shares (
  template_id uuid not null references public.recurring_templates (id),
  household_id uuid not null references public.households (id),
  profile_id uuid not null references public.profiles (id),
  share_value bigint check (share_value >= 0),
  room_id uuid references public.recurring_rooms (id),
  primary key (template_id, profile_id)
);

create table public.recurring_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.recurring_templates (id),
  household_id uuid not null references public.households (id),
  -- The first day of the due month. One instance per template per month, ever.
  period date not null check (extract(day from period) = 1),
  due_on date not null,
  status text not null check (status in ('awaiting_amount', 'posted', 'skipped')),
  -- Bills only, set when posted. A rent instance never has one.
  expense_id uuid references public.expenses (id),
  created_at timestamptz not null default now(),
  unique (template_id, period),
  check ((status = 'posted') or expense_id is null)
);

create index recurring_instances_household on public.recurring_instances (household_id, period desc);

-- The private rent ledger: one charge per person per month, append-only. No amount lives on the
-- instance, so seeing that a month exists reveals nothing about anyone's rent.
create table public.rent_charges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  template_id uuid not null references public.recurring_templates (id),
  instance_id uuid not null references public.recurring_instances (id),
  period date not null check (extract(day from period) = 1),
  profile_id uuid not null references public.profiles (id),
  collector_id uuid not null references public.profiles (id),
  amount_pence bigint not null check (amount_pence between 1 and 1000000),
  due_on date not null,
  room_name text,
  created_at timestamptz not null default now(),
  unique (template_id, period, profile_id)
);

create index rent_charges_household on public.rent_charges (household_id, period desc);
create index rent_charges_person on public.rent_charges (profile_id, period desc);

-- Rent payments, kept apart from the ledger's settlements. A payment is pending until the collector
-- (or another admin) decides it; a waiver is an admin's entry that is confirmed at once.
create table public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  template_id uuid not null references public.recurring_templates (id),
  payer_id uuid not null references public.profiles (id),
  collector_id uuid not null references public.profiles (id),
  kind text not null default 'payment' check (kind in ('payment', 'waiver')),
  amount_pence bigint not null check (amount_pence between 1 and 1000000),
  status text not null check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  reason text check (char_length(reason) <= 200),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null)),
  check ((decided_at is null) = (decided_by is null)),
  check ((voided_at is null) = (voided_by is null)),
  check (voided_at is null or status = 'confirmed'),
  check (kind <> 'waiver' or (status = 'confirmed' and reason is not null and char_length(btrim(reason)) >= 1))
);

create index rent_payments_household on public.rent_payments (household_id, created_at desc);
create index rent_payments_payer on public.rent_payments (payer_id, created_at desc);

create table public.recurring_template_log (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.recurring_templates (id),
  household_id uuid not null references public.households (id),
  changed_by uuid not null references public.profiles (id),
  change text not null check (char_length(change) between 1 and 40),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index recurring_template_log_template on public.recurring_template_log (template_id, created_at desc);

comment on table public.recurring_templates is
  'A rent or a monthly bill, described once. Editable by admins through functions; changes affect future months only.';
comment on table public.recurring_instances is
  'One month of a template. Append-only apart from awaiting amount becoming posted, once.';
comment on table public.rent_charges is
  'Private rent: one row per person per month. Readable by that person, the collector and admins only.';
comment on table public.rent_payments is
  'Private rent payments, separate from the ledger. Readable by the payer, the collector and admins only.';

-- ---------------------------------------------------------------------------------------------
-- Append-only. Generated rows are never rewritten or deleted; the only changes ever allowed are
-- the ones named here, whoever asks.
create or replace function private.recurring_refuse_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'recurring_is_append_only' using errcode = 'P0001';
end;
$$;

create or replace function private.recurring_guard_instance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'awaiting_amount' and new.status = 'posted' and new.expense_id is not null
     and (to_jsonb(new) - 'status' - 'expense_id') = (to_jsonb(old) - 'status' - 'expense_id') then
    return new;
  end if;
  raise exception 'recurring_is_append_only' using errcode = 'P0001';
end;
$$;

-- A payment changes at most twice in its life: one decision while pending, one void once confirmed.
create or replace function private.recurring_guard_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status <> 'pending'
       and (to_jsonb(new) - 'status' - 'decided_at' - 'decided_by')
         = (to_jsonb(old) - 'status' - 'decided_at' - 'decided_by') then
      return new;
    end if;
    if old.status = 'confirmed' and old.voided_at is null and new.voided_at is not null
       and (to_jsonb(new) - 'voided_at' - 'voided_by') = (to_jsonb(old) - 'voided_at' - 'voided_by') then
      return new;
    end if;
  end if;
  raise exception 'recurring_is_append_only' using errcode = 'P0001';
end;
$$;

-- Templates can be edited and paused by the functions, never deleted, and never moved to another
-- flat, another kind or another creator.
create or replace function private.recurring_guard_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.id = old.id and new.household_id = old.household_id and new.kind = old.kind
     and new.created_by = old.created_by and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'recurring_is_append_only' using errcode = 'P0001';
end;
$$;

create trigger recurring_templates_guard before update or delete on public.recurring_templates
  for each row execute function private.recurring_guard_template();
create trigger recurring_instances_guard before update or delete on public.recurring_instances
  for each row execute function private.recurring_guard_instance();
create trigger rent_payments_guard before update or delete on public.rent_payments
  for each row execute function private.recurring_guard_payment();
create trigger rent_charges_append_only before update or delete on public.rent_charges
  for each row execute function private.recurring_refuse_change();
create trigger recurring_template_log_append_only before update or delete on public.recurring_template_log
  for each row execute function private.recurring_refuse_change();

create trigger recurring_templates_no_truncate before truncate on public.recurring_templates
  for each statement execute function private.recurring_refuse_change();
create trigger recurring_rooms_no_truncate before truncate on public.recurring_rooms
  for each statement execute function private.recurring_refuse_change();
create trigger recurring_template_shares_no_truncate before truncate on public.recurring_template_shares
  for each statement execute function private.recurring_refuse_change();
create trigger recurring_instances_no_truncate before truncate on public.recurring_instances
  for each statement execute function private.recurring_refuse_change();
create trigger rent_charges_no_truncate before truncate on public.rent_charges
  for each statement execute function private.recurring_refuse_change();
create trigger rent_payments_no_truncate before truncate on public.rent_payments
  for each statement execute function private.recurring_refuse_change();
create trigger recurring_template_log_no_truncate before truncate on public.recurring_template_log
  for each statement execute function private.recurring_refuse_change();

revoke all on function private.recurring_refuse_change() from public, anon, authenticated;
revoke all on function private.recurring_guard_instance() from public, anon, authenticated;
revoke all on function private.recurring_guard_payment() from public, anon, authenticated;
revoke all on function private.recurring_guard_template() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security, including the rent privacy rule (R21). Nobody writes: no write policies and
-- no write grants. Who can read:
--   bill templates, their shares and change log, and every instance: everyone in the flat;
--   rent templates, rooms, shares and change log: owners and admins only (the collector is one);
--   rent charges and rent payments: owners and admins, and the person each row is about.
alter table public.recurring_templates enable row level security;
alter table public.recurring_rooms enable row level security;
alter table public.recurring_template_shares enable row level security;
alter table public.recurring_instances enable row level security;
alter table public.rent_charges enable row level security;
alter table public.rent_payments enable row level security;
alter table public.recurring_template_log enable row level security;

revoke all on public.recurring_templates, public.recurring_rooms, public.recurring_template_shares,
  public.recurring_instances, public.rent_charges, public.rent_payments, public.recurring_template_log
  from anon, authenticated;
grant select on public.recurring_templates, public.recurring_rooms, public.recurring_template_shares,
  public.recurring_instances, public.rent_charges, public.rent_payments, public.recurring_template_log
  to authenticated;

create policy recurring_templates_select on public.recurring_templates
  for select to authenticated
  using (
    (select authz.is_household_admin(household_id))
    or (kind = 'bill' and (select authz.is_household_member(household_id)))
  );

create policy recurring_rooms_select on public.recurring_rooms
  for select to authenticated
  using ((select authz.is_household_admin(household_id)));

-- Shares and the change log follow their template: visible exactly when the template is.
create policy recurring_template_shares_select on public.recurring_template_shares
  for select to authenticated
  using (exists (select 1 from public.recurring_templates t where t.id = template_id));

create policy recurring_template_log_select on public.recurring_template_log
  for select to authenticated
  using (exists (select 1 from public.recurring_templates t where t.id = template_id));

create policy recurring_instances_select on public.recurring_instances
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

create policy rent_charges_select on public.rent_charges
  for select to authenticated
  using (
    (select authz.is_household_admin(household_id))
    or (profile_id = (select authz.current_profile_id()) and (select authz.is_household_member(household_id)))
  );

create policy rent_payments_select on public.rent_payments
  for select to authenticated
  using (
    (select authz.is_household_admin(household_id))
    or (payer_id = (select authz.current_profile_id()) and (select authz.is_household_member(household_id)))
  );

-- ---------------------------------------------------------------------------------------------
-- The bill split, in SQL (R6). The monthly job runs with nobody present, so it cannot ask the app
-- to split a bill; this is the same rule written once more: each person gets their rounded-down
-- share, and the pence left over go one at a time to whoever lost most to rounding, ties to the
-- lowest profile id. A test holds it to the same vectors as the TypeScript splitExpense.
-- Everyone is returned (0 for anyone who rounds away), sorted by profile id. p_basis_points is
-- hundredths of a percent and must add up to 10000 for 'percent'; it is ignored for 'equal'.
create or replace function private.recurring_split_bill(
  p_amount_pence bigint,
  p_mode text,
  p_profile_ids uuid[],
  p_basis_points integer[] default null
)
returns table (profile_id uuid, pence bigint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_weights integer[];
  v_total bigint;
begin
  if p_amount_pence is null or p_amount_pence not between 1 and 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_profile_ids), 0) = 0
     or array_position(p_profile_ids, null) is not null
     or (select count(distinct x) from unnest(p_profile_ids) x) <> cardinality(p_profile_ids) then
    raise exception 'invalid_shares' using errcode = '22023';
  end if;

  if p_mode = 'equal' then
    v_weights := array_fill(1, array[cardinality(p_profile_ids)]);
  elsif p_mode = 'percent' then
    if p_basis_points is null or cardinality(p_basis_points) <> cardinality(p_profile_ids)
       or array_position(p_basis_points, null) is not null
       or exists (select 1 from unnest(p_basis_points) b where b < 0 or b > 10000)
       or (select sum(b) from unnest(p_basis_points) b) <> 10000 then
      raise exception 'invalid_shares' using errcode = '22023';
    end if;
    v_weights := p_basis_points;
  else
    raise exception 'invalid_split' using errcode = '22023';
  end if;

  select sum(w) into v_total from unnest(v_weights) w;

  return query
  with parts as (
    select t.pid,
           (p_amount_pence * t.w) / v_total as base,
           (p_amount_pence * t.w) % v_total as remainder
      from unnest(p_profile_ids, v_weights) as t(pid, w)
  ),
  ranked as (
    select pt.pid, pt.base,
           row_number() over (order by pt.remainder desc, pt.pid asc) as place,
           p_amount_pence - sum(pt.base) over () as leftover
      from parts pt
  )
  select r.pid, (r.base + case when r.place <= r.leftover then 1 else 0 end)::bigint
    from ranked r
   order by r.pid;
end;
$$;

revoke all on function private.recurring_split_bill(bigint, text, uuid[], integer[]) from public, anon, authenticated;
