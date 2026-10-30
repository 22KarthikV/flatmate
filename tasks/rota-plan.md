# Plan: rota

Spec: [../docs/SPEC-rota.md](../docs/SPEC-rota.md) (approved 2026-10-30). Design note: [../docs/DESIGN-rota-rebalancing.md](../docs/DESIGN-rota-rebalancing.md). Shared-file rules: [../docs/PARALLEL-WORK.md](../docs/PARALLEL-WORK.md). Style template for process and database work: the ledger (`docs/SPEC-ledger.md`, `tasks/archive`, `supabase/migrations/20261030*.sql`, `supabase/tests`, `src/features/ledger`).

## What we are building

Admins define chores with an effort and a checklist. Each week every flatmate says which days they are around (deadline Saturday 18:00 London, stated in plain words everywhere). When the window closes an hourly job generates next week's rota by a pure, deterministic scheduler. Everyone sees their chores with a one-sentence reason, ticks checklists, swaps, and sees fairness over time. When someone leaves, their future chores are rebuilt by effort, with a 24-hour admin undo. Rota touches no money.

## Ground rules for every task

- One task, one branch, one PR, from the latest `main`. Tests first (pgTAP before the migration, Vitest before pure code). Local checks before the PR: `pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`.
- Migration filenames use only `20261116000000` to `20261130235959`. The hosted database is applied by the orchestrating session, in merge order, before a migration PR merges. This session never applies migrations to hosted.
- Browser role never writes a rota table. Every write is a `security definer` function that derives the caller from `auth.uid()` (`authz.current_profile_id()`).
- No change to ledger or recurring files, `end_memberships_for_account` or `private.can_leave`.
- Shared files get small append-only edits: `nav-items` (a Rota entry already exists), `src/features/notifications/types.ts` plus matching `notification_types` rows, `scripts/bundle-budgets.json` (rota routes only, no budget raised), privacy page and its test, `docs/DEPLOY.md` (a Rota section).
- Defaults to ship: effort Bins 1, Kitchen 3, Living room 4, Bathroom 2, Hallway 1, each its own chore. The availability screen and both nudges state the deadline and the "assumed available every day" consequence in plain words.

## Task order and dependencies

Single session, so tasks are sequential; the spec's parallel columns only matter if subagents are used, and every task below touches migrations or `types.ts`, so none is split off.

| Task | Slice | Delivers                                                                                                                            | Needs        |
| ---- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1    | R1    | Chores and checklist tables, RLS, admin functions, first-flat defaults, `/rota/chores` page, nav/budget/privacy/DEPLOY stubs        | none         |
| 2    | R3    | Pure `week.ts`, `schedule.ts`, `fairness.ts`, `explain.ts` with property tests (no database)                                        | Task 1 shape |
| 3    | R2    | Availability table and functions, window and deadline rules, assumed fill, `/rota/availability`, two nudges and `availability_open` | Tasks 1, 2   |
| 4    | R4a   | Week, assignment, item and rotation_state tables; write functions that store scheduler output; ticking; pgTAP                       | Tasks 1, 2   |
| 5    | R4b   | Hourly generation job (`p_now`), due and overdue reminders, `rota_week_ready`, `chore_*` types, "Generate now"                      | Tasks 3, 4   |
| 6    | R4c   | `/rota`, `/rota/assignments/[id]`, checklist UI, week view ordering, e2e for define, availability, generate, tick                   | Task 5       |
| 7    | R5    | Swap table and functions, admin reassign, swap sheet, notifications                                                                 | Task 6       |
| 8    | R6    | Fairness page from existing rows                                                                                                    | Task 6       |
| 9    | R7a   | Pure `rebalance.ts` with the design note's property tests                                                                           | Task 2       |
| 10   | R7b   | `memberships.left_at` trigger, rebalance job, revisions, undo, notifications, joiners, per-path pgTAP, e2e for leave and undo       | Tasks 6, 9   |
| 11   | R8    | Hosted rollout notes, `docs/DEPLOY.md`, full e2e, owner phone checklist, final report                                               | all          |

## Risks watched while building

- Daylight saving: dates are `date` values in London, never midnight timestamps; `week.ts` tests cover both clock changes.
- Shared local database: the recurring session uses the same Supabase containers, so `db:reset` by either session resets both. Keep resets short and re-run after pulling.
- Deadline wording is a product promise (T5): one shared constant of text used by the page, both nudges and tests.
