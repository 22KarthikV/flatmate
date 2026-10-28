# Implementation Plan: foundation

Spec: [docs/SPEC-foundation.md](../docs/SPEC-foundation.md) (approved). Task list: [tasks/todo.md](todo.md).
Tasks are tracked in the markdown file, not an external tracker.

## Overview

Deliver the shared platform every FlatMate module plugs into: a deployed, installable, animated app shell, a Supabase backend with a migration and database-test workflow, a proven scheduler, and CI quality gates. No user-facing features yet.

## Architecture decisions

- **Frontend-first, backend second.** Tasks 1 to 8 need no Docker, so work can start now while Docker Desktop is being installed. Backend tasks (9 to 11) start once Docker is available.
- **Design is decided before tokens are fixed.** Task 2 is a human decision gate (three style options). Nothing visual is hardcoded before it.
- **Vertical slices where possible.** Each task leaves the app building and tests green. Scaffold-style tasks (1, 9) touch many generated files, so their "files touched" is a directory rather than a count.
- **Scheduler is proven early (task 11).** It is the riskiest backend assumption (`pg_cron` + Edge Function on the free tier), so it is tested before any module depends on it.
- **Motion is budgeted from the start.** The 40 KB gzipped budget is enforced in CI (task 8) so it can't silently erode.
- **Dependency graph:**

```
1 repo/tooling
 ├─ 2 design direction ─ 3 tokens + primitives ─ 4 app shell (+motion, Lenis) ─ 5 PWA
 ├─ 6 env/logger/errors ─┐
 └─ 7 Playwright smoke ──┴─ 8 CI + budgets
                                   │
 9 Supabase local + baseline ─ 10 job_runs + health ─ 11 scheduler spike
                                   │
                              12 deploy (Vercel + hosted Supabase) ─ 13 docs/ADRs
```

## Task list

### Phase 1: Shell (no Docker needed)

- [x] Task 1: Repo and tooling baseline
- [x] Task 2: Design direction decision
- [x] Task 3: Design tokens, motion tokens, UI primitives
- [x] Task 4: App shell, navigation, motion and scoped smooth scroll
- [x] Task 5: PWA

### Checkpoint A: Shell

- [ ] Installs and builds, all tests green, shell looks right at 360px and desktop, reviewed by you

### Phase 2: Platform quality

- [x] Task 6: Typed env, logger, error boundary
- [ ] Task 7: Playwright smoke tests
- [ ] Task 8: CI pipeline and budgets

### Checkpoint B: CI

- [ ] A pull request runs lint, typecheck, unit, E2E, build and bundle check, and a failing check blocks merge

### Phase 3: Backend (needs Docker)

- [ ] Task 9: Supabase local stack, clients, baseline migration, pgTAP harness
- [ ] Task 10: `job_runs` table and `/api/health` DB check
- [ ] Task 11: Scheduler spike (`pg_cron` to Edge Function)

### Checkpoint C: Backend

- [ ] `supabase db reset` rebuilds from migrations only, DB tests green, heartbeat is idempotent

### Phase 4: Ship

- [ ] Task 12: Deploy to Vercel and hosted Supabase, device and Lighthouse checks
- [ ] Task 13: Documentation and ADRs

### Checkpoint: Foundation complete

- [ ] Every success criterion in the spec is met
- [ ] Ready for review, then `identity` spec

## Risks and mitigations

| Risk                                                                                                  | Impact                | Mitigation                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pg_cron` not available or limited on Supabase free tier                                              | High                  | Task 11 verifies first. Fallback: GitHub Actions scheduled workflow calling an Edge Function, or an external free cron pinging the function. Decision recorded in ADR-002. |
| Serwist (PWA service worker) may not work with the Next.js default bundler                            | Med                   | Task 5 checks compatibility first. Fallback: a small hand-written service worker registered from the app.                                                                  |
| iOS PWA quirks (push needs Home Screen install, storage eviction, OAuth redirects in standalone mode) | Med                   | Install guidance in task 5. Real iPhone check in task 12. OAuth specifics are tested in `identity`.                                                                        |
| Animation hurting performance on mid-range phones                                                     | Med                   | Lazy loading, 40 KB budget in CI, 60 fps device check, reduced-motion support. Heavy effects dropped.                                                                      |
| Docker Desktop on Windows needs WSL2/virtualisation                                                   | Med                   | Phase 1 and 2 don't need it. Install guide in README.                                                                                                                      |
| Supabase free project pauses after a week idle                                                        | Low (once used daily) | Heartbeat job keeps it active. Noted in ADR-002.                                                                                                                           |
| React Bits components pull in extra heavy dependencies                                                | Low                   | Each component's dependencies reviewed before adding (Ask-first rule).                                                                                                     |
| Reference style unknown                                                                               | Low                   | Task 2 presents three options.                                                                                                                                             |

## Open questions

1. GitHub repo (needed by task 8) and the hosted Supabase project (needed by task 12): who creates them, and which GitHub account?
2. Apps or sites whose look you like. Your last message ended after "look I like:" with nothing listed. Add them any time before task 2, or I'll go with three neutral options.
3. Project name and URL: keep "FlatMate" and the free `*.vercel.app` address?
4. One hosted Supabase project or separate staging and production?
