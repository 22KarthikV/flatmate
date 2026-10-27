# Capability Map: FlatMate

Status: DRAFT, awaiting approval. Module ids are stable and never renamed.

| Module id | Responsibility | Depends on |
|---|---|---|
| `foundation` | Repo scaffold, PWA shell, design system, CI, Supabase project and migrations tooling, test harness | none |
| `identity` | Google sign-in via Supabase Auth, profiles, sessions, account deletion | `foundation` |
| `household` | Create a flat, invite links, members, roles (owner/admin/member), admin setup questions, tenant isolation (RLS) | `identity` |
| `notifications` | In-app inbox, email, web push, reminder scheduler, outbox queue, per-user preferences | `household` |
| `ledger` | Shared expenses, splits, balances, debt simplification, settle-up with confirmation | `household`, `notifications` |
| `recurring` | Rent (collected by admin) and recurring bills (gas, electricity, Wi-Fi, council tax) on top of the ledger | `ledger`, `notifications` |
| `rota` | Chores, checklist templates, weekly availability, strict rotation, scheduling, swaps, fairness | `household`, `notifications` |
| `events` | Fun event planner, date/time voting, majority confirmation, shared calendar | `household`, `notifications` |
| `extras` | Shopping list, meter readings, bin-collection days, fix-it log, noticeboard. Each ships alone | `household`, `ledger` |

## Build order

`foundation` -> `identity` -> `household` -> `notifications` -> `ledger` -> `recurring` -> `rota` -> `events` -> `extras`

### Why this order
- `foundation` to `notifications` is the shared platform. Every later module needs it.
- `ledger` and `recurring` come before `rota`. They are simpler, cover the monthly rent deadline, and prove the scheduler and notification pipeline in production before the rota (the most algorithmically complex module) depends on it.
- `rota` is the largest risk (rotation plus availability plus rescheduling), so it gets the most stable base.
- `events` and `extras` are independent leaf modules and can be reordered freely.
- `rota` and `ledger` do not depend on each other, so swapping them is cheap if priorities change.

## Per-module lifecycle
Each module gets its own `SPEC-<module>.md`, then Plan -> Tasks -> Implement (TDD) -> Review -> Ship, and is released before the next module starts.
