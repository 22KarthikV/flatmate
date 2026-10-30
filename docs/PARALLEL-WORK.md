# Parallel module work: `recurring` and `rota`

Status: in force (both module specs approved by the owner, 2026-10-30). Read before touching anything shared. The owner chose automatic merges when CI is green; the orchestrator pauses only for hosted migrations (it applies them) and Edge Function deploys (the owner deploys).

Because rent is private (members never see each other's rent), `recurring` keeps rent in its own tables and does not touch the ledger's tables or functions. Only variable and fixed bills go through the ledger's writer.

## Roles

| Who            | Does                                                                                                                                                                             | Never does                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Orchestrator   | Writes specs and plans, starts the module sessions, answers their questions, applies migrations to the hosted database in merge order, decides merge order, reports to the owner | Writes module code                                                                                |
| Module session | Builds one module, one task at a time, in its own worktree and branch. One PR per task, merged when CI is green                                                                  | Applies migrations to the hosted database, deploys Edge Functions, edits the other module's files |
| Subagent       | Does one independent sub-task for its module session (for example pgTAP tests, or a UI component once the data shape is fixed)                                                   | Touches a file another running agent touches                                                      |

A subagent is used only when its files are disjoint from everything else in flight. Anything sequential stays in the module session.

## Rules for shared things

| Shared thing                                                                 | Rule                                                                                                                                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted database                                                              | One project, so one writer. A module session writes and tests migrations locally, then asks the orchestrator to apply them after the PR is green and before it is merged. Applied in merge order. |
| Migration filenames                                                          | `recurring` uses timestamps `20261101…` to `20261115…`. `rota` uses `20261116…` to `20261130…`. Neither module uses the other's range.                                                            |
| `src/lib/db/types.ts` (generated)                                            | Never edited by hand and never conflict-resolved by hand. After a rebase, regenerate it.                                                                                                          |
| `src/features/notifications/types.ts` and `notification_types` rows          | Append-only. Each module adds its own types, with its own prefix (`rent_`, `bill_` / `chore_`, `rota_`). Whoever merges second rebases.                                                           |
| `src/features/shell/nav.tsx`                                                 | One entry per module, added in the module's first PR. Whoever merges second rebases.                                                                                                              |
| `scripts/bundle-budgets.json`                                                | Each module adds only its own routes.                                                                                                                                                             |
| Privacy page and `privacy-matches-data` test                                 | Each module adds its own rows to the data list in its own PR. Whoever merges second rebases.                                                                                                      |
| `docs/DEPLOY.md`                                                             | Each module appends its own section, never edits another's.                                                                                                                                       |
| Edge Functions                                                               | Deployed by the owner from a terminal. A module that needs one says so in its PR and in its final report.                                                                                         |
| `pg_cron` jobs                                                               | Each module registers its own job with a unique name and a different minute, so they never run together.                                                                                          |
| Leave and removal hooks (`end_memberships_for_account`, `private.can_leave`) | Both modules may need to hook in. The orchestrator owns that change and does it in one small PR, before either module needs it.                                                                   |

## Merge loop (per task)

1. Branch from the latest `main`, one task per branch, tests first.
2. Local checks all green (lint, typecheck, unit, pgTAP for the module, build).
3. PR opened. If it has a migration, the module session messages the orchestrator, which applies it to the hosted database and repairs the version in `schema_migrations`.
4. CI green: merge. If the other module merged first, rebase, regenerate types, re-run checks, then merge.
5. Tick the task in the module's own `tasks/<module>-todo.md`.

Each module keeps its own plan and todo files (`tasks/recurring-plan.md`, `tasks/recurring-todo.md`, `tasks/rota-plan.md`, `tasks/rota-todo.md`) so the two never edit the same task file.

## Stop and ask

A module session stops and messages the orchestrator when:

- it needs to change a file the other module owns, or a shared hook;
- a test it did not write starts failing after a rebase;
- the spec turns out to be wrong or ambiguous;
- it would weaken a test, a constraint or a bundle budget to get green.

The orchestrator stops and asks the owner when a spec decision changes, when a migration cannot be applied cleanly, or when the two modules turn out to overlap more than planned.

## Reporting

Each module session ends every task with a one-paragraph note: what merged, what is next, anything blocked. The orchestrator turns those into a short status for the owner and does not wait for the owner between tasks.
