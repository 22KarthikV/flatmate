# Task list: household

Plan: [plan.md](plan.md). Spec: [../docs/SPEC-household.md](../docs/SPEC-household.md). Tests come first for any logic (TDD). Database tasks write the pgTAP file before the migration.

## Carry-over from identity (owner checks, none block this module)

- [ ] Android Chrome: Google sign-in, persistence (iPhone Safari already confirmed 29 Oct)
- [ ] Installed Home Screen app on iPhone and Android: sign-in stays in the app, session persists
- [ ] Delete an account on the live site with a real Google account
- [ ] Add each flatmate's Gmail as a Google test user; set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel
- [ ] Re-time the Account page on a phone after the London region change

---

- [x] **Task 1: Flat and membership tables, helpers, `create_household`, isolation tests** (Medium). 39 pgTAP assertions. Policy helpers live in a new `authz` schema (not `private`, which stays closed to app roles; ADR-003 updated). Hosted migration is applied in Task 9.
  - Description: Migration `*_households.sql` with `households`, `memberships` (partial unique indexes: one active flat per person, one owner per flat), the role enum, `private.is_household_member` / `private.is_household_admin` helpers, RLS (select for members; nothing else), `create_household(name)` and `rename_household(name)`. pgTAP first.
  - Acceptance:
    - [x] pgTAP: a user in flat A cannot read B's household or memberships; `anon` reads nothing; no API insert, update or delete on either table
    - [x] pgTAP: creating a flat makes the caller its only owner; a second active flat for the same person is refused; names outside 1 to 50 characters are refused
    - [x] pgTAP: only admins and the owner can rename; the helper plan is checked with `explain` (index used)
    - [x] Types regenerated; `pnpm db:test` green
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types`
  - Dependencies: none
  - Files: migration, `households.test.sql`, `src/lib/db/types.ts`

- [ ] **Task 2: Create a flat from Home** (Medium)
  - Description: `getMembership()` (cached per request, uses the shared session), zod schemas, `createHousehold` action, `create-flat-form`, Home shows "Create your flat" or the plain flat view, and `no-flat` screens on Rota, Money and Events. Account keeps working without a flat.
  - Acceptance:
    - [ ] Unit: schemas (name rules), `getMembership` for none, owner, member
    - [ ] A new user creates a flat and Home shows its name; reload keeps it
    - [ ] Without a flat, Rota, Money and Events show the no-flat screen; `/more/account` still opens
    - [ ] E2E (desktop-chrome): create a flat; no-flat tabs; layout has no sideways scroll on mobile projects
  - Verify: `pnpm test`, `pnpm test:e2e`
  - Dependencies: Task 1
  - Files: `src/features/household/*`, dashboard and tab pages, `e2e/household.spec.ts`

- [ ] **Task 3: Invite functions with tests** (Medium)
  - Description: `invites` table and `create_invite`, `revoke_invite`, `preview_invite(token)`, `join_household(token)` (member cap 20, one live link per flat, 7-day expiry, hash-only storage). pgTAP first.
  - Acceptance:
    - [ ] pgTAP: token never stored in clear; admins only create and revoke; a new link revokes the old one
    - [ ] pgTAP: join works once per person; expired, revoked, unknown and malformed tokens give an identical result; already-in-a-flat is refused
    - [ ] pgTAP: `preview_invite` returns only flat name, inviter name and member count; the 21st join is refused; two simultaneous joins at the cap cannot both succeed
    - [ ] `invites` is invisible to members and `anon`; admins can read their own flat's row metadata only
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types`
  - Dependencies: Task 1
  - Files: migration, `invites.test.sql`, types

- [ ] **Task 4: Invite card and join flow** (Medium)
  - Description: `/more/flat` page with the invite card (create, copy, share sheet, expiry, revoke, regenerate); `/join/[token]` shows "Join _Flat_?" and joins via a server action; "Got an invite link?" paste field on Home. Link shape built by a pure `invite-link.ts`.
  - Acceptance:
    - [ ] Unit: link builder and token-shape validation
    - [ ] A plain GET of `/join/<token>` changes nothing (tested); tapping Join adds the member
    - [ ] Signed-out visitor to a join link is sent to sign in and brought back (existing guard)
    - [ ] Neutral message for bad, expired and revoked links; "leave your current flat first" message when already in one
    - [ ] E2E: user A creates the link; user B (second context) joins; B appears for A; A revokes and a third user sees the neutral message
  - Verify: `pnpm test`, `pnpm test:e2e`
  - Dependencies: Tasks 2, 3
  - Files: `invite-card.tsx`, `join-panel.tsx`, `invite-link.ts`, join page, `/more/flat`, E2E

- [ ] **Task 5: Members list, roles and removal** (Medium)
  - Description: `set_member_role`, `remove_member`, and the `profiles` select policy that lets flatmates see each other (name and photo only). Members list shows what each role may do; admins promote, demote and remove. pgTAP first.
  - Acceptance:
    - [ ] pgTAP: members see flatmates' profiles and nobody else's; nothing changes for `anon`; deleted users still show as "Deleted user"
    - [ ] pgTAP: a member cannot call admin functions; admins cannot remove admins; nobody can demote or remove the owner; `left_reason` is `removed`
    - [ ] Unit: the role-to-actions table the UI uses
    - [ ] E2E: A promotes B to admin, demotes, removes; the removed person lands on the create-or-join screen
  - Verify: `pnpm db:test`, `pnpm test`, `pnpm test:e2e`
  - Dependencies: Task 4
  - Files: migration, tests, `members-list.tsx`, actions, types

- [ ] **Task 6: Leave, transfer ownership, close the flat** (Medium)
  - Description: `leave_household`, `transfer_ownership` (old owner becomes admin), `close_household` (sole member only), and the `private.can_leave` hook (returns true until `ledger`). Confirmation dialogs in `/more/flat`.
  - Acceptance:
    - [ ] pgTAP: owner cannot leave while others remain; transfer swaps owner and keeps exactly one; two simultaneous transfers cannot create two owners
    - [ ] pgTAP: leaving sets `left_at`/`left_reason`; a closed flat cannot be joined or read; rejoining makes a new row; `can_leave` is called by leave
    - [ ] E2E: member leaves and rejoins with a fresh link; owner transfers then leaves; a sole member closes the flat
  - Verify: `pnpm db:test`, `pnpm test:e2e`
  - Dependencies: Task 5
  - Files: migration, tests, `/more/flat` dialogs, actions

- [ ] **Task 7: Account deletion interaction** (Small)
  - Description: `private.end_memberships_for_account(profile_id)` (service role only); extend the `delete-account` handler: owner with others returns a clear 409 `owner_must_transfer`, sole member closes the flat, other members leave, then anonymise and delete as before. Account page shows the message.
  - Acceptance:
    - [ ] Handler tests: each of the three cases; still anonymises before deleting; no detail leaks; retry is safe
    - [ ] pgTAP: only `service_role` can call the function; `left_reason` is `account_deleted` or `flat_closed`
    - [ ] E2E: a non-owner deletes and disappears from the member list as "Deleted user"; an owner with others is told to transfer
  - Verify: `pnpm test`, `pnpm db:test`, `pnpm test:e2e`
  - Dependencies: Task 6
  - Files: migration, tests, `delete-account/*`, `delete-account-form.tsx`

- [ ] **Task 8: Setup checklist and step registry** (Small)
  - Description: `setup-steps.ts` registry and `setup-checklist.tsx` on Home for admins and the owner; first step "Invite your flatmates" (done at two or more members); members see the waiting note. Hides when every step is done.
  - Acceptance:
    - [ ] Unit: ordering, done and hidden logic, role visibility, and a test that another module can register a step
    - [ ] E2E: checklist shows for the owner, ticks after B joins, members see the note
  - Verify: `pnpm test`, `pnpm test:e2e`
  - Dependencies: Task 4
  - Files: `setup-steps.ts`, `setup-checklist.tsx`, dashboard, tests

- [ ] **Task 9: Privacy notice, full E2E, hosted rollout, device checks** (Medium)
  - Description: Privacy page names the new data (membership, role, join and leave times, invite hashes) with a test tied to the generated types, as for `profiles`. Apply the migrations to hosted and deploy `delete-account`; compare migration versions to the repo; advisors check. Real-device check with two phones.
  - Acceptance:
    - [ ] Privacy test fails if any household table gains a column the notice does not cover
    - [ ] Hosted migrations match the repo; Supabase advisors show nothing new beyond intended notes
    - [ ] Two real phones: share the link through the share sheet, second phone joins (Safari and installed app), roles and removal behave
    - [ ] Lighthouse targets hold on `/dashboard` and `/more/flat`
  - Verify: CI, hosted checks, manual
  - Dependencies: Tasks 1 to 8

### Checkpoint: Household complete

- [ ] Every success criterion in `docs/SPEC-household.md` is met
- [ ] `tasks/todo.md` carry-over items reported or consciously deferred
