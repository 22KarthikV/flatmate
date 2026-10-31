# Plan: home page

Spec: [../docs/SPEC-home.md](../docs/SPEC-home.md) (approved, owner decisions at the end). Shared-file rules: [../docs/PARALLEL-WORK.md](../docs/PARALLEL-WORK.md). Style: [rota-plan.md](rota-plan.md), [recurring-plan.md](recurring-plan.md).

## What we are building

`/dashboard` becomes the daily view. Server-rendered blocks, each reading what other modules already hold, each with its own loading placeholder and calm error line. No migration, no new stored data, no forms on the page. Rent stays private: a member only ever sees their own rent via `my_rent()`.

## Ground rules

- One task, one branch, one PR, from the latest `main`. Tests first (Vitest). No pgTAP: there is no database change. If a migration ever looks necessary, stop and ask the orchestrator (range 20261131..20261140).
- Pure decision logic lives in plain files (`waiting.ts`, `coming-up.ts`, `chores.ts`, `money-line.ts`) with tests; blocks are thin.
- `HomeBlock` takes a `load` function and a pure `render`. Loading and rendering both sit inside a try/catch, so a failed read gives one error line (`home.<block>_failed` logged) and never breaks the page. A `null` from a reader counts as a failure.
- No bundle budget or Lighthouse threshold is changed. No client JavaScript is added (the retry link is a plain anchor).
- Decision: when nothing waits on the viewer, the "Waiting on you" slot shows "Nothing needs you right now." instead of being hidden, so the page never looks empty or broken. Chore completion adds no extra message.
- Bill amounts on Coming up are not shown: bill months carry sharers by name only, so the viewer's own share cannot be told apart safely. The bill's name and due date are shown; the amount is one tap away in Money.

## Tasks

| Task | Delivers                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| 1    | Plan and todo, `HomeBlock`, page shell (header line, checklist, new-flat invite card), "Waiting on you"           |
| 2    | Your chores, your rent, owe/owed line, Coming up, Recent                                                          |
| 3    | Admin extras, "add your chores" lines, page-title test, privacy check, `e2e/home.spec.ts`, DEPLOY phone checklist |
