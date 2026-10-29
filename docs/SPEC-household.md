# Spec: household

Status: **draft for the owner's approval** (2026-10-29). Depends on: `identity` (complete). Unlocks: `notifications`, `ledger`, `recurring`, `rota`, `events`.

## Objective

A signed-in person can create a flat, invite their flatmates with one shareable link, and manage who is in it. Everything else in FlatMate belongs to a flat, so this module is the tenant boundary: a member sees only their own flat's data, enforced in the database. After the flat exists, Home shows a **setup checklist** that guides the admin through inviting flatmates and then (as those modules ship) setting rent, adding bills and creating the rota and chores.

Capabilities from the requirements: FR-HH-1 (create a household; the wizard's rent, bills and chore steps are added by their own modules as checklist steps), FR-HH-2 (expiring, revocable invite links; joining needs Google sign-in), FR-HH-3 (owner, admin, member; admins promote, demote and remove; at least one admin always), FR-HH-4 (members see only their own flat, enforced by RLS), D13 (a member leaving is a signal that later modules rebuild around). Acceptance from the requirements: a user from flat A can never read flat B's rows, tested at the database level.

### User stories

- As a new user with no flat, I can create one by giving it a name, and I become its owner.
- As a new user, I can join a flat by opening a link a flatmate sent me, signing in with Google, and tapping "Join".
- As an admin, I can copy one invite link, share it in the flat's group chat, and see it expire after 7 days or revoke it sooner.
- As an admin, I can see who is in the flat, make a member an admin (or back), and remove someone who should not be there.
- As a member, I can leave the flat.
- As the owner, I can hand ownership to someone else, and I must do so before I can leave or delete my account while others remain.
- As the only member, I can close the flat.
- As an admin, Home shows what is left to set up, in order, and ticks steps off by itself.
- As the developer, I can prove with database tests that no one can read or change another flat's data, and that the flat always has exactly one owner.

## Decisions to confirm

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | **Scope (owner's answer):** this module builds the flat, invites, joining, roles, leaving and removing, and the setup checklist. It does **not** build the long setup wizard: rent, bills and chores are checklist steps contributed by `recurring` and `rota` when they ship.                                                                                                                                                                         |
| H2  | **Joining (owner's answer):** a valid link plus Google sign-in makes you a member straight away. No approval step. The link is the secret, so it expires and can be revoked.                                                                                                                                                                                                                                                                           |
| H3  | **One shareable link per flat (owner's answer):** a random 256-bit token, valid 7 days, usable by several people. Only a hash is stored. Creating a new link revokes the old one. At most one live link per flat.                                                                                                                                                                                                                                      |
| H4  | **One active flat per person in v1** (requirements, section 3), enforced by a partial unique index. The schema allows more later.                                                                                                                                                                                                                                                                                                                      |
| H5  | **Roles:** `owner` (exactly one, the creator unless transferred), `admin`, `member`. The owner has every admin power. Admins can invite, revoke, promote members to admin, demote admins to member, remove members and rename the flat. Only the owner can remove an admin, transfer ownership or close the flat. No one can demote or remove the owner. "At least one admin always exists" holds because the owner cannot leave without transferring. |
| H6  | **Invariants live in the database,** not the UI: all writes go through `security definer` functions (create, join, leave, remove, set role, transfer, close, invite). The tables have no insert, update or delete policy for the API. Each function checks the caller and the invariants in one transaction.                                                                                                                                           |
| H7  | **Joining is a button, not a page load.** Messaging apps fetch links to build previews, so opening `/join/<token>` only shows "Join _Flat name_?" and the join happens on a POST. A preview bot can never add anyone.                                                                                                                                                                                                                                  |
| H8  | **"Member left" signal** is the membership row itself: `left_at` plus `left_reason` (`left`, `removed`, `account_deleted`, `flat_closed`). Likewise `joined_at` is the "member joined" signal. `rota`, `recurring` and `ledger` read these to rebuild forward-looking work ([DESIGN-rota-rebalancing](DESIGN-rota-rebalancing.md)). No separate event table.                                                                                           |
| H9  | **Leaving is always allowed in this module.** `ledger` later adds the rule from the requirements ("balances must be settled before leave is completed") through one hook, `private.can_leave(household_id, profile_id)`, which returns true until then.                                                                                                                                                                                                |
| H10 | **Account deletion interaction:** deleting your account first ends your membership (`account_deleted`). If you are the owner and others remain, deletion is refused with a message to transfer ownership first. If you are the only member, the flat closes. This extends the `delete-account` Edge Function and handler.                                                                                                                              |
| H11 | **Other members' names and photos** become visible to flatmates through a new RLS policy on `profiles` (the identity spec reserved this). Deleted accounts keep showing as "Deleted user".                                                                                                                                                                                                                                                             |
| H12 | **Flat size cap of 20 members** and flat names of 1 to 50 characters. The cap is a guard against a leaked link, checked inside the join function. Timezone is fixed at `Europe/London` (GBP and English only).                                                                                                                                                                                                                                         |
| H13 | **A closed flat** keeps its rows (`closed_at` set, all memberships ended with `flat_closed`) so history is never silently lost; nobody can open it. Permanent erasure is a later data-retention decision, recorded on the privacy page.                                                                                                                                                                                                                |

## Assumptions (correct me)

1. There is no join approval and no per-person invite. If a link leaks, an admin revokes it; anyone who already joined can be removed.
2. People without a flat can still use **More > Account** (including deleting their account). Other tabs show a short "Set up your flat first" screen instead of redirecting, so nobody is trapped.
3. The setup checklist is shown to admins and the owner. Members see a plain "Waiting for your admin to finish setting up" note until the rota exists.
4. Notifications ("Sam joined") wait for the `notifications` module. This module only writes the timestamps they will read.
5. A removed or departed person can rejoin later with a fresh link; they get a new membership row, and the old one stays as history.
6. A person who is in no flat and opens an invite while already in another flat is told to leave first. Switching flats in one step is not offered.

## Tech and structure

No new runtime dependencies are expected.

```
src/features/household/
  schemas.ts             zod: flat name, role, invite token shape
  membership.ts          getMembership(): the caller's active flat and role, cached per request
  actions.ts             server actions: createHousehold, joinHousehold, createInvite, revokeInvite,
                         leaveHousehold, removeMember, setRole, transferOwnership, renameHousehold,
                         closeHousehold (each calls one database function)
  invite-link.ts         builds the share URL; pure
  create-flat-form.tsx   name field and button
  join-panel.tsx         "Join <flat>?" confirmation
  members-list.tsx       members, roles, per-person actions allowed by the caller's role
  invite-card.tsx        copy / share / revoke, expiry shown
  setup-checklist.tsx    Home checklist
  setup-steps.ts         the step registry other modules add to
  no-flat.tsx            "Set up your flat first" screen
src/app/(app)/dashboard/page.tsx        no flat: create or "got a link?"; flat: setup checklist
src/app/(app)/join/[token]/page.tsx     protected: sign in first, then the confirmation
src/app/(app)/more/flat/page.tsx        members, invite, rename, leave, close
supabase/migrations/*_households.sql
supabase/tests/database/households.test.sql
supabase/functions/delete-account/      extended (see H10)
```

`/join/<token>` sits in the protected group, so the existing guard sends a signed-out visitor to `/sign-in?next=%2Fjoin%2F<token>` and brings them back. The page validates the token shape before touching the database.

### Data model

```sql
create type public.household_role as enum ('owner', 'admin', 'member');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 50),
  timezone text not null default 'Europe/London',
  created_by uuid not null references public.profiles (id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  profile_id uuid not null references public.profiles (id),
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text check (left_reason in ('left','removed','account_deleted','flat_closed')),
  check ((left_at is null) = (left_reason is null))
);
create unique index memberships_one_active_flat on public.memberships (profile_id) where left_at is null;
create unique index memberships_one_owner on public.memberships (household_id) where role = 'owner' and left_at is null;
create index memberships_household_active on public.memberships (household_id) where left_at is null;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  token_hash bytea not null unique,        -- sha256 of the token; the token itself is never stored
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invites_one_live on public.invites (household_id) where revoked_at is null;
```

- **RLS:** members of a flat can `select` their flat's `households`, `memberships` and (admins only) `invites` through `private.is_household_member` and `private.is_household_admin` ([ADR-003](adr/003-multi-tenancy-rls.md)). There is no insert, update or delete policy: only the functions below write. `anon` gets nothing.
- **Functions** (`security definer`, empty `search_path`, `execute` revoked from `public`/`anon`, granted to `authenticated`): `create_household(name)`, `create_invite()` (returns the token once), `revoke_invite()`, `preview_invite(token)` (flat name, inviter name, member count; nothing else), `join_household(token)`, `leave_household()`, `remove_member(profile_id)`, `set_member_role(profile_id, role)`, `transfer_ownership(profile_id)`, `rename_household(name)`, `close_household()`. Each derives the caller from `auth.uid()`, never from an argument. Wrong, expired, revoked and unknown tokens all return the same neutral result.
- **Profile visibility:** a new `select` policy on `profiles` lets a person read the profiles of people in the same flat, via a helper that checks both have an active membership in one flat.
- **For account deletion:** `private.end_memberships_for_account(profile_id)` (service role only) ends the membership, or closes a sole-member flat, or reports `owner_must_transfer`.
- **Seed data and types:** `pnpm db:types` regenerates `src/lib/db/types.ts`.

### Routes

| Route               | Who          | Behaviour                                                                                                      |
| ------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `/dashboard`        | signed in    | No flat: "Create your flat" and "Got an invite link?" (paste field). Flat: the setup checklist and today view. |
| `/join/[token]`     | signed in    | Shows the flat name and "Join". Already in a flat: tells you to leave first. Bad token: one neutral message.   |
| `/more/flat`        | flat members | Members and roles, invite card (admins), rename (admins), leave, transfer and close (owner).                   |
| Rota, Money, Events | signed in    | With a flat: their own screens. Without: the `no-flat` screen with a link to Home.                             |
| `/more/account`     | signed in    | Unchanged, plus the owner-must-transfer message on delete.                                                     |

### Setup checklist

`setup-steps.ts` exports a list of `{ id, title, href, done(flat), visibleTo }`. This module registers one step, **Invite your flatmates** (done when the flat has two or more active members). `recurring` and `rota` later add **Set the rent**, **Add recurring bills** and **Create the rota and chores**, in that order, each ticking itself off from its own data. The checklist hides itself when every step is done.

## Commands

Same as identity: `pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`, `pnpm test:e2e`. Deploying to hosted: the migration through the Supabase migration tool, then the `delete-account` function.

## Testing strategy

- **Database (pgTAP), written first:** this is the main safety net.
  - Isolation: user in flat A cannot read B's households, memberships or invites, nor B's members' profiles; `anon` gets nothing from any table; no API insert, update or delete on the three tables.
  - Invariants: exactly one owner; one active flat per person; cannot demote or remove the owner; admins cannot remove admins; a member cannot call admin functions; owner cannot leave without transferring; transfer makes the old owner an admin; the 20-member cap holds.
  - Invites: token never stored in clear; join works once per person; expired, revoked and unknown tokens behave identically; a new invite revokes the old; `preview_invite` leaks only name, inviter and count.
  - Leaving: `left_at` and `left_reason` set correctly for left, removed, account deleted, flat closed; a closed flat cannot be joined or read; rejoining creates a new row.
  - Concurrency-sensitive paths (two people joining at the cap, two transfers) run inside single transactions with row locks.
- **Unit (Vitest):** schemas (names, roles, token shape), invite-link builder, setup-step registry (done, hidden, ordering), what each role may see in the members list, `delete-account` handler (owner-must-transfer returns a clear, non-leaky 409; sole member closes the flat; non-owner leaves then deletes; still anonymise before delete).
- **End-to-end (Playwright, local stack):** user A signs in, creates a flat, copies the invite link; user B (second browser context) opens it signed out, is sent to sign in and returned, sees the flat name, taps Join and appears in A's member list; A promotes B, then removes B; B leaves and rejoins with a fresh link; the owner cannot delete their account until ownership is transferred; a revoked link shows the neutral message; flatless users see the create/join screen and can still reach Account.
- **Manual (real phones):** copy and share the link through the phone's share sheet into the flat's chat; open it on a second phone signed out; join in Safari and in the installed app (the iOS standalone sign-in return is the known risk from identity).
- **Performance:** Lighthouse targets still hold on `/dashboard`; policy helpers use the indexes above (checked with `explain` in a test or the plan).

## Boundaries

- **Always:** change membership only through the database functions; derive the caller from `auth.uid()`; hash invite tokens; return the same neutral result for any bad token; check role in the function and in the UI; keep RLS on every new table; regenerate types.
- **Ask first:** changing the role model or the one-owner rule; allowing more than one active flat; adding join approval or per-person invites; any new dependency; changing what other members can see about each other.
- **Never:** store or log invite tokens or emails; let the browser write to `households`, `memberships` or `invites` directly; let a join happen from a GET; expose the service-role key to the browser; reveal anything about a flat (even its name) to someone without a valid token or membership.

## Success criteria

1. A new user can create a flat, copy an invite link, and a second person on another phone joins from it and appears in the member list, on a preview and on production.
2. pgTAP proves flat-to-flat isolation on every new table (and on profile visibility), that `anon` has no access, and that every invariant in the testing section holds.
3. Opening an invite link never joins anyone until the person taps Join; a revoked, expired or made-up link shows the same neutral message.
4. The flat always has exactly one owner. The owner cannot leave or delete their account while others remain until ownership is transferred; a sole member can close the flat.
5. Leaving, removal, account deletion and closing each leave a membership row with the right `left_reason`, which later modules can read.
6. Home guides an admin through the setup checklist; the step registry has a unit test showing another module can add a step.
7. People without a flat can still reach Account and delete their account; other tabs explain what to do next.
8. The privacy notice names the new data (flat membership, role, join and leave times, invite hashes) and its test fails if the tables change without it.
9. `pnpm check`, `pnpm db:test`, `pnpm test:e2e` pass in CI; Lighthouse targets hold.

## Risks

| Risk                                                       | Mitigation                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Invite link leaks and a stranger joins                     | 256-bit token, 7-day expiry, revoke and regenerate, 20-member cap, admins can remove; "no approval" is the owner's explicit choice. |
| Link previews in chat apps trigger a join                  | Join only on POST (H7), tested.                                                                                                     |
| Policy helpers slow every query                            | One helper, partial indexes, `(select auth.uid())` wrapping; reviewed with `explain`.                                               |
| Racing joins or transfers break the one-owner or cap rules | Unique partial indexes plus row locks inside the functions; tests for the races.                                                    |
| Deleting an owner's account strands a flat                 | Refused until ownership is transferred (H10); sole-member flats close.                                                              |
| The `can_leave` hook is forgotten when `ledger` ships      | Listed in the ledger spec's dependencies and in this module's checkpoint notes.                                                     |
| Someone is trapped without a flat after being removed      | They land on the create-or-join screen; Account always works.                                                                       |

## Open questions

1. **Flat size cap of 20:** right number? (Raise it if you expect larger co-living houses.)
2. **Owner transfer:** is "owner hands over, becomes admin" the behaviour you want, or should the old owner become a plain member?
3. **Flat name:** any extra details at creation (address, house rules)? This spec assumes name only.
4. **Closed flats:** keep rows indefinitely for now (H13), with a retention rule decided later. OK?
