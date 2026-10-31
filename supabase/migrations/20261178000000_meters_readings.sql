-- Extras C: meter readings, part 2: recording and cancelling readings (SPEC-extras C).
-- Independent of every other extras tool. No notifications and no money anywhere.

-- Records a reading. Any member of the meter's flat. The date is not in the future and within the
-- last year; one live reading per meter per day; a reading is not lower than the one before it by
-- date nor higher than the one after it, unless it is marked as a reset (new or rolled-over meter).
create or replace function public.record_meter_reading(
  p_meter uuid,
  p_read_on date,
  p_value numeric,
  p_note text default null,
  p_is_reset boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reset boolean := coalesce(p_is_reset, false);
  v_previous public.meter_readings;
  v_next public.meter_readings;
  v_id uuid;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform 1 from public.meters mt
   where mt.id = p_meter and mt.household_id = v_household and mt.archived_at is null for update;
  if not found then
    raise exception 'meter_not_found' using errcode = 'P0001';
  end if;

  if p_read_on is null or p_read_on > v_today or p_read_on < v_today - 365 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_value is null or p_value < 0 or p_value > 9999999.999 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 100 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  if exists (select 1 from public.meter_readings r
              where r.meter_id = p_meter and r.read_on = p_read_on and r.voided_at is null) then
    raise exception 'already_recorded' using errcode = 'P0001';
  end if;

  if not v_reset then
    select * into v_previous from public.meter_readings r
     where r.meter_id = p_meter and r.voided_at is null and r.read_on < p_read_on
     order by r.read_on desc limit 1;
    if found and p_value < v_previous.value then
      raise exception 'lower_than_previous' using errcode = 'P0001';
    end if;

    select * into v_next from public.meter_readings r
     where r.meter_id = p_meter and r.voided_at is null and r.read_on > p_read_on
     order by r.read_on asc limit 1;
    if found and not v_next.is_reset and p_value > v_next.value then
      raise exception 'higher_than_later' using errcode = 'P0001';
    end if;
  end if;

  insert into public.meter_readings (household_id, meter_id, read_on, value, is_reset, note, recorded_by)
  values (v_household, p_meter, p_read_on, p_value, v_reset, v_note, v_caller)
  returning id into v_id;
  return v_id;
end;
$$;

-- Cancels a reading (it is never deleted). The person who recorded it, or any admin.
create or replace function public.void_meter_reading(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid;
  r public.meter_readings;
begin
  select m.household_id into v_household
    from public.memberships m
   where m.profile_id = v_caller and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into r from public.meter_readings
   where id = p_id and household_id = v_household and voided_at is null for update;
  if not found then
    raise exception 'reading_not_found' using errcode = 'P0001';
  end if;
  if r.recorded_by <> v_caller and not (select authz.is_household_admin(v_household)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.meter_readings set voided_at = now(), voided_by = v_caller where id = r.id;
end;
$$;

revoke all on function public.record_meter_reading(uuid, date, numeric, text, boolean) from public, anon;
revoke all on function public.void_meter_reading(uuid) from public, anon;
grant execute on function public.record_meter_reading(uuid, date, numeric, text, boolean) to authenticated;
grant execute on function public.void_meter_reading(uuid) to authenticated;
