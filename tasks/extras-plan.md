# Plan: extras

Spec: [../docs/SPEC-extras.md](../docs/SPEC-extras.md) (approved, all defaults accepted). Shared-file rules: [../docs/PARALLEL-WORK.md](../docs/PARALLEL-WORK.md). Style template: the rota (`tasks/rota-plan.md`, `supabase/migrations/20261116*.sql`, `src/features/rota`).

## What we are building

Five small, independent tools, shipped one after another, each live before the next starts: **A shopping list, B bin days, E noticeboard, D fix-it log, C meter readings** (owner's order). House rules are pinned noticeboard posts; there is no activity feed; no photos.

## Ground rules for every task

- One task, one branch, one PR, tests first (pgTAP before the migration, Vitest before pure code). Local checks: `pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`. Take the shared database lock (`mkdir C:/Users/karth/AppData/Local/Temp/flatmate-db.lock`, `rmdir` after) around reset and test.
- Migration filenames only in `20261161000000`..`20261200999999` (ranges per tool in the spec). Hosted database is applied by the orchestrator in merge order; this session never applies it and never runs `gh pr merge`.
- Browser role never writes a table; every write is a `security definer` function with `set search_path = ''` that derives the caller from `authz.current_profile_id()`.
- Push text is fixed and generic; no amounts, meter values, post text or problem text in a push.
- Cron minutes: `shopping-retention` `22 3 * * *`, `bins-reminders` `27 * * * *`, `board-retention` `37 3 * * *`, `fix-stale` `32 9 * * *`. No job for meters.
- Shared files get small append-only edits (More page row, `notifications/types.ts` + `notification_types` rows, `bundle-budgets.json` at 200, privacy page rows + test, `docs/DEPLOY.md` section). `src/lib/db/types.ts` is regenerated, never hand-merged. The home page is not touched here.
- 360px check and no raised budget for every screen.

## Tool order and PRs

Each tool: **X1** migrations + pgTAP + regenerated types; **X2** pure logic, readers, actions, screens, More row, budgets; **X3** e2e, privacy rows, DEPLOY phone checklist. Stacked PRs retarget to `main` after the base merges.

| Tool          | Slice set                  | Migrations    | Needs                                |
| ------------- | -------------------------- | ------------- | ------------------------------------ |
| A shopping    | X1 db, X2 app, X3 e2e/docs | 161, 162, 163 | ledger writer (exists)               |
| B bins        | same                       | 169, 170      | none                                 |
| E noticeboard | same                       | 193, 194      | none                                 |
| D fix-it log  | same                       | 185, 186, 187 | none (no photos; 192 stays reserved) |
| C meters      | same                       | 177, 178      | none                                 |

## Deliberate small deviation

Shopping's buy screen must reuse the ledger's `ExpenseForm`. That component posts to a fixed action, so A-X2 adds two optional props to it (`action`, `hidden`), defaults unchanged. Flagged to the orchestrator in the PR (spec: "ask first" for ledger file edits).

## Risks watched

- Shared local database with the events session: reset/test only under the lock.
- London clock: dates are `date`, reminders decided by London hour; tests step through both clock changes.
- Bundle budget: buy page loads the expense form lazily if it nears 200 KB.
