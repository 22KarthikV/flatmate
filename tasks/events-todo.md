# Task list: events

Plan: [events-plan.md](events-plan.md). Spec: [../docs/SPEC-events.md](../docs/SPEC-events.md). Tests come first (pgTAP before each migration, Vitest before pure code).

- [x] **Task E1: Tables, rule and schemas**
  - Migration `20261141000000_events.sql`: `events`, `event_options`, `event_votes`, indexes, RLS (members read, nobody writes), vote guard trigger, organiser/household immutability guard.
  - `majority.ts` + `parity-vectors.ts` + `schemas.ts` + tests; privacy section and test case; DEPLOY stub.
  - Acceptance: pgTAP `events-schema` (RLS, isolation, constraints, no realtime); Vitest vectors and properties.
  - Verify: `pnpm check && pnpm db:reset && pnpm db:test && pnpm db:types`

- [ ] **Task E2: Writes, voting and the screens**
  - Migration `20261142000000_events_write.sql`: eight notification types, `propose_event`, `update_event`, `add_event_option`, `remove_event_option`, `cast_event_vote`, `cancel_event`, `decide_event_tie`, `events_tally`, `events_evaluate`, `events_confirm`.
  - `/events`, `/events/new`, `/events/[id]`, `/events/[id]/edit`, actions, errors, format, bundle budgets.
  - Acceptance: pgTAP `events-voting`; Vitest for format, errors, components.

- [ ] **Task E3: Hourly job and membership changes**
  - Migration `20261143000000_events_schedule.sql`: `events_run`, `run_events_hourly`, cron `events-hourly` at minute 47, membership trigger (join notifies, leave re-evaluates and hands over).
  - Acceptance: pgTAP `events-schedule` and `events-membership`.

- [ ] **Task E4: Calendar**
  - `/events/calendar`, `calendar.ts`, `calendar-model.ts` with privacy tests, link from `/events`.

- [ ] **Task E5: End to end and rollout**
  - `e2e/events.spec.ts` for a three-person flat, DEPLOY phone checklist, final report.

## Progress notes
