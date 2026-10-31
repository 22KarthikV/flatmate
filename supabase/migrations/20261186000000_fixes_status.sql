-- Extras D: the fix-it log, part 2: status, chaser, hiding, and the leaver hook (SPEC-extras D).
-- Independent of every other extras tool.

-- Changes a report's status. The reporter, the chaser or an admin. Reopening a fixed report is allowed.
create or replace function public.set_fix_status(p_report uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.fix_household();
  v_caller uuid := (select authz.current_profile_id());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  f public.fix_reports;
  v_name text;
  v_label text;
  v_update uuid;
  r record;
begin
  if p_status is null or p_status not in ('open', 'in_progress', 'fixed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  select * into f from public.fix_reports
   where id = p_report and household_id = v_household and hidden_at is null for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  if v_caller not in (f.reported_by) and f.chaser_id is distinct from v_caller
     and not (select authz.is_household_admin(v_household)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if f.status = p_status then
    return;
  end if;

  update public.fix_reports
     set status = p_status, status_changed_at = now(),
         fixed_at = case when p_status = 'fixed' then now() end
   where id = f.id;

  select display_name into v_name from public.profiles where id = v_caller;
  v_label := case p_status when 'open' then 'Open' when 'in_progress' then 'In progress' else 'Fixed' end;
  v_update := private.fix_add_update(
    f.id, 'status', left(v_name || ' set it to ' || v_label || coalesce(': ' || v_note, ''), 300), v_caller
  );

  for r in
    select distinct x.pid from (values (f.reported_by), (f.chaser_id)) x(pid)
     where x.pid is not null and x.pid <> v_caller
       and exists (select 1 from public.memberships m
                    where m.household_id = v_household and m.profile_id = x.pid and m.left_at is null)
  loop
    perform private.notify(
      r.pid, v_household, 'fix_status',
      left(v_name || ' set "' || f.title || '" to ' || v_label, 80), '',
      '/more/fixes/' || f.id, 'fix_status:' || v_update
    );
  end loop;
end;
$$;

-- "I'll chase this": any member, only when nobody is chasing.
create or replace function public.take_fix_chase(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.fix_household();
  v_caller uuid := (select authz.current_profile_id());
  f public.fix_reports;
  v_name text;
begin
  select * into f from public.fix_reports
   where id = p_report and household_id = v_household and hidden_at is null for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  if f.chaser_id is not null then
    raise exception 'already_chasing' using errcode = 'P0001';
  end if;
  update public.fix_reports set chaser_id = v_caller where id = f.id;
  select display_name into v_name from public.profiles where id = v_caller;
  perform private.fix_add_update(f.id, 'chaser', v_name || ' is chasing the landlord', v_caller);
end;
$$;

-- Hands the chase to someone, or clears it (null). The current chaser, or any admin.
create or replace function public.set_fix_chaser(p_report uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.fix_household();
  v_caller uuid := (select authz.current_profile_id());
  f public.fix_reports;
  v_name text;
  v_target text;
begin
  select * into f from public.fix_reports
   where id = p_report and household_id = v_household and hidden_at is null for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  if f.chaser_id is distinct from v_caller and not (select authz.is_household_admin(v_household)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_profile is not null and not exists (
    select 1 from public.memberships m
     where m.household_id = v_household and m.profile_id = p_profile and m.left_at is null
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  update public.fix_reports set chaser_id = p_profile where id = f.id;
  select display_name into v_name from public.profiles where id = v_caller;
  if p_profile is null then
    perform private.fix_add_update(f.id, 'chaser', v_name || ' stopped the chase; nobody is chasing', v_caller);
  else
    select display_name into v_target from public.profiles where id = p_profile;
    perform private.fix_add_update(f.id, 'chaser', v_name || ' made ' || v_target || ' the person chasing', v_caller);
  end if;
end;
$$;

-- Hides a report that should not be there. Admin only; the purge removes it later.
create or replace function public.hide_fix_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.fix_household();
begin
  if not (select authz.is_household_admin(v_household)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.fix_reports set hidden_at = now()
   where id = p_report and household_id = v_household and hidden_at is null;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- When someone leaves (or deletes their account), the chase they held is cleared, a line says so,
-- and the admins are told. It cannot make leaving fail.
create or replace function private.fix_note_member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  v_update uuid;
  a record;
begin
  if new.left_reason = 'flat_closed' then
    return new;
  end if;
  begin
    for f in
      select r.id, r.title from public.fix_reports r
       where r.household_id = new.household_id and r.chaser_id = new.profile_id
         and r.hidden_at is null
         for update
    loop
      update public.fix_reports set chaser_id = null where id = f.id;
      v_update := private.fix_add_update(
        f.id, 'system', 'The person chasing this left the flat, so nobody is chasing it now.', new.profile_id
      );
      for a in
        select m.profile_id from public.memberships m
         where m.household_id = new.household_id and m.left_at is null
           and m.role in ('owner', 'admin') and m.profile_id <> new.profile_id
      loop
        perform private.notify(
          a.profile_id, new.household_id, 'fix_status',
          left('Nobody is chasing "' || f.title || '" now', 80), '',
          '/more/fixes/' || f.id, 'fix_status:' || v_update
        );
      end loop;
    end loop;
  exception when others then
    -- Leaving must always succeed.
    null;
  end;
  return new;
end;
$$;

revoke all on function private.fix_note_member_left() from public, anon, authenticated;

create trigger fix_note_member_left after update of left_at on public.memberships
  for each row when (old.left_at is null and new.left_at is not null)
  execute function private.fix_note_member_left();

revoke all on function public.set_fix_status(uuid, text, text) from public, anon;
revoke all on function public.take_fix_chase(uuid) from public, anon;
revoke all on function public.set_fix_chaser(uuid, uuid) from public, anon;
revoke all on function public.hide_fix_report(uuid) from public, anon;
grant execute on function public.set_fix_status(uuid, text, text) to authenticated;
grant execute on function public.take_fix_chase(uuid) to authenticated;
grant execute on function public.set_fix_chaser(uuid, uuid) to authenticated;
grant execute on function public.hide_fix_report(uuid) to authenticated;
