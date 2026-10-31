-- Extras C: meter readings, part 1 (SPEC-extras C). Independent of every other extras tool.
--
-- A quiet log of the flat's gas, electricity and water readings. No money, no photos, no
-- notifications. An admin adds each meter once; anyone records readings (next migration). Readings
-- are append-only: a mistake is cancelled and re-entered. Nobody writes a table directly.

create table public.meters (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  kind text not null check (kind in ('electricity', 'gas', 'water')),
  label text check (label is null or char_length(label) between 1 and 30),
  unit text not null check (unit in ('kWh', 'm3')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint meters_id_household unique (id, household_id)
);
create index meters_flat on public.meters (household_id) where archived_at is null;

create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  meter_id uuid not null,
  read_on date not null,
  value numeric(12, 3) not null check (value >= 0),
  -- True for a new or rolled-over meter: usage is not worked out across this reading.
  is_reset boolean not null default false,
  note text check (note is null or char_length(note) between 1 and 100),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  foreign key (meter_id, household_id) references public.meters (id, household_id),
  check ((voided_at is null) = (voided_by is null))
);
create unique index meter_readings_one_a_day on public.meter_readings (meter_id, read_on)
  where voided_at is null;
create index meter_readings_meter on public.meter_readings (meter_id, read_on desc);

comment on table public.meters is 'A meter the flat reads: gas, electricity or water. Added by an admin.';
comment on table public.meter_readings is
  'One reading of a meter. Append-only: the only change allowed is cancelling it once.';

-- Readings cannot be edited or deleted; the one allowed change is cancelling (voided_at/voided_by).
create or replace function private.meter_refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.voided_at is null and new.voided_at is not null
     and (new.id, new.household_id, new.meter_id, new.read_on, new.value, new.is_reset, new.note,
          new.recorded_by, new.created_at)
         is not distinct from
         (old.id, old.household_id, old.meter_id, old.read_on, old.value, old.is_reset, old.note,
          old.recorded_by, old.created_at) then
    return new;
  end if;
  raise exception 'meter_readings_are_permanent' using errcode = '42501';
end;
$$;

revoke all on function private.meter_refuse_change() from public, anon, authenticated;

create trigger meter_readings_refuse_change
  before update or delete on public.meter_readings
  for each row execute function private.meter_refuse_change();

alter table public.meters enable row level security;
alter table public.meter_readings enable row level security;
revoke all on public.meters, public.meter_readings from anon, authenticated;
grant select on public.meters, public.meter_readings to authenticated;

create policy meters_select_members on public.meters
  for select to authenticated
  using ((select authz.is_household_member(household_id)));
create policy meter_readings_select_members on public.meter_readings
  for select to authenticated
  using ((select authz.is_household_member(household_id)));

-- The flat of an owner or admin, or an error.
create or replace function private.meters_admin_household()
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
   where m.profile_id = (select authz.current_profile_id())
     and m.left_at is null
     and m.role in ('owner', 'admin');
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_household;
end;
$$;

revoke all on function private.meters_admin_household() from public, anon, authenticated;

-- Adds a meter, or changes one (p_id). Admin only. Electricity is kWh; gas and water may be kWh or
-- m3. Once a meter has readings only its label can change. Cap 10 active meters.
create or replace function public.save_meter(
  p_id uuid,
  p_kind text,
  p_label text,
  p_unit text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.meters_admin_household();
  v_caller uuid := (select authz.current_profile_id());
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_id uuid := p_id;
  m public.meters;
begin
  if p_kind is null or p_kind not in ('electricity', 'gas', 'water') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_unit is null or p_unit not in ('kWh', 'm3') or (p_kind = 'electricity' and p_unit <> 'kWh') then
    raise exception 'invalid_unit' using errcode = '22023';
  end if;
  if v_label is not null and char_length(v_label) > 30 then
    raise exception 'invalid_label' using errcode = '22023';
  end if;

  if v_id is null then
    if (select count(*) from public.meters x
         where x.household_id = v_household and x.archived_at is null) >= 10 then
      raise exception 'too_many_meters' using errcode = 'P0001';
    end if;
    insert into public.meters (household_id, kind, label, unit, created_by)
    values (v_household, p_kind, v_label, p_unit, v_caller)
    returning id into v_id;
  else
    select * into m from public.meters
     where id = v_id and household_id = v_household and archived_at is null for update;
    if not found then
      raise exception 'meter_not_found' using errcode = 'P0001';
    end if;
    if (m.kind <> p_kind or m.unit <> p_unit)
       and exists (select 1 from public.meter_readings r where r.meter_id = m.id) then
      raise exception 'meter_has_readings' using errcode = 'P0001';
    end if;
    update public.meters set kind = p_kind, unit = p_unit, label = v_label where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Archives a meter. Admin only; its readings stay readable.
create or replace function public.archive_meter(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.meters_admin_household();
begin
  update public.meters set archived_at = now()
   where id = p_id and household_id = v_household and archived_at is null;
  if not found then
    raise exception 'meter_not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.save_meter(uuid, text, text, text) from public, anon;
revoke all on function public.archive_meter(uuid) from public, anon;
grant execute on function public.save_meter(uuid, text, text, text) to authenticated;
grant execute on function public.archive_meter(uuid) to authenticated;
