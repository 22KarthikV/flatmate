-- Extras E: the noticeboard (SPEC-extras E). Independent of every other extras tool.
--
-- Short notes for the flat. A normal post expires by itself; an admin can pin up to three, and a
-- pinned post stays (this is also where house rules live). The row-level security policy itself hides
-- deleted and expired posts, so even a buggy screen cannot show them. Nobody writes a table directly.

create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now(),
  -- Pinned posts do not expire.
  pinned_at timestamptz,
  pinned_by uuid references public.profiles (id),
  expires_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  check ((pinned_at is null) = (pinned_by is null)),
  check ((deleted_at is null) = (deleted_by is null)),
  -- Nothing stays up for ever unless an admin pinned it.
  check (pinned_at is not null or expires_at is not null)
);
create index board_posts_flat on public.board_posts (household_id, pinned_at, created_at desc)
  where deleted_at is null;
create index board_posts_purge on public.board_posts (expires_at) where pinned_at is null;
create index board_posts_author_day on public.board_posts (author_id, created_at);

comment on table public.board_posts is
  'Short notes to a flat. Written only by the board functions; members see only live (not deleted, not expired) rows.';

alter table public.board_posts enable row level security;
revoke all on public.board_posts from anon, authenticated;
grant select on public.board_posts to authenticated;

create policy board_posts_select_live on public.board_posts
  for select to authenticated
  using (
    (select authz.is_household_member(household_id))
    and deleted_at is null
    and (pinned_at is not null or expires_at > now())
  );

insert into public.notification_types (type, default_in_app, default_push, snoozable)
values ('board_posted', true, false, false);
update public.notification_types
   set push_title = 'New note',
       push_body = 'A flatmate posted a note on the noticeboard.'
 where type = 'board_posted';

-- The caller's flat, or an error.
create or replace function private.board_household()
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
   where m.profile_id = (select authz.current_profile_id()) and m.left_at is null;
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_household;
end;
$$;

revoke all on function private.board_household() from public, anon, authenticated;

-- Posts a note. Expiry is 1, 3, 7 or 30 days (ignored when pinning). Pinning needs an admin.
create or replace function public.post_to_board(
  p_body text,
  p_expires_in_days integer default 7,
  p_pin boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.board_household();
  v_caller uuid := (select authz.current_profile_id());
  v_body text := btrim(coalesce(p_body, ''));
  v_pin boolean := coalesce(p_pin, false);
  v_id uuid;
  v_name text;
  r record;
begin
  if char_length(v_body) not between 1 and 280 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if v_pin and not (select authz.is_household_admin(v_household)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not v_pin and (p_expires_in_days is null or p_expires_in_days not in (1, 3, 7, 30)) then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('board:' || v_household::text, 0));

  if (select count(*) from public.board_posts p
       where p.author_id = v_caller
         and (p.created_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date) >= 5 then
    raise exception 'posting_too_fast' using errcode = 'P0001';
  end if;
  if v_pin and (select count(*) from public.board_posts p
                 where p.household_id = v_household and p.pinned_at is not null and p.deleted_at is null) >= 3 then
    raise exception 'too_many_pinned' using errcode = 'P0001';
  end if;

  insert into public.board_posts (household_id, author_id, body, pinned_at, pinned_by, expires_at)
  values (
    v_household, v_caller, v_body,
    case when v_pin then now() end, case when v_pin then v_caller end,
    case when v_pin then null else now() + make_interval(days => p_expires_in_days) end
  )
  returning id into v_id;

  select display_name into v_name from public.profiles where id = v_caller;
  for r in
    select m.profile_id from public.memberships m
     where m.household_id = v_household and m.left_at is null and m.profile_id <> v_caller
  loop
    perform private.notify(
      r.profile_id, v_household, 'board_posted',
      left(v_name || ' posted on the noticeboard', 80), '',
      '/more/board', 'board:' || v_id
    );
  end loop;

  return v_id;
end;
$$;

-- Pins or unpins a post. Admin only; at most 3 pinned. Unpinning gives it a 7 day expiry.
create or replace function public.pin_board_post(p_post uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.board_household();
  v_caller uuid := (select authz.current_profile_id());
  b public.board_posts;
begin
  if not (select authz.is_household_admin(v_household)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('board:' || v_household::text, 0));

  select * into b from public.board_posts
   where id = p_post and household_id = v_household and deleted_at is null
     and (pinned_at is not null or expires_at > now()) for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;

  if coalesce(p_pinned, false) then
    if b.pinned_at is not null then
      return;
    end if;
    if (select count(*) from public.board_posts p
         where p.household_id = v_household and p.pinned_at is not null and p.deleted_at is null) >= 3 then
      raise exception 'too_many_pinned' using errcode = 'P0001';
    end if;
    update public.board_posts set pinned_at = now(), pinned_by = v_caller where id = b.id;
  elsif b.pinned_at is not null then
    update public.board_posts
       set pinned_at = null, pinned_by = null, expires_at = now() + interval '7 days'
     where id = b.id;
  end if;
end;
$$;

-- Removes a post: its author, or any admin. It disappears at once and is wiped after 30 days.
create or replace function public.delete_board_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.board_household();
  v_caller uuid := (select authz.current_profile_id());
  b public.board_posts;
begin
  select * into b from public.board_posts
   where id = p_post and household_id = v_household and deleted_at is null
     and (pinned_at is not null or expires_at > now()) for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if b.author_id <> v_caller and not (select authz.is_household_admin(v_household)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.board_posts set deleted_at = now(), deleted_by = v_caller where id = b.id;
end;
$$;

-- Deleting an account removes the person's posts.
create or replace function private.board_note_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.board_posts where author_id = new.id;
  return new;
end;
$$;

revoke all on function private.board_note_profile_deleted() from public, anon, authenticated;

create trigger board_profile_deleted
  after update of deleted_at on public.profiles
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.board_note_profile_deleted();

revoke all on function public.post_to_board(text, integer, boolean) from public, anon;
revoke all on function public.pin_board_post(uuid, boolean) from public, anon;
revoke all on function public.delete_board_post(uuid) from public, anon;
grant execute on function public.post_to_board(text, integer, boolean) to authenticated;
grant execute on function public.pin_board_post(uuid, boolean) to authenticated;
grant execute on function public.delete_board_post(uuid) to authenticated;
