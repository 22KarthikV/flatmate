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

- [ ] **Task 4: Week, assignment and rotation tables (R4a)**

- [ ] **Task 5: Generation job, reminders, Generate now (R4b)**

- [ ] **Task 6: Rota pages and checklist UI (R4c)**

- [ ] **Task 7: Swaps and admin reassign (R5)**

- [ ] **Task 8: Fairness view (R6)**

- [ ] **Task 9: Pure rebalance (R7a)**

- [ ] **Task 10: Leaver trigger, rebuild, undo, joiners (R7b)**

- [ ] **Task 11: Checkpoint (R8)**

## Progress notes

- Task 1 merged (PR 54, migration `20261116000000_rota.sql` applied to hosted): chore tables, admin-only write functions, the usual five defaults and `/rota/chores`. Task 2 (PR 55) adds the pure scheduler, week helpers, fairness and explanations with property tests; no migration. Next: Task 3, availability.
- Task 3 merged (PR 58, migration `20261117000000_rota_availability.sql` applied to hosted): availability table, deadline rules, assumed fill, nudges and the hourly `rota-availability` job. Task 4 (PR below) adds the week, assignment, checklist-snapshot and rotation tables with the write and tick functions. Next: Task 5, generation. That needs the scheduler (TypeScript) to run on a schedule, which means an Edge Function; see the PR.
