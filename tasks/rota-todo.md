# Task list: rota

Plan: [rota-plan.md](rota-plan.md). Spec: [../docs/SPEC-rota.md](../docs/SPEC-rota.md). Tests come first (pgTAP before each migration, Vitest before pure code).

- [x] **Task 1: Chores and checklists (R1)**
  - Migration `20261116000000_rota.sql`: `chores`, `chore_checklist_items`, RLS (members read, nobody writes), admin-only functions `save_chore`, `archive_chore`, `load_default_chores`; `households.availability_deadline` is added in Task 3.
  - Acceptance: pgTAP isolation (flat A vs B, anon, browser role cannot write), only admins edit chores, defaults load once with efforts Bins 1 / Kitchen 3 / Living room 4 / Bathroom 2 / Hallway 1, cadence/effort/length checks; Vitest schemas and chore form; `/rota/chores` admin page; `/rota` budget route entries; privacy and DEPLOY stubs.
  - Verify: `pnpm check && pnpm db:reset && pnpm db:test && pnpm db:types`

- [x] **Task 2: Pure scheduler (R3)**
  - `week.ts`, `schedule.ts`, `fairness.ts`, `explain.ts`, property tests (determinism, no unavailable assignment, nothing lost, effort gap bound, long-run coverage, owed turn honoured, DST).
  - Verify: `pnpm test`

- [x] **Task 3: Availability (R2)**
  - Migration, functions, window/deadline rules, assumed fill, `/rota/availability`, deadline sentence constant, nudges, `availability_open` and `availability_nudge` types.

- [x] **Task 4: Week, assignment and rotation tables (R4a)**

- [x] **Task 5: Generation job, reminders, Generate now (R4b)**

- [x] **Task 6: Rota pages and checklist UI (R4c)**

- [x] **Task 7: Swaps and admin reassign (R5)**

- [x] **Task 8: Fairness view (R6)**

- [x] **Task 9: Pure rebalance (R7a)**

- [x] **Task 10: Leaver trigger, rebuild, undo, joiners (R7b)**

- [ ] **Task 11: Checkpoint (R8)**

## Progress notes

- Task 1 merged (PR 54, migration `20261116000000_rota.sql` applied to hosted): chore tables, admin-only write functions, the usual five defaults and `/rota/chores`. Task 2 (PR 55) adds the pure scheduler, week helpers, fairness and explanations with property tests; no migration. Next: Task 3, availability.
- Task 3 merged (PR 58, migration `20261117000000_rota_availability.sql` applied to hosted): availability table, deadline rules, assumed fill, nudges and the hourly `rota-availability` job. Task 4 (PR below) adds the week, assignment, checklist-snapshot and rotation tables with the write and tick functions. Next: Task 5, generation. That needs the scheduler (TypeScript) to run on a schedule, which means an Edge Function; see the PR.
- Task 4 merged (PR 63, migration `20261118000000_rota_weeks.sql` applied): week, assignment, snapshot and rotation tables, the store function and ticking. Task 5 (this PR): the generation inputs and store functions for the service role, the `rota-generate` Edge Function (needs the owner to deploy it), chore due and overdue reminders, and "Give out a week now". Next: Task 6, the `/rota` and assignment pages.
- Task 5 merged (PR 67, migration `20261119000000_rota_schedule.sql` applied; the owner deploys the `rota-generate` Edge Function). Task 6 (this PR, no migration): `/rota`, the assignment page, checklist ticking and the first rota end-to-end test, which found and fixed a real bug in Generate now. Next: Task 7, swaps and admin reassign.
- Task 6 merged (PR 68, no migration): the rota page, assignment page, checklist ticking and the first e2e. Task 7 (this PR, migration `20261120000000_rota_swaps.sql`): swap requests (with optional exchange), accept, decline, withdraw, and admin reassign with their name on it; nothing is rewritten, the old assignment is marked replaced. Next: Task 8, the fairness view.
- Task 7 merged (PR 69, migration `20261120000000_rota_swaps.sql` applied): swap requests, accept/decline/withdraw, admin reassign. Task 8 (this PR, no migration): the read-only fairness page at `/rota/fairness` with 4 week, 12 week and 6 month periods, computed from the stored rows. Next: Task 9, the pure rebalance function, then Task 10, the leaver trigger, rebuild and undo.
- Task 8 and Task 9 merged (PRs 70 and 71, no migrations): the fairness page and the pure `rebalanceAfterLeave`. Task 10 (this PR, migration `20261121000000_rota_leaving.sql`): a trigger on `memberships.left_at` records a rebuild for leave, removal and account deletion (pgTAP proves each); the rota-generate Edge Function (also run every ten minutes by `rota-rebalance`) applies it with the pure rebalance; each moved chore is a new assignment linked to the old one with ticks carried, chores within 24 hours or started are locked, admins see "After someone left" with a 24-hour undo that puts chores back with whoever they were taken from if that person is still here, joiners start at the flat's average load. The owner must redeploy `rota-generate`. Next: Task 11, the checkpoint.
