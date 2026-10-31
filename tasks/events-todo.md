# Task list: events

Plan: [events-plan.md](events-plan.md). Spec: [../docs/SPEC-events.md](../docs/SPEC-events.md). Tests come first (pgTAP before each migration, Vitest before pure code).

- [x] **Task E1: Tables, rule and schemas**
  - Migration `20261141000000_events.sql`: `events`, `event_options`, `event_votes`, indexes, RLS (members read, nobody writes), vote guard trigger, organiser/household immutability guard.
  - `majority.ts` + `parity-vectors.ts` + `schemas.ts` + tests; privacy section and test case; DEPLOY stub.
  - Acceptance: pgTAP `events-schema` (RLS, isolation, constraints, no realtime); Vitest vectors and properties.
  - Verify: `pnpm check && pnpm db:reset && pnpm db:test && pnpm db:types`

- [x] **Task E2: Writes, voting and the screens**
  - Migration `20261142000000_events_write.sql`: eight notification types, `propose_event`, `update_event`, `add_event_option`, `remove_event_option`, `cast_event_vote`, `cancel_event`, `decide_event_tie`, `events_tally`, `events_evaluate`, `events_confirm`.
  - `/events`, `/events/new`, `/events/[id]`, `/events/[id]/edit`, actions, errors, format, bundle budgets.
  - Acceptance: pgTAP `events-voting`; Vitest for format, errors, components.

- [x] **Task E3: Hourly job and membership changes**
  - Migration `20261143000000_events_schedule.sql`: `events_run`, `run_events_hourly`, cron `events-hourly` at minute 47, membership trigger (join notifies, leave re-evaluates and hands over).
  - Acceptance: pgTAP `events-schedule` and `events-membership`.

- [x] **Task E4: Calendar**
  - `/events/calendar`, `calendar.ts`, `calendar-model.ts` with privacy tests, link from `/events`.

- [x] **Task E5: End to end and rollout**
  - `e2e/events.spec.ts` for a three-person flat, DEPLOY phone checklist, final report.

## Progress notes

- E1 (PR 83, migration `20261141000000_events.sql`): tables, RLS, guard triggers, the majority rule in TypeScript with shared vectors, form schemas, privacy section. E2 (this PR, migration `20261142000000_events_write.sql`, stacked on E1): the eight notification types, the write functions and the one place the rule lives (`events_evaluate`, `events_decide`), `/events`, `/events/new`, `/events/[id]`, `/events/[id]/edit`, voting by plain server-action forms (no client JS for the buttons), and the first e2e. Next: E3 (job and membership trigger) and E4 (calendar).

- E3 (migration `20261143000000_events_schedule.sql`, stacked on E2): hourly `events-hourly` job at minute 47 (deadline, 48h auto-pick, tie and vote reminders, event reminders), membership join/leave triggers with organiser hand-over. E4 (no migration, PR from a subagent): `/events/calendar`. Next: E5, e2e and rollout notes.
- E5 (this PR, no migration, includes E4 until #85 merges): e2e journey extended with the calendar and 360px checks; DEPLOY.md events job and phone checklist. Full e2e: 184 passed; 6 account-deletion specs fail locally because the delete-account Edge Function is not served here (unrelated).
