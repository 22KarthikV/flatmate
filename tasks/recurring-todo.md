# Task list: recurring

Plan: [recurring-plan.md](recurring-plan.md). Spec: [../docs/SPEC-recurring.md](../docs/SPEC-recurring.md). Rules for shared files: [../docs/PARALLEL-WORK.md](../docs/PARALLEL-WORK.md). Tests come first for logic and for every migration. One task per branch and PR; merge when CI is green. A migration PR waits for the orchestrator to apply it to hosted before merging.

---

- [x] **Task 1: Pure logic: dates, rooms, shares, schemas, parity vectors** (Medium)
  - Description: `src/features/recurring/dates.ts`, `rooms.ts`, `shares.ts`, `schemas.ts`, `parity-vectors.ts`, each with tests written first. No database, no screens.
  - Acceptance:
    - [x] `dates`: due date for a period and day; generation date 7 days before (rent, fixed bill) and 14 (variable); reminder dates (7, 3, 2, 1 before, the day, daily after); active months; December/January boundary; no backfill (a due date already past is not generated; rent due the 7th set up on the 30th starts with the next 7th)
    - [x] `rooms.roomShares`: the first flat (two shared rooms, one private, five people) gives the expected pence; odd pence by largest remainder with ties by profile id; sums to the total; independent of input order; a person in no room or two rooms rejected; property test
    - [x] `shares.equalShares`: spread over exactly who is in the flat; property test sums to the total
    - [x] `schemas`: due day 1 to 28, fixed needs an amount, variable must not, percentages add to 100, room rent and person amount 1p to £10,000, name up to 50, rent payment at least 1p
    - [x] `parity-vectors` checked against the ledger's `splitExpense` (the SQL side is checked in Task 2)
  - Verify: `pnpm check`
  - Dependencies: none
  - Files: `src/features/recurring/*` and tests

- [x] **Task 2: Tables, rent privacy, append-only, SQL bill split, notification types** (Large)
  - Description: Migration `20261101120000_recurring.sql`: the seven tables, RLS per the spec table, no write grants, append-only triggers, `private.recurring_split_bill`, the seven `notification_types` rows with generic push text, `types.ts` entries and the test that keeps them in step; privacy page rows and the `privacy-matches-data` test. pgTAP first.
  - Acceptance:
    - [x] pgTAP, three members plus an admin collector (A and B roommates, C private room): A reads only A's charges and payments; B's charge, payment, share, rooms, template, change log return zero rows; admin and collector see all; another flat sees nothing; `anon` sees nothing; the browser role cannot insert, update or delete any table
    - [x] pgTAP: instance only moves awaiting amount to posted; charges and log cannot be updated or deleted; payments change once (decision or void); nothing deletable
    - [x] pgTAP: SQL bill split gives the shared vectors, always sums to the total
    - [x] Types regenerated, privacy test lists the new tables, `pnpm db:test` and `pnpm check` green
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types && pnpm check`
  - Dependencies: Task 1
  - Files: migration, `recurring-schema.test.sql`, `src/lib/db/types.ts`, `src/features/notifications/types.ts`, privacy page and test

- [x] **Task 3: Template functions and change log** (Medium)
  - Description: Migration `20261102120000_recurring_templates.sql`: `save_recurring_template` (rent with rooms or bill), `pause_`, `resume_`, `skip_recurring_month`, `end_recurring_template`, each writing the log. pgTAP first.
  - Acceptance:
    - [x] pgTAP: only owner or admin; rent collector must be an owner or admin and an active member; every rent person has exactly one room; amounts and months validated; edits log who and what; ended templates stay
    - [x] Types regenerated; `pnpm db:test` green
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types`
  - Dependencies: Task 2
  - Files: migration, `recurring-templates.test.sql`, `types.ts`

- [ ] **Task 4: Monthly generator, variable amounts, leaver pause** (Large)
  - Description: Migration `20261103120000_recurring_generate.sql`: `private.recurring_generate(p_now)`, `enter_bill_amount`, rent charges, pause on a leaver, notices. pgTAP first.
  - Acceptance:
    - [ ] pgTAP: running twice or on consecutive days makes one instance per template and period, one expense per bill, one charge per person; missed day caught up; no backfill
    - [ ] pgTAP: rent never touches `expenses`, `expense_shares`, `settlements` or balances; bills pass the ledger constraints and balances still sum to 0
    - [ ] pgTAP: variable bill awaits amount, entering posts it once, second entry fails; edits affect future months only
    - [ ] pgTAP: a leaver pauses rent and percentage bills and tells admins once; equal bills continue over who remains; a gone collector or payer pauses the template
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types`
  - Dependencies: Task 3
  - Files: migration, `recurring-generate.test.sql`, `types.ts`

- [ ] **Task 5: Rent payments, status, my rent, dashboard** (Large)
  - Description: Migration `20261104120000_recurring_rent.sql`: `record_rent_payment`, `confirm_`, `decline_`, `cancel_`, `void_rent_payment`, `waive_rent`, `rent_status`, `my_rent`, `rent_dashboard`, leaver unpaid-rent notice. pgTAP first.
  - Acceptance:
    - [ ] pgTAP: payment capped at what is owed; pending shows pending; only confirmed reduces outstanding; oldest charge first; decline, cancel change nothing; payer cannot confirm their own; once-only decisions, void and waiver behave per R22
    - [ ] pgTAP: `my_rent` returns only the caller's rows; `rent_dashboard` raises for non-admins; leaving with unpaid rent is not blocked and admins are told the amount
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types`
  - Dependencies: Task 4
  - Files: migration, `recurring-rent.test.sql`, `types.ts`

- [ ] **Task 6: Reminders and the daily job** (Medium)
  - Description: Migration `20261105120000_recurring_reminders.sql`: `private.recurring_remind(p_now)`, `private.run_recurring_daily()`, `cron.schedule('recurring-daily', '0 7 * * *', ...)`, once per UTC day via `job_runs`, pending-payment reminders to the collector. pgTAP first.
  - Acceptance:
    - [ ] pgTAP: 7, 3, 2, 1 days before, the day, then daily after; variable bill payer 14, 7, 3, 1, the day, then daily; nobody who paid is reminded; a rent reminder carries only the recipient's own amount; running twice sends nothing twice; no push payload contains a currency amount; no rent notice reaches another non-admin
  - Verify: `pnpm db:reset && pnpm db:test`
  - Dependencies: Tasks 4, 5
  - Files: migration, `recurring-reminders.test.sql`

- [ ] **Task 7: Bills screens and Money links** (Medium)
  - Description: Server data layer, `/money/recurring` (this month and templates), `/money/recurring/months` history, `/money/recurring/instances/[id]/amount`, month card and amount form, Money screen links "Your rent" and "Rent and bills", bundle budgets for the new routes.
  - Acceptance:
    - [ ] Unit: month card, amount form, action error mapping
    - [ ] Budgets added for new routes, none raised
  - Verify: `pnpm check`
  - Dependencies: Task 4
  - Files: `src/features/recurring/*`, `src/app/(app)/money/recurring/*`, Money page, budgets

- [ ] **Task 8: Template form, detail and edit** (Large)
  - Description: `template-form.tsx` (rent with rooms, bill with fixed or variable, months, people, live total), `new`, `[id]`, `[id]/edit` pages, pause, resume, skip, end buttons.
  - Acceptance:
    - [ ] Unit: form behaviour and validation messages, live total; a member opening a rent template gets not-found
  - Verify: `pnpm check`
  - Dependencies: Tasks 3, 7
  - Files: as spec, budgets

- [ ] **Task 9: Rent screens** (Large)
  - Description: `/money/rent` (Your rent, plus dashboard for admins and collector), `/money/rent/pay`, `/money/rent/history`, `rent-card`, `rent-dashboard`, `rent-pay-form`, confirm/decline/cancel/void/waive actions.
  - Acceptance:
    - [ ] Unit: rent card shows only the viewer's own amount (a roommate's amount is absent from the rendered output); dashboard rows; pay form caps at what is owed
  - Verify: `pnpm check`
  - Dependencies: Tasks 5, 8
  - Files: as spec, budgets

- [ ] **Task 10: End-to-end, deploy notes, final report** (Medium)
  - Description: `e2e/recurring.spec.ts` (three people, an admin collector, time-travel through a test hook), `docs/DEPLOY.md` "Rent and bills" section, phone checklist, final report to the orchestrator.
  - Acceptance:
    - [ ] E2E: setup in three rooms and a gas bill; each member sees only their own rent, including by opening the rent template link directly; pay, confirm, status changes; variable bill amount entered and seen on Money; edit leaves the earlier month unchanged
    - [ ] `pnpm check`, `pnpm db:test`, `pnpm test:e2e` green; no bundle budget raised
  - Verify: `pnpm test:e2e`
  - Dependencies: Tasks 1 to 9
  - Files: `e2e/recurring.spec.ts`, `docs/DEPLOY.md`
