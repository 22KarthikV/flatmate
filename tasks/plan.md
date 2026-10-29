# Implementation Plan: notifications

Spec: [docs/SPEC-notifications.md](../docs/SPEC-notifications.md) (approved 2026-10-29; email deferred, no quiet hours, joined/left inbox only, push library chosen in Task 6). Task list: [tasks/todo.md](todo.md). Earlier plans are archived in [tasks/archive](archive/).

## Overview

One way for any module to tell a person something: a notification row written in the same transaction as the event, shown in an inbox with a live bell, and optionally delivered as a phone push through an outbox and worker. The first real events come from `household`, which proves the pipeline before `ledger` depends on it.

## Architecture decisions

- **Inbox first, push last.** Tasks 1 to 5 deliver a complete, useful in-app feature with no push code. Push (Tasks 6 and 7) is added on top and can fail without affecting the inbox.
- **Database first inside each slice,** as in household: pgTAP before the migration, then the action and screen, then E2E. One migration file per slice so each can be applied to hosted on its own.
- **Only `private.notify` writes notifications.** The browser can read its own rows and call `mark_read`, `mark_all_read`, `snooze`. Nothing else.
- **Dedupe is a unique key,** `(recipient_id, dedupe_key)`, and the outbox has `(notification_id, subscription_id)` unique, so retries can never duplicate.
- **Defaults live in code** (`types.ts`); a saved preference row overrides them. No migration is needed to add a type's defaults, only the type's check-constraint entry.
- **Reuse, don't invent:** the Realtime pattern from `LiveFlat` (set auth, lazy import, debounced refresh), the heartbeat/`job_runs` pipeline for scheduling, the `authz` schema for any policy helper.
- **Bundle budgets are not raised.** The live bell listener is lazily imported.
- **Rollout rule (unchanged):** apply each migration to hosted before merging code that needs it; deploy Edge Functions after their migration.

```
1 data model, notify(), registry, isolation tests
      ├─ 2 inbox page + bell (server-rendered count)
      │       ├─ 3 household events -> notifications (join, leave, remove, role)
      │       │        └─ 4 live bell (Realtime)
      │       └─ 5 preferences + snooze
      └─ 6 push client: service worker, subscribe, settings card (needs 5)
              └─ 7 deliver-push worker, outbox drain, retention job (needs 6)
                      └─ 8 account deletion, privacy notice, hosted rollout, phone checks
```

## Task list

- [x] Task 1: Tables, `private.notify`, read/snooze functions, type registry, isolation tests
- [x] Task 2: Inbox page and bell
- [x] Task 3: Household events create notifications
- [ ] Task 4: Live bell (no navigation needed)
- [ ] Task 5: Preferences and snooze
- [ ] Task 6: Push on the device (service worker, subscribe, settings card, library choice)
- [ ] Task 7: `deliver-push` worker, outbox drain, retention
- [ ] Task 8: Account deletion, privacy notice, hosted rollout, phone checks

### Checkpoint: after Task 5 (inbox complete)

- [ ] A flatmate joining shows in the other members' inbox and live bell; preferences and snooze work; `pnpm check`, `pnpm db:test`, `pnpm test:e2e` green. Push is still absent, and that is fine to ship.

### Checkpoint: Notifications complete

- [ ] Every success criterion in the spec is met

## Risks

| Risk                                                    | Mitigation                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| iPhone push only works for the installed app            | Inbox is the source of truth; install guidance in Task 6; phone check is a ship criterion in Task 8 |
| Push library does not run on Deno or is unmaintained    | Task 6 starts with a small spike against the real runtime; owner confirms the choice before adding  |
| Duplicate or lost notifications                         | Unique dedupe key and outbox pair; row commits with the event; delivery is separate and idempotent  |
| Household function changes in Task 3 regress join/leave | Existing household pgTAP and E2E suites must stay green; new assertions added beside them           |
| Realtime inbox adds bundle weight                       | Lazy import (Task 4); budgets checked in CI                                                         |
| VAPID private key leaks                                 | Secret store only; generation script prints, never writes; rotation documented in `docs/DEPLOY.md`  |
| Worker down or push service rate-limits                 | Outbox waits and drains later; backoff and attempt cap; `job_runs` shows gaps                       |
| Cross-flat leak through notification text               | `notify` checks the recipient belongs to the household; text built only from that flat's own data   |
| Owner checks from identity and household are still open | Carried over in `tasks/todo.md`; none block this module                                             |
