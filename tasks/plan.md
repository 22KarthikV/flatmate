# Implementation Plan: household

Spec: [docs/SPEC-household.md](../docs/SPEC-household.md) (approved 2026-10-29; open questions settled on the defaults: cap 20, old owner becomes admin, name only, closed flats kept). Task list: [tasks/todo.md](todo.md). The foundation and identity plans are archived in [tasks/archive](archive/).

## Overview

Create a flat, invite flatmates with one shareable link, manage roles, leave or remove people, and guide the admin with a setup checklist. This module is the tenant boundary for everything after it.

## Architecture decisions

- **Vertical slices, database first inside each slice.** Every task ships one complete path (functions and pgTAP, then the action and screen, then E2E) so the app is usable after each merge. No task is "all the tables".
- **The database enforces the rules.** All writes go through `security definer` functions that derive the caller from `auth.uid()`. Tables have no write policies. The pgTAP suite is the main safety net and grows with each slice.
- **One migration file per slice**, so each can be reviewed and applied to hosted on its own. Types are regenerated each time (CI fails if stale).
- **Keep the app layout session-only.** Flatless people must still reach Account. Pages that need a flat call the cached `getMembership()` and show the `no-flat` screen otherwise.
- **Joining is a POST.** `/join/<token>` previews; a server action joins.
- **Hosted rollout is a task, not an afterthought:** the migrations and the `delete-account` function are applied to the hosted project at the end, with a real two-person check.

```
1 flat + roles data model, create_household, isolation tests
        ├─ 2 create-flat UI, getMembership, no-flat screens
        │       ├─ 3 invite functions ── 4 join flow + invite card
        │       │                            ├─ 5 members list, roles, remove
        │       │                            │        └─ 6 leave, transfer, close
        │       │                            │               └─ 7 account deletion interaction
        │       └─ 8 setup checklist + step registry (needs 4 for its first step)
        └─ all ─ 9 privacy update, full E2E, hosted rollout, device checks
```

## Task list

- [x] Task 1: Flat and membership tables, helpers, `create_household`, isolation tests
- [x] Task 2: Create a flat from Home (UI, `getMembership`, no-flat screens)
- [x] Task 3: Invite functions (create, revoke, preview, join) with tests
- [ ] Task 4: Invite card and join flow (two-person E2E)
- [ ] Task 5: Members list, roles and removal (incl. flatmate profile visibility)
- [ ] Task 6: Leave, transfer ownership, close the flat
- [ ] Task 7: Account deletion interaction
- [ ] Task 8: Setup checklist and step registry
- [ ] Task 9: Privacy notice, full E2E, hosted rollout, device checks

### Checkpoint: Household complete

- [ ] Every success criterion in the spec is met

## Risks

| Risk                                                 | Mitigation                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Policy helpers slow every later query                | One helper pair, partial indexes, `explain` check in Task 1 and again in Task 5          |
| Racing joins or transfers break one-owner or the cap | Partial unique indexes plus row locks; race tests in Tasks 3 and 6                       |
| Profile visibility policy leaks beyond one flat      | Added with the members list (Task 5) and tested from both sides                          |
| Chat-app link previews trigger a join                | Join only on POST; E2E asserts a plain GET changes nothing (Task 4)                      |
| Owner deletes account and strands a flat             | Refusal path built and tested in Task 7                                                  |
| `ledger` forgets the leave hook later                | Hook `private.can_leave` created in Task 6; the ledger spec must list it as a dependency |
| Hosted migration differs from local                  | Task 9 applies via the migration tool and diffs `list_migrations` against the repo       |
| Owner checks from identity are still open            | Tracked as carry-over in `tasks/todo.md`; none of them block this module                 |
