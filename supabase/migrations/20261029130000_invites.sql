-- Household invites (SPEC-household H2, H3, H7, H12).
--
-- One shareable link per flat: a random 256-bit token, valid for 7 days, usable by several people.
-- Only a SHA-256 hash is stored, so a database leak does not leak working links. A new link
-- revokes the old one. Every kind of bad token (made up, malformed, expired, revoked, closed
-- flat) gives the same neutral answer.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  token_hash bytea not null unique,
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- At most one link per flat that has not been revoked.
create unique index invites_one_live on public.invites (household_id) where revoked_at is null;

comment on table public.invites is
  'Shareable join links. Only a hash of the token is stored; the token is shown once, when created.';

alter table public.invites enable row level security;

revoke all on public.invites from anon, authenticated;
-- Admins may read the link's metadata, never the hash.
grant select (id, household_id, created_by, expires_at, revoked_at, created_at)
  on public.invites to authenticated;

create policy invites_select_admins on public.invites
  for select to authenticated
  using ((select authz.is_household_admin(household_id)));

-- The hash of a token as typed by a person. Null or empty input never matches a real link.
create or replace function private.invite_hash(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select sha256(convert_to(p_token, 'UTF8'));
$$;

-- Creates (or replaces) the flat's invite link and returns the token. This is the only time the
-- token exists in clear text. Owner and admins only.
create or replace function public.create_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := (select authz.current_profile_id());
  v_household uuid;
  v_token text;
begin
  select m.household_id into v_household
    from public.memberships m
    join public.households h on h.id = m.household_id and h.closed_at is null
   where m.profile_id = v_profile
     and m.left_at is null
     and m.role in ('owner', 'admin');
  if v_household is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- Serialise link changes for this flat.
  perform 1 from public.households where id = v_household for update;

  update public.invites set revoked_at = now()
   where household_id = v_household and revoked_at is null;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.invites (household_id, token_hash, created_by, expires_at)
  values (v_household, private.invite_hash(v_token), v_profile, now() + interval '7 days');

  return v_token;
end;
$$;

-- Revokes the flat's link, if there is one. Owner and admins only.
create or replace function public.revoke_invite()
returns void
language plpgsql
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

  update public.invites set revoked_at = now()
   where household_id = v_household and revoked_at is null;
end;
$$;

-- What a person sees before deciding to join: the flat's name, who invited them, how many people
-- are in it. Nothing for any link that is not currently valid.
create or replace function public.preview_invite(p_token text)
returns table (household_name text, inviter_name text, member_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select h.name,
         p.display_name,
         (select count(*)::int from public.memberships m
           where m.household_id = h.id and m.left_at is null)
    from public.invites i
    join public.households h on h.id = i.household_id and h.closed_at is null
    join public.profiles p on p.id = i.created_by
   where i.token_hash = private.invite_hash(p_token)
     and i.revoked_at is null
     and i.expires_at > now()
     and (select authz.current_profile_id()) is not null;
$$;

-- Joins the flat behind a valid link as a plain member. Returns the flat's id.
create or replace function public.join_household(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := (select authz.current_profile_id());
  v_household uuid;
begin
  if v_profile is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select i.household_id into v_household
    from public.invites i
    join public.households h on h.id = i.household_id and h.closed_at is null
   where i.token_hash = private.invite_hash(p_token)
     and i.revoked_at is null
     and i.expires_at > now();
  if v_household is null then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  -- Joins to one flat are serialised, so the member cap cannot be beaten by two people at once.
  perform 1 from public.households where id = v_household for update;

  if exists (select 1 from public.memberships where profile_id = v_profile and left_at is null) then
    raise exception 'already_in_household' using errcode = 'P0001';
  end if;

  if (select count(*) from public.memberships where household_id = v_household and left_at is null) >= 20 then
    raise exception 'household_full' using errcode = 'P0001';
  end if;

  insert into public.memberships (household_id, profile_id, role)
  values (v_household, v_profile, 'member');

  return v_household;
end;
$$;

revoke all on function private.invite_hash(text) from public, anon, authenticated;
revoke all on function public.create_invite() from public, anon;
revoke all on function public.revoke_invite() from public, anon;
revoke all on function public.preview_invite(text) from public, anon;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.revoke_invite() to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;

comment on function public.create_invite() is
  'Creates the flat''s invite link (revoking the old one) and returns the token once. Owner and admins only.';
comment on function public.join_household(text) is
  'Joins the flat behind a valid invite token as a member. Every invalid token gives invalid_invite.';
