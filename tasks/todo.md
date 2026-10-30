# Task list: ledger

Plan: [plan.md](plan.md). Spec: [../docs/SPEC-ledger.md](../docs/SPEC-ledger.md). Tests come first for any logic (TDD). Database tasks write the pgTAP file before the migration.

## Carry-over (owner checks, none block this module)

- [ ] Android Chrome: Google sign-in, persistence (iPhone Safari already confirmed 29 Oct)
- [ ] Installed Home Screen app on iPhone and Android: sign-in stays in the app, session persists
- [ ] Delete an account on the live site with a real Google account
- [ ] Add each flatmate's Gmail as a Google test user; set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel
- [ ] Re-time the Account page on a phone after the London region change
- [ ] Two real phones on production: invite link from the share sheet, second phone joins (Safari and installed app), roles, removal, leave and rejoin
- [ ] Live flat updates on real phones: a join, leave or role change shows on an open Home and Your flat screen without navigating

---

- [x] **Task 1: Money, splits and debt simplification** (Medium)
  - Description: Three pure modules in `src/features/ledger/`, no database. `money.ts`: `formatPence`, `parsePounds` (typed text to pence; two decimals at most), limits (1p to £10,000). `splits.ts`: `splitExpense` for equal, exact, percent (hundredths of a percent) and one-person, leftover pence given out one at a time by largest remainder with ties broken by profile id. `simplify.ts`: `simplifyDebts` from net balances to at most (people minus one) payments.
  - Acceptance:
    - [x] Unit: parse and format round-trip; "4.2" is £4.20; "4.205", "-1", "0", "10000.01" and "abc" are rejected
    - [x] Unit and property tests: shares always sum to the amount; an equal split differs by at most 1p between people; the result does not depend on input order; percentages must total 100.00%; exact amounts must total the amount; each rejection gives a clear message
    - [x] Property tests: suggested payments clear every balance exactly, each is positive, and there are at most (people minus one)
  - Verify: `pnpm test`, `pnpm check`
  - Dependencies: none
  - Files: `src/features/ledger/{money,splits,simplify}.ts` and tests

- [x] **Task 2: Ledger tables, RLS, balances function, notification types, isolation tests** (Medium)
  - Description: Migration `*_ledger.sql` with `expenses`, `expense_shares`, `settlements` (spec data model), RLS (members of the flat read; no write policies), a deferred constraint that shares sum to the amount, a guard that only allows voiding a row once and nothing else, `households.nudge_after_days`, `public.household_balances(household_id)` (members only), the new `notification_types` rows (`expense_added`, `expense_changed`, `expense_voided`, `settlement_pending`, `settlement_confirmed`, `settlement_declined`, `payment_nudge`) with a nullable generic push text column, and `types.ts` entries. pgTAP first.
  - Acceptance:
    - [x] pgTAP: a member of flat A reads zero rows from flat B and cannot write there; `anon` reads nothing; the browser role cannot insert, update or delete any ledger table
    - [x] pgTAP: shares must sum to the amount; amounts outside 1p to £10,000 fail; payer and sharers must be active members; update other than a single void, and any delete, are rejected
    - [x] pgTAP: `household_balances` is zero-sum after a mixed set of expenses and confirmed settlements, ignores voided rows and non-confirmed settlements, and is callable only by members
    - [x] Unit: `types.ts` and the migrations agree on the new types and their defaults
    - [x] Types regenerated; `privacy-matches-data` pins the new tables' columns; `pnpm db:test` green
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types && pnpm test`
  - Dependencies: none (Task 1 is independent)
  - Files: migration, `ledger.test.sql`, `src/lib/db/types.ts`, `src/features/notifications/types.ts` and test, `src/features/legal/privacy-matches-data.test.tsx`

- [x] **Task 3: Add, edit and void expenses in the database, with notifications and generic push text** (Medium)
  - Description: Migration `*_ledger_expenses.sql`. `add_expense(...)` takes the already-computed shares, re-checks the sum and membership, and notifies each person with a share (not the adder). `edit_expense(...)` voids the old expense and adds a replacement in one transaction (`replaces_id`); `void_expense(...)` voids with no replacement. Only the creator or an admin may edit or void. Dedupe keys `expense:<id>`, `expense_changed:<id>`, `expense_voided:<id>`. `deliver-push` uses a type's generic push text when one is set, so amounts never reach a push.
  - Acceptance:
    - [x] pgTAP: each action writes exactly the notification rows in the spec to the right people, once, with no self-notification
    - [x] pgTAP: only the creator or an admin can edit or void; a member of another flat cannot; editing twice keeps both versions; balances recalculate and stay zero-sum
    - [x] pgTAP: the push outbox gets rows for push-enabled devices, and the inbox row keeps the full amount text
    - [x] pgTAP: `claim_push_outbox` hands the worker the generic text for money types and the notification's own text for others; the text contains no currency sign or digit (the worker needs no change)
    - [x] Hosted migration applied before merge (no function redeploy needed)
  - Verify: `pnpm db:test`, `pnpm test`
  - Dependencies: Task 2
  - Files: migration, `ledger-expenses.test.sql`

- [x] **Task 4: Add expense screen, expense list and detail, privacy notice** (Large: split into form and list if it runs long)
  - Description: `/money/add` with the form (amount, description, category, date, who paid, who it is for, split mode with a live preview of each share), `/money/expenses/[id]` with shares and history plus edit and void for the creator or an admin, and a recent-expenses list on `/money`. Server actions `addExpense`, `editExpense`, `voidExpense` validate with zod, compute shares with `splitExpense`, and map database errors to plain messages. The form is a client component loaded only on its route. The privacy notice names the ledger data and what happens to it on account deletion (kept, shown as "Deleted user").
  - Acceptance:
    - [x] Unit: form validation messages, split-mode switching, live preview matches `splitExpense`; actions map errors
    - [x] E2E (desktop-chrome): A adds an expense split equally with B; B's inbox shows "Your share is £x"; A edits it and the detail page shows both versions; A voids it and it shows struck through
    - [x] Mobile: no sideways scroll at 360px; touch targets at least 44px; amounts inputs use the numeric keyboard
    - [x] `privacy-matches-data` fails if the ledger tables change without the notice; new routes have bundle budgets, none raised
  - Verify: `pnpm check`, `pnpm test:e2e`
  - Dependencies: Tasks 1, 3
  - Files: `src/features/ledger/*`, `src/app/(app)/money/**`, `src/app/(public)/privacy/page.tsx`, `scripts/bundle-budgets.json`, `e2e/ledger.spec.ts`

- [x] **Task 5: Balances screen and suggested payments** (Small)
  - Description: `/money` shows "You are owed £x" or "You owe £x", each person's position, and the suggested payments from `simplifyDebts` ("Sam pays Karthik £12.00"), plus a "Former flatmates" section for people who have left but still have a balance. A single balances query; cached per request.
  - Acceptance:
    - [x] Unit: view-model from balances (owed, owing, settled, former flatmates); empty state for a new flat
    - [x] E2E: after A and B add expenses in different directions, both see the same, correct, zero-sum positions and the same suggested payment
    - [x] Balances update on an open screen when the other person adds an expense (via the live bell)
  - Verify: `pnpm test`, `pnpm test:e2e`
  - Dependencies: Task 4
  - Files: `src/features/ledger/balances*.ts*`, `src/app/(app)/money/page.tsx`

- [x] **Task 6: Settle-up: record, confirm, decline, cancel** (Medium)
  - Description: Migration `*_ledger_settlements.sql` with `record_settlement`, `confirm_settlement`, `decline_settlement`, `cancel_settlement`. A pending settlement changes no balance; confirming moves it. Notifications: `settlement_pending` to the receiver, `settlement_confirmed` or `settlement_declined` to the payer. Screens: `/money/settle` (prefilled from a suggested payment) and pending rows on `/money` with Confirm and Decline for the receiver and Cancel for the payer.
  - Acceptance:
    - [x] pgTAP: only the receiver can confirm or decline; only the payer can cancel; confirming twice is a no-op; a declined or cancelled settlement never changes a balance; balances stay zero-sum
    - [x] pgTAP: payer and receiver must be active members of the same flat; amount limits; notifications and generic push text
    - [x] E2E: B records a payment, A sees it pending and confirms, both balances update to zero; a declined payment leaves balances unchanged
  - Verify: `pnpm db:test`, `pnpm test:e2e`
  - Dependencies: Task 5
  - Files: migration, `ledger-settlements.test.sql`, `src/features/ledger/{settle-form,actions}.ts*`, `src/app/(app)/money/settle/page.tsx`, `e2e/ledger.spec.ts`

- [ ] **Task 7: Leaving and account deletion rules; admin settles on behalf** (Medium)
  - Description: Migration `*_ledger_leaving.sql`. `private.can_leave` becomes false when the person has a non-zero balance or a pending settlement; account deletion honours it. An admin can confirm a settlement on behalf of a removed person (`confirmed_by` records who). The leave section and delete-account page say plainly why someone cannot leave yet and what to do.
  - Acceptance:
    - [ ] pgTAP: leaving with a balance or a pending settlement is refused; leaving when clear works; existing household suites still pass
    - [ ] pgTAP: only an admin can confirm on behalf, only for someone who is no longer an active member, and the row records the admin
    - [ ] E2E: a member with a balance sees why they cannot leave; after settling they can; the delete-account flow behaves the same
  - Verify: `pnpm db:test`, `pnpm test:e2e`
  - Dependencies: Task 6
  - Files: migration, `ledger-leaving.test.sql`, `src/features/household/leave-section.tsx`, identity delete-account screens

- [ ] **Task 8: Nudges and pending-settlement reminders** (Medium)
  - Description: Migration `*_ledger_nudges.sql`: an admin setting for the nudge interval (off, 3, 7 default, 14 days) on Your flat, a daily job that creates `payment_nudge` for each person who owes more than £1 and has owed for at least that long, and a daily job that reminds the receiver of a settlement pending over 2 days (up to 3 times). Dedupe keys make each period send once. Both appear in the notification preferences, snoozable.
  - Acceptance:
    - [ ] pgTAP: nudges go only to people who owe over £1 past the interval; one per person per period; off means none; reminders stop after 3 or when the settlement is decided; running a job twice duplicates nothing
    - [ ] Unit: the settings form and its schema; the preferences list shows the new types
    - [ ] E2E: an admin changes the interval and sees it saved; a seeded old debt produces one nudge
  - Verify: `pnpm db:test`, `pnpm test`, `pnpm test:e2e`
  - Dependencies: Task 6
  - Files: migration, `ledger-nudges.test.sql`, `src/features/household` (setting), `src/features/notifications/types.ts`

- [ ] **Task 9: Hosted rollout, phone checks, wrap-up** (Small)
  - Description: Confirm hosted migrations match the repo and advisors show nothing new beyond the intended function warnings; add a "Money" section to `docs/DEPLOY.md` with the rollout order and a phone checklist; owner checks on real phones.
  - Acceptance:
    - [ ] Hosted: `list_migrations` matches the repo; advisors reviewed; a money push shows no amount on a phone
    - [ ] Owner on real phones: add an expense on one phone and see it on the other; confirm a payment from the push; lock-screen push shows no amount; leaving with a balance is blocked with a clear message
    - [ ] Spec success criteria 1 to 10 all met
  - Verify: `pnpm check`, `pnpm db:test`, `pnpm test:e2e`, production `/api/health`
  - Dependencies: Tasks 1 to 8
  - Files: `docs/DEPLOY.md`, `tasks/*`
