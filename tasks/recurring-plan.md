# Implementation Plan: recurring

Spec: [docs/SPEC-recurring.md](../docs/SPEC-recurring.md) (approved 2026-10-30, with the rent-privacy change). Task list: [tasks/recurring-todo.md](recurring-todo.md). Parallel-work rules: [docs/PARALLEL-WORK.md](../docs/PARALLEL-WORK.md). Runs alongside `rota`; the two share no tables or screens.

## Overview

An admin describes the rent (by room) and each monthly bill once. A daily database job creates each month ahead of its due date, tells the right people, reminds those who have not paid and keeps a month-by-month history. Bills are ordinary ledger expenses written through `private.ledger_write_expense`. Rent is private: it lives in its own charges and payments tables that only the person concerned, the collector and admins can read, and it never touches the shared ledger.

## Architecture decisions

- **Pure logic first, in TypeScript with tests** (dates, room shares, equal shares, schemas, parity vectors). The database slices then re-implement only what must run with nobody present (the bill split, the due-date window) and are held to the same vectors.
- **Database first inside each slice:** pgTAP before the migration, then the action and screen. One migration per slice, each applicable to hosted on its own. Migration timestamps stay inside `20261101000000` to `20261115235959`.
- **Rent privacy is enforced by row-level security,** not by the screens. Templates, rooms, shares and the rent change log are admin-only; `rent_charges` and `rent_payments` are admin plus own rows; `my_rent()` derives the person from `auth.uid()`. The three-person pgTAP test lands with the tables, before any function exists.
- **No writes from the browser.** Every write is a `security definer` function that derives the caller from `auth.uid()`; the tables have no write grants.
- **Idempotent by construction.** Unique `(template_id, period)` and `(template_id, period, profile_id)`; the generator inserts with `on conflict do nothing` and only writes money when its insert won; every job function takes `p_now`.
- **No change to the ledger, the leaving code or `deliver-push`.** `private.notify`, `private.ledger_write_expense` and `job_runs` are called, not changed. Leavers are noticed by the daily job.
- **Shared files:** append-only, one small edit each, in the task that first needs it (notification types with the tables; privacy page and test with the tables; bundle budgets with each route; DEPLOY.md at the end with the daily job and phone checks; Money screen links with the first screens).
- **No new dependencies, no Edge Function.**

## Dependency graph

```
1 pure logic (dates, rooms, shares, schemas, vectors)
   |
2 tables + RLS (rent privacy) + append-only + SQL bill split + 7 notification types + privacy rows
   |
3 template functions (save, pause, resume, skip, end, change log)
   |
4 generator (bills through the ledger, rent charges, enter_bill_amount, leaver pause)
   |        \
   |         5 rent payments, status, my_rent, dashboard, leaver notice
   |         |
6 reminders + cron job (needs 4 and 5)
   |
7 data layer + Money links + bills screens (list, history, amount entry)   (needs 4)
8 template form: new, edit, detail                                         (needs 3, 7)
9 rent screens: Your rent, pay, history, dashboard                         (needs 5, 8)
   |
10 end-to-end, DEPLOY.md, phone checklist, final report                    (needs all)
```

Tasks 7 to 9 can start as soon as their database dependency is merged and hosted.

## Task list

- [x] Task 1: Pure logic (dates, rooms, shares, schemas, parity vectors)
- [x] Task 2: Tables, rent privacy, append-only, SQL bill split, notification types
- [x] Task 3: Template functions and change log
- [x] Task 4: Monthly generator, variable amounts, leaver pause
- [x] Task 5: Rent payments, status, my rent, dashboard
- [ ] Task 6: Reminders and the daily job
- [ ] Task 7: Bills screens and Money links
- [ ] Task 8: Template form, detail and edit
- [ ] Task 9: Rent screens
- [ ] Task 10: End-to-end, deploy notes, final report

## Risks and how the plan handles them

| Risk                                         | Handling                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Rent leaks to another member                 | RLS in Task 2 with the three-person pgTAP test before any function; component and e2e checks in Tasks 9, 10 |
| SQL split differs from TypeScript            | Shared vectors (Task 1) checked in Vitest and pgTAP (Task 2); property test in both                         |
| A month created twice                        | Unique keys in Task 2; generator tests that run repeatedly and after gaps in Task 4                         |
| Rebase conflicts with `rota` on shared files | Append-only edits; regenerate `types.ts` after every rebase; stop and ask if a rota-owned file must change  |
| Hosted migration lag                         | PR green, ask the orchestrator to apply, merge only after it is applied                                     |

## Decisions made while building

- An **equal bill** with no people listed on the template means everyone in the flat when the month is created; with people listed, it means those of them still in the flat. This resolves the spec's "lists who is included" and "a new flatmate is added automatically" without a new column.
- A variable bill's reminders use the `bill_amount_needed` type (in-app and push); `recurring_reminder` is the rent reminder only, so "push for rent only" holds per type.
