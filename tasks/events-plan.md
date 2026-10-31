# Plan: events

Spec: [../docs/SPEC-events.md](../docs/SPEC-events.md) (approved, all owner defaults accepted). Shared-file rules: [../docs/PARALLEL-WORK.md](../docs/PARALLEL-WORK.md). Style templates: the rota (`tasks/rota-plan.md`, `supabase/migrations/2026111*`, `src/features/rota`).

## What we are building

Anyone proposes an event with 2 to 8 dates. Everyone votes yes, maybe or no on each date. The moment one date has more than half of the current members saying yes (`yes * 2 > N`) it is confirmed. Otherwise the best-supported date wins at the voting deadline; a tie goes to the organiser (auto-picked after 48 hours); no yes at all cancels the event. A shared calendar shows confirmed events beside my chores, bill names and dates, my own "rent is due" (no amount), and the rota deadline. Reminders run from one hourly pg_cron job.

## Ground rules for every task

- One task, one branch, one PR, from the latest `main`. Tests first (pgTAP before each migration, Vitest before pure code). Local checks before every PR: `pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`.
- Migrations only in `20261141000000`..`20261160000000`. This session never applies a migration to the hosted database and never merges a PR: each turn ends with a merge request (PR numbers and migration files) for the orchestrator.
- Local database lock: `mkdir C:/Users/karth/AppData/Local/Temp/flatmate-db.lock` before `db reset` or `db test`, `rmdir` after. The extras session shares the stack.
- The browser role never writes an events table. Every write is a `security definer` function that takes the caller from `authz.current_profile_id()` and locks the event row before counting.
- Push text is fixed and generic. No amounts anywhere. Rent only through `my_rent()` and never an amount on the calendar.
- Cron job `events-hourly` at minute 47. No Edge Function, no new env var, no new dependency.
- No edits to ledger, recurring, rota files, `end_memberships_for_account`, `private.can_leave`, nav, or the Home page. Home gets a separate final PR agreed with the orchestrator.
- Shared files: append-only edits to `src/features/notifications/types.ts` (eight `event_` types), `scripts/bundle-budgets.json` (four routes at 200, none raised), privacy page and test, `docs/DEPLOY.md`. `src/lib/db/types.ts` is regenerated with `pnpm db:types`, never hand-merged.
- Next.js here differs from older versions: read `node_modules/next/dist/docs` before writing pages. Pages read request data inside `Suspense` under `RequireFlat`; `params` and `searchParams` are promises.

## Task order

| Task | Slice                                                                                                                                        | Migration                            | Needs  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| E1   | Tables, constraints, RLS, guard trigger; `majority.ts` and parity vectors; `schemas.ts`; privacy section and test; DEPLOY stub; pgTAP schema | `20261141000000_events.sql`          | none   |
| E2   | Write functions, `events_evaluate`, eight notification types; `/events`, `/events/new`, `/events/[id]`, edit; actions; budgets; pgTAP voting | `20261142000000_events_write.sql`    | E1     |
| E3   | Hourly job, tiebreak, reminders; membership join/leave trigger with organiser hand-over; pgTAP schedule and membership                       | `20261143000000_events_schedule.sql` | E2     |
| E4   | `/events/calendar`, `calendar.ts`, `calendar-model.ts`, privacy tests, link from `/events`. No migration                                     | none                                 | E2     |
| E5   | e2e journey for a three-person flat, DEPLOY phone checklist, final report                                                                    | none                                 | E3, E4 |

E3 (SQL) and E4 (TypeScript, no SQL) touch different files, so E4 can go to a subagent once E2's types are in. Everything that touches a migration, `notification_types` or `types.ts` stays in this session, one writer at a time.

## Risks watched

- Two votes at once: event row lock, `events_evaluate` only moves `voting` forward, pgTAP double-call test.
- Rule drift between screen and database: one rule in SQL, TypeScript vectors copied into pgTAP.
- Clock changes: times stored `timestamptz`, shown `Europe/London`; format tests cross both changes.
- Bundle: server components for list and calendar; vote buttons tiny client form; lazy event form.
