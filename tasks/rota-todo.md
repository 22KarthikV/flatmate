# Task list: rota

Plan: [rota-plan.md](rota-plan.md). Spec: [../docs/SPEC-rota.md](../docs/SPEC-rota.md). Tests come first (pgTAP before each migration, Vitest before pure code).

- [ ] **Task 1: Chores and checklists (R1)**
  - Migration `20261116000000_rota.sql`: `chores`, `chore_checklist_items`, RLS (members read, nobody writes), admin-only functions `save_chore`, `archive_chore`, `load_default_chores`; `households.availability_deadline` is added in Task 3.
  - Acceptance: pgTAP isolation (flat A vs B, anon, browser role cannot write), only admins edit chores, defaults load once with efforts Bins 1 / Kitchen 3 / Living room 4 / Bathroom 2 / Hallway 1, cadence/effort/length checks; Vitest schemas and chore form; `/rota/chores` admin page; `/rota` budget route entries; privacy and DEPLOY stubs.
  - Verify: `pnpm check && pnpm db:reset && pnpm db:test && pnpm db:types`

- [ ] **Task 2: Pure scheduler (R3)**
  - `week.ts`, `schedule.ts`, `fairness.ts`, `explain.ts`, property tests (determinism, no unavailable assignment, nothing lost, effort gap bound, long-run coverage, owed turn honoured, DST).
  - Verify: `pnpm test`

- [ ] **Task 3: Availability (R2)**
  - Migration, functions, window/deadline rules, assumed fill, `/rota/availability`, deadline sentence constant, nudges, `availability_open` and `availability_nudge` types.

- [ ] **Task 4: Week, assignment and rotation tables (R4a)**

- [ ] **Task 5: Generation job, reminders, Generate now (R4b)**

- [ ] **Task 6: Rota pages and checklist UI (R4c)**

- [ ] **Task 7: Swaps and admin reassign (R5)**

- [ ] **Task 8: Fairness view (R6)**

- [ ] **Task 9: Pure rebalance (R7a)**

- [ ] **Task 10: Leaver trigger, rebuild, undo, joiners (R7b)**

- [ ] **Task 11: Checkpoint (R8)**
