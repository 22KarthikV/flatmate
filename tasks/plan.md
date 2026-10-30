# Implementation Plan: ledger

Spec: [docs/SPEC-ledger.md](../docs/SPEC-ledger.md) (approved 2026-10-30, on the default decisions). Task list: [tasks/todo.md](todo.md). Earlier plans are archived in [tasks/archive](archive/).

## Overview

Shared expenses and settle-up for a flat: add an expense with a split, see who owes whom in the fewest payments, record a payment that the receiver confirms, and be nudged gently. No money moves through the app. The module also fills in the `can_leave` hook that `household` reserved, and gives `recurring` the expenses and settlements it will build rent and bills on.

## Architecture decisions

- **Pure logic first, then the database, then screens.** Splitting, rounding and debt simplification are plain functions with property tests (Task 1) before any table exists. The database re-checks what code computes, so a bug in one cannot silently corrupt money.
- **Append-only, derived balances.** Expenses, shares and settlements are never rewritten; an edit is "void and replace". Balances are always summed from the rows, so they cannot drift and the zero-sum rule is easy to prove. No cached balance table until measurement asks for one.
- **The database enforces the rules.** Every write goes through a `security definer` function that derives the caller from `auth.uid()`; tables have no write policies. The pgTAP suite is the main safety net, as in `household` and `notifications`.
- **Notifications are written in the same transaction** with `private.notify`, using dedupe keys. Money types push a **generic** text, so no amount reaches a lock screen.
- **Reuse, don't invent:** the live bell already refreshes the screen when a notification arrives, so balances update with no new Realtime channel; the `job_runs`/cron pattern runs the nudge job; the `authz` helpers do membership and role checks.
- **One migration per slice,** so each can be applied to hosted on its own, before the code that needs it is merged. Bundle budgets are not raised; new routes get their own entries.

```
1 pure logic: money, splits, simplify (no database)
2 data model, RLS, balances function, types, isolation tests
      ├─ 3 add / edit / void functions + notifications + generic push text
      │       └─ 4 add expense screen, expense list and detail, privacy notice
      │               └─ 5 balances screen, suggested payments
      │                       └─ 6 settle-up: record, confirm, decline, cancel
      │                               ├─ 7 leaving and account deletion rules, admin settles on behalf
      │                               └─ 8 nudges and pending-settlement reminders
      └───────────────────────────────────────────────────────── 9 hosted rollout and phone checks
```

Tasks 1 and 2 are independent and can be built in either order; 3 needs 2; 4 needs 1 and 3; 5 needs 4; 6 needs 5; 7 and 8 need 6; 9 needs all.

## Task list

- [x] Task 1: Money, splits and debt simplification (pure code, property-tested)
- [x] Task 2: Ledger tables, RLS, `household_balances`, notification types, isolation tests
- [x] Task 3: Add, edit and void expenses in the database, with notifications and generic push text
- [x] Task 4: Add expense screen, expense list and detail, privacy notice
- [x] Task 5: Balances screen and suggested payments
- [ ] Task 6: Settle-up: record, confirm, decline, cancel
- [ ] Task 7: Leaving and account deletion rules; admin settles on behalf
- [ ] Task 8: Nudges and pending-settlement reminders
- [ ] Task 9: Hosted rollout, phone checks, wrap-up

### Checkpoint: after Task 5 (usable for tracking)

- [ ] A flat can add expenses in every split mode, see balances and suggested payments, and everyone is told. `pnpm check`, `pnpm db:test`, `pnpm test:e2e` green. Settle-up is still manual outside the app, and that is fine to ship.

### Checkpoint: Ledger complete

- [ ] Every success criterion in the spec is met

## Risks

| Risk                                             | Mitigation                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Rounding makes shares not add up                 | One split function, property tests, and a database constraint on the sum                                                |
| Balances drift from the rows                     | Never stored; always summed from the rows; zero-sum proven in pgTAP after a mixed run                                   |
| History edited to change who owes what           | Append-only tables, no write policies, tests that update and delete fail                                                |
| An amount appears on a lock screen               | Generic push text per money type; test that no payload contains an amount                                               |
| Generic push text breaks other notifications     | It is a per-type override inside `claim_push_outbox` only; existing push tests must stay green; the worker is unchanged |
| Leaving with debts strands money                 | `can_leave` blocks it (Task 7); admin settles on behalf for removed people; no hidden write-off                         |
| Money form is heavy on a phone                   | Client component only on `/money/add`; budgets checked in CI; no existing budget raised                                 |
| Scope creep into rent and bills                  | Recurring generation is the next module; the ledger only exposes expenses and settlements                               |
| Owner checks from earlier modules are still open | Carried over in `tasks/todo.md`; none block this module                                                                 |
