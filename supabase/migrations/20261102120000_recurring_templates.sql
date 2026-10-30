-- Recurring: creating and managing templates (SPEC-recurring R3, R4, R10 to R13, R17, R18).
--
-- Owners and admins describe a rent or a bill once, edit it, pause it, resume it, skip a month, and
-- end it. Each function derives the caller from auth.uid(), checks the rules again in the database
-- (the app has worked out each person's rent, but nothing is trusted) and writes the change log.
-- Editing a template changes future months only: instances and charges already created are never
-- touched. A rent or bill is never deleted; ending sets ended_at.
--
-- The payload is JSON so a rent can carry its rooms and people in one call:
--   bill: {kind: "bill", name, paid_by, due_day, amount_mode, amount_pence, split_mode,
--          people: [{profile_id, basis_points}], active_months}
--         an equal bill with no people means everyone in the flat when each month is created;
--   rent: {kind: "rent", name, collector_id, due_day, active_months,
--          rooms: [{name, rent_pence, people: [{profile_id, pence}]}]}
--         each person's pence is worked out by the app (room rent split by the ledger's rule, or an
--         admin's own figure) and stored as it is.

-- The caller's flat when they are an owner or admin there; otherwise "not allowed".
create or replace function private.recurring_admin_household(p_caller uuid)
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
   where m.profile_id = p_caller and m.left_at is null and m.role in ('owner', 'admin');
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_household;
end;
$$;

-- A whole number out of a JSON value, or null when it is missing or not a whole number.
create or replace function private.recurring_json_int(p_value jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'number' and p_value::text ~ '^-?[0-9]{1,15}$'
              then p_value::text::bigint end;
$$;

-- True when the person is an active member of the flat (and, if asked, an owner or admin).
create or replace function private.recurring_is_member(p_household uuid, p_profile uuid, p_admin boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.household_id = p_household and m.profile_id = p_profile and m.left_at is null
       and (not p_admin or m.role in ('owner', 'admin'))
  );
$$;

-- A template of the caller's flat, locked, or "not found" (so another flat's ids reveal nothing).
create or replace function private.recurring_lock_template(p_template uuid, p_household uuid)
returns public.recurring_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.recurring_templates;
begin
  select * into t from public.recurring_templates
   where id = p_template and household_id = p_household for update;
  if not found then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  return t;
end;
$$;

create or replace function private.recurring_log(p_template uuid, p_household uuid, p_caller uuid, p_change text, p_detail jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.recurring_template_log (template_id, household_id, changed_by, change, detail)
  values (p_template, p_household, p_caller, p_change, coalesce(p_detail, '{}'));
$$;

-- Everyone a template names must be in the flat now: the rent's people and the percentage bill's.
create or replace function private.recurring_people_ready(p_template uuid, p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.recurring_template_shares s
     where s.template_id = p_template
       and not private.recurring_is_member(p_household, s.profile_id, false)
  );
$$;

-- After a template is saved or resumed, a month that is already inside its creation window should
-- appear at once (R8). The generator migration replaces this; until then it does nothing.
create or replace function private.recurring_after_save(p_template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  null;
end;
$$;

create or replace function public.save_recurring_template(p_template_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
  v_kind text := p_payload ->> 'kind';
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_due bigint := private.recurring_json_int(p_payload -> 'due_day');
  v_months smallint[];
  v_existing public.recurring_templates;
  v_id uuid;
  v_paid_by uuid;
  v_amount_mode text;
  v_amount bigint;
  v_split text;
  v_person jsonb;
  v_room jsonb;
  v_room_id uuid;
  v_pence bigint;
  v_points bigint;
  v_seen uuid[] := '{}';
  v_pid uuid;
  v_sum bigint := 0;
begin
  if v_kind not in ('rent', 'bill') or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 50 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_due is null or v_due not between 1 and 28 then
    raise exception 'invalid_due_day' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'active_months') <> 'array' then
    raise exception 'invalid_months' using errcode = '22023';
  end if;
  v_months := array(
    select distinct m.value::smallint
      from jsonb_array_elements_text(p_payload -> 'active_months') m
     order by 1
  );
  if cardinality(v_months) = 0 or exists (select 1 from unnest(v_months) x where x not between 1 and 12) then
    raise exception 'invalid_months' using errcode = '22023';
  end if;

  if p_template_id is not null then
    v_existing := private.recurring_lock_template(p_template_id, v_household);
    if v_existing.kind <> v_kind then
      raise exception 'invalid_kind' using errcode = '22023';
    end if;
    if v_existing.ended_at is not null then
      raise exception 'template_ended' using errcode = 'P0001';
    end if;
  end if;

  if v_kind = 'bill' then
    v_paid_by := nullif(p_payload ->> 'paid_by', '')::uuid;
    v_amount_mode := p_payload ->> 'amount_mode';
    v_amount := private.recurring_json_int(p_payload -> 'amount_pence');
    v_split := p_payload ->> 'split_mode';

    if v_paid_by is null or not private.recurring_is_member(v_household, v_paid_by, false) then
      raise exception 'not_a_member' using errcode = 'P0001';
    end if;
    if v_amount_mode = 'fixed' then
      if v_amount is null or v_amount not between 1 and 1000000 then
        raise exception 'invalid_amount' using errcode = '22023';
      end if;
    elsif v_amount_mode = 'variable' then
      if v_amount is not null then
        raise exception 'invalid_amount' using errcode = '22023';
      end if;
    else
      raise exception 'invalid_amount' using errcode = '22023';
    end if;
    if v_split not in ('equal', 'percent') then
      raise exception 'invalid_split' using errcode = '22023';
    end if;
    if jsonb_typeof(p_payload -> 'people') is distinct from 'array' then
      raise exception 'invalid_shares' using errcode = '22023';
    end if;
    if v_split = 'percent' and jsonb_array_length(p_payload -> 'people') = 0 then
      raise exception 'invalid_shares' using errcode = '22023';
    end if;

    for v_person in select * from jsonb_array_elements(p_payload -> 'people') loop
      v_pid := nullif(v_person ->> 'profile_id', '')::uuid;
      if v_pid is null or not private.recurring_is_member(v_household, v_pid, false) then
        raise exception 'not_a_member' using errcode = 'P0001';
      end if;
      if v_pid = any (v_seen) then
        raise exception 'invalid_shares' using errcode = '22023';
      end if;
      v_seen := v_seen || v_pid;
      if v_split = 'percent' then
        v_points := private.recurring_json_int(v_person -> 'basis_points');
        if v_points is null or v_points not between 0 and 10000 then
          raise exception 'invalid_shares' using errcode = '22023';
        end if;
        v_sum := v_sum + v_points;
      end if;
    end loop;
    if v_split = 'percent' and v_sum <> 10000 then
      raise exception 'invalid_shares' using errcode = '22023';
    end if;
  else
    v_paid_by := nullif(p_payload ->> 'collector_id', '')::uuid;
    v_amount_mode := 'fixed';
    v_amount := null;
    v_split := 'amounts';
    if v_paid_by is null or not private.recurring_is_member(v_household, v_paid_by, true) then
      raise exception 'collector_must_be_admin' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_payload -> 'rooms') is distinct from 'array' or jsonb_array_length(p_payload -> 'rooms') = 0 then
      raise exception 'invalid_rooms' using errcode = '22023';
    end if;

    for v_room in select * from jsonb_array_elements(p_payload -> 'rooms') loop
      if char_length(btrim(coalesce(v_room ->> 'name', ''))) not between 1 and 30 then
        raise exception 'invalid_rooms' using errcode = '22023';
      end if;
      v_pence := private.recurring_json_int(v_room -> 'rent_pence');
      if v_pence is null or v_pence not between 1 and 1000000 then
        raise exception 'invalid_amount' using errcode = '22023';
      end if;
      if jsonb_typeof(v_room -> 'people') is distinct from 'array' or jsonb_array_length(v_room -> 'people') = 0 then
        raise exception 'invalid_rooms' using errcode = '22023';
      end if;
      for v_person in select * from jsonb_array_elements(v_room -> 'people') loop
        v_pid := nullif(v_person ->> 'profile_id', '')::uuid;
        if v_pid is null or not private.recurring_is_member(v_household, v_pid, false) then
          raise exception 'not_a_member' using errcode = 'P0001';
        end if;
        if v_pid = any (v_seen) then
          raise exception 'invalid_rooms' using errcode = '22023';
        end if;
        v_seen := v_seen || v_pid;
        v_points := private.recurring_json_int(v_person -> 'pence');
        if v_points is null or v_points not between 1 and 1000000 then
          raise exception 'invalid_amount' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;

  if p_template_id is null then
    insert into public.recurring_templates
      (household_id, kind, name, paid_by, due_day, amount_mode, amount_pence, split_mode, active_months, created_by)
    values
      (v_household, v_kind, v_name, v_paid_by, v_due, v_amount_mode, v_amount, v_split, v_months, v_caller)
    returning id into v_id;
  else
    v_id := p_template_id;
    update public.recurring_templates
       set name = v_name, paid_by = v_paid_by, due_day = v_due, amount_mode = v_amount_mode,
           amount_pence = v_amount, split_mode = v_split, active_months = v_months
     where id = v_id;
    delete from public.recurring_template_shares where template_id = v_id;
    delete from public.recurring_rooms where template_id = v_id;
  end if;

  if v_kind = 'bill' then
    for v_person in select * from jsonb_array_elements(p_payload -> 'people') loop
      insert into public.recurring_template_shares (template_id, household_id, profile_id, share_value)
      values (v_id, v_household, (v_person ->> 'profile_id')::uuid,
              case when v_split = 'percent' then private.recurring_json_int(v_person -> 'basis_points') end);
    end loop;
  else
    for v_room in select * from jsonb_array_elements(p_payload -> 'rooms') loop
      insert into public.recurring_rooms (template_id, household_id, name, rent_pence)
      values (v_id, v_household, btrim(v_room ->> 'name'), private.recurring_json_int(v_room -> 'rent_pence'))
      returning id into v_room_id;
      for v_person in select * from jsonb_array_elements(v_room -> 'people') loop
        insert into public.recurring_template_shares (template_id, household_id, profile_id, share_value, room_id)
        values (v_id, v_household, (v_person ->> 'profile_id')::uuid,
                private.recurring_json_int(v_person -> 'pence'), v_room_id);
      end loop;
    end loop;
  end if;

  perform private.recurring_log(v_id, v_household, v_caller,
    case when p_template_id is null then 'created' else 'edited' end,
    jsonb_build_object('name', v_name));
  perform private.recurring_after_save(v_id);
  return v_id;
end;
$$;

create or replace function public.pause_recurring_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
  t public.recurring_templates := private.recurring_lock_template(p_template_id, v_household);
begin
  if t.ended_at is not null then
    raise exception 'template_ended' using errcode = 'P0001';
  end if;
  if t.paused_at is not null then
    raise exception 'already_paused' using errcode = 'P0001';
  end if;
  update public.recurring_templates set paused_at = now(), paused_reason = 'admin' where id = t.id;
  perform private.recurring_log(t.id, v_household, v_caller, 'paused', '{}');
end;
$$;

-- Resuming needs the template to be workable again: its collector or payer is an active member (an
-- admin, for rent) and everyone it names is still in the flat. An admin fixes that by editing first.
create or replace function public.resume_recurring_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
  t public.recurring_templates := private.recurring_lock_template(p_template_id, v_household);
begin
  if t.ended_at is not null then
    raise exception 'template_ended' using errcode = 'P0001';
  end if;
  if t.paused_at is null then
    raise exception 'not_paused' using errcode = 'P0001';
  end if;
  if not private.recurring_is_member(v_household, t.paid_by, t.kind = 'rent')
     or (t.split_mode <> 'equal' and not private.recurring_people_ready(t.id, v_household)) then
    raise exception 'cannot_resume' using errcode = 'P0001';
  end if;
  update public.recurring_templates set paused_at = null, paused_reason = null where id = t.id;
  perform private.recurring_log(t.id, v_household, v_caller, 'resumed', '{}');
  perform private.recurring_after_save(t.id);
end;
$$;

-- Records one upcoming month as skipped, so the history says it was skipped on purpose and the
-- generator leaves it alone. Only a month that has not been created and is not yet past due.
create or replace function public.skip_recurring_month(p_template_id uuid, p_period date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
  t public.recurring_templates := private.recurring_lock_template(p_template_id, v_household);
  v_due date;
begin
  if p_period is null or extract(day from p_period) <> 1 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if t.ended_at is not null then
    raise exception 'template_ended' using errcode = 'P0001';
  end if;
  v_due := p_period + (t.due_day - 1);
  if v_due < private.ledger_today() then
    raise exception 'month_passed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.recurring_instances i where i.template_id = t.id and i.period = p_period) then
    raise exception 'already_created' using errcode = 'P0001';
  end if;

  insert into public.recurring_instances (template_id, household_id, period, due_on, status)
  values (t.id, v_household, p_period, v_due, 'skipped');
  perform private.recurring_log(t.id, v_household, v_caller, 'skipped',
    jsonb_build_object('period', to_char(p_period, 'YYYY-MM')));
end;
$$;

create or replace function public.end_recurring_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select authz.current_profile_id());
  v_household uuid := private.recurring_admin_household(v_caller);
  t public.recurring_templates := private.recurring_lock_template(p_template_id, v_household);
begin
  if t.ended_at is not null then
    raise exception 'already_ended' using errcode = 'P0001';
  end if;
  update public.recurring_templates set ended_at = now() where id = t.id;
  perform private.recurring_log(t.id, v_household, v_caller, 'ended', '{}');
end;
$$;

revoke all on function private.recurring_admin_household(uuid) from public, anon, authenticated;
revoke all on function private.recurring_json_int(jsonb) from public, anon, authenticated;
revoke all on function private.recurring_is_member(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.recurring_lock_template(uuid, uuid) from public, anon, authenticated;
revoke all on function private.recurring_log(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.recurring_people_ready(uuid, uuid) from public, anon, authenticated;
revoke all on function private.recurring_after_save(uuid) from public, anon, authenticated;

revoke all on function public.save_recurring_template(uuid, jsonb) from public, anon;
revoke all on function public.pause_recurring_template(uuid) from public, anon;
revoke all on function public.resume_recurring_template(uuid) from public, anon;
revoke all on function public.skip_recurring_month(uuid, date) from public, anon;
revoke all on function public.end_recurring_template(uuid) from public, anon;
grant execute on function public.save_recurring_template(uuid, jsonb) to authenticated;
grant execute on function public.pause_recurring_template(uuid) to authenticated;
grant execute on function public.resume_recurring_template(uuid) to authenticated;
grant execute on function public.skip_recurring_month(uuid, date) to authenticated;
grant execute on function public.end_recurring_template(uuid) to authenticated;

comment on function public.save_recurring_template(uuid, jsonb) is
  'Owner or admin: create a rent or bill template (null id) or edit one. Edits affect future months only.';
