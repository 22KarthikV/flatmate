-- Identity: one profile per person.
--
-- profiles.id is its own uuid and user_id links to the auth user with ON DELETE SET NULL, so when
-- an account is deleted the row survives, anonymised, and later tables can keep pointing at it
-- (ADR-003, SPEC-identity I4). Rows are created by a trigger on sign-up; the API can only read
-- your own row and rename yourself.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.profiles is
  'One row per person. Created on sign-up, anonymised (not deleted) when the account is deleted.';

-- Turns OAuth metadata into a safe display name and avatar.
create or replace function private.profile_name(p_meta jsonb, p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    coalesce(
      nullif(btrim(p_meta ->> 'full_name'), ''),
      nullif(btrim(p_meta ->> 'name'), ''),
      nullif(btrim(split_part(coalesce(p_email, ''), '@', 1)), ''),
      'Flatmate'
    ),
    50
  );
$$;

create or replace function private.profile_avatar(p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_meta ->> 'avatar_url', p_meta ->> 'picture') ~ '^https://'
      then coalesce(p_meta ->> 'avatar_url', p_meta ->> 'picture')
    else null
  end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    private.profile_name(new.raw_user_meta_data, new.email),
    private.profile_avatar(new.raw_user_meta_data)
  );
  return new;
end;
$$;

-- Keeps the photo in step with Google. The name is never overwritten: people may have renamed themselves.
create or replace function private.sync_profile_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set avatar_url = private.profile_avatar(new.raw_user_meta_data)
   where user_id = new.id
     and avatar_url is distinct from private.profile_avatar(new.raw_user_meta_data);
  return new;
end;
$$;

revoke all on function private.profile_name(jsonb, text) from public, anon, authenticated;
revoke all on function private.profile_avatar(jsonb) from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.sync_profile_avatar() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_metadata_changed
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function private.sync_profile_avatar();

-- Called by the delete-account Edge Function (service role) just before the auth user is removed.
-- The row stays so shared history keeps pointing at something; it just no longer names anyone.
create or replace function public.anonymise_profile(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set display_name = 'Deleted user',
         avatar_url = null,
         deleted_at = now(),
         user_id = null
   where user_id = p_user_id;
$$;

revoke all on function public.anonymise_profile(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_profile(uuid) to service_role;

comment on function public.anonymise_profile(uuid) is
  'Replaces a person''s name and photo with a neutral placeholder and unlinks the row. service_role only.';
