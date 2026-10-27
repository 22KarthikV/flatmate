# Task list: foundation

Plan: [plan.md](plan.md). Spec: [../docs/SPEC-foundation.md](../docs/SPEC-foundation.md).
Commands are defined in the spec. Tests come first for any logic (TDD).

## Phase 1: Shell (no Docker needed)

- [x] **Task 1: Repo and tooling baseline** (Medium, scaffold)
  - Description: `git init`, Next.js + TypeScript (strict) via pnpm, Tailwind, ESLint, Prettier, Vitest + Testing Library, `.gitignore`, `.editorconfig`, `pnpm check` script, commit hook. Versions pinned in lockfile.
  - Acceptance:
    - [ ] `pnpm install && pnpm dev` serves a blank page
    - [ ] `pnpm check` runs lint, typecheck, test, build and passes
    - [ ] A sample Vitest test runs
    - [ ] No secrets or `.env` committed; `.env.example` exists
  - Verify: `pnpm check`
  - Dependencies: none
  - Files: repo root config, `src/app/`, `package.json`

- [x] **Task 2: Design direction decision** (Small, human gate). Decided: neutral, minimal, editorial (Vogue-style), see ADR-004.
  - Description: Build a throwaway preview showing three style options (warm and playful, clean and minimal, bold and colourful) on the same sample screens (rota card, balance summary, checklist). You pick one.
  - Acceptance:
    - [ ] Three options viewable on phone width and desktop
    - [ ] You choose one (or a mix); the choice is recorded in ADR-004 (design direction)
  - Verify: Manual: you review and choose
  - Dependencies: Task 1
  - Files: `docs/adr/004-design-direction.md`, a preview page (removed afterwards)

- [x] **Task 3: Design tokens, motion tokens, UI primitives** (Medium)
  - Description: Colour, type, spacing, radius, shadow tokens (light and dark), `src/lib/motion.ts` easing/duration tokens, primitives (Button, Card, Input, Checkbox, Sheet, Toast, Avatar) built on accessible headless components, and a dev-only `/design` showcase page.
  - Acceptance:
    - [ ] Tokens drive all primitives; dark mode works via `prefers-color-scheme`
    - [ ] Primitives are keyboard accessible with visible focus
    - [ ] Motion tokens collapse to instant under reduced motion (unit tested)
  - Verify: `pnpm test`, manual check of `/design` at 360px and desktop
  - Dependencies: Task 2
  - Files: `src/styles/`, `src/lib/motion.ts`, `src/components/ui/*`, `src/app/design/page.tsx`

- [ ] **Task 4: App shell, navigation, motion and scoped smooth scroll** (Medium)
  - Description: Signed-in layout with bottom nav (mobile) and side nav (desktop), placeholder routes for each module, public layout for landing/sign-in. Lazy-loaded GSAP setup with route/entrance transitions. Lenis only on public pages and desktop. A few curated React Bits components (copied in) with `THIRD_PARTY_NOTICES.md`.
  - Acceptance:
    - [ ] Navigation works at 360px with 44px touch targets and no horizontal scroll
    - [ ] GSAP and Lenis are not in the initial bundle's critical path (lazy)
    - [ ] Reduced motion disables animations and Lenis smoothing (tested)
    - [ ] Each added React Bits component's dependencies are reviewed and noted
  - Verify: `pnpm test`, `pnpm build`, manual check on a phone browser
  - Dependencies: Task 3
  - Files: `src/app/(app)/layout.tsx`, `src/app/(public)/layout.tsx`, `src/components/fx/*`, `src/lib/gsap.ts`, `THIRD_PARTY_NOTICES.md`

- [ ] **Task 5: PWA** (Small to Medium)
  - Description: Web App Manifest, icons (including maskable), service worker with offline fallback page, install guidance for iOS (Share, Add to Home Screen) and Android install prompt. First confirm the service-worker plugin works with the chosen Next.js bundler; otherwise use a small hand-written worker.
  - Acceptance:
    - [ ] Manifest valid; app installable on Android Chrome
    - [ ] Offline page shows when offline
    - [ ] iOS install instructions are shown to iOS Safari users who haven't installed
  - Verify: Lighthouse PWA audit, manual install on Android and iPhone
  - Dependencies: Task 4
  - Files: `public/manifest.webmanifest`, `public/icons/*`, `src/app/sw.ts` (or equivalent), `src/app/offline/page.tsx`

### Checkpoint A: Shell

- [ ] `pnpm check` passes
- [ ] Shell looks right at 360px and desktop in light and dark
- [ ] Review with you before continuing

## Phase 2: Platform quality

- [ ] **Task 6: Typed env, logger, error boundary** (Small)
  - Description: `src/lib/env.ts` (Zod-validated), `src/lib/logger.ts` (structured), root error boundary and not-found page, `/api/health` (app-only for now).
  - Acceptance:
    - [ ] Missing or invalid env vars throw a clear error at startup (tests first)
    - [ ] Logger emits JSON with level, message, context and never logs secrets
    - [ ] `/api/health` returns 200 with app status
  - Verify: `pnpm test`
  - Dependencies: Task 1
  - Files: `src/lib/env.ts`, `src/lib/logger.ts`, `src/app/error.tsx`, `src/app/api/health/route.ts`, tests

- [ ] **Task 7: Playwright smoke tests** (Small)
  - Description: Playwright for Chromium and WebKit with a mobile viewport. Tests: home loads, navigation works, manifest valid, service worker registers, `/api/health` is 200, reduced-motion respected.
  - Acceptance:
    - [ ] `pnpm test:e2e` passes locally on Windows
    - [ ] Mobile and desktop viewports covered
  - Verify: `pnpm test:e2e`
  - Dependencies: Tasks 4, 5, 6
  - Files: `playwright.config.ts`, `e2e/*.spec.ts`

- [ ] **Task 8: CI pipeline and budgets** (Medium)
  - Description: GitHub Actions running lint, typecheck, unit tests, build, Playwright, a bundle-size check (motion adds at most 40 KB gzipped to initial JS) and Lighthouse CI on the shell. Branch protection requires green checks. Needs the GitHub repo.
  - Acceptance:
    - [ ] A PR with a failing check cannot merge
    - [ ] Exceeding the bundle budget fails CI (proved with a deliberate test PR)
    - [ ] CI runtime under ~10 minutes
  - Verify: open a test PR with a passing and a failing change
  - Dependencies: Task 7, GitHub repo
  - Files: `.github/workflows/ci.yml`, `scripts/check-bundle-size.ts`, `lighthouserc.json`

### Checkpoint B: CI

- [ ] Passing PR merges, failing PR blocked
- [ ] Review with you before continuing

## Phase 3: Backend (needs Docker Desktop)

- [ ] **Task 9: Supabase local stack, clients, baseline migration, pgTAP** (Medium)
  - Description: `supabase init`, local stack, browser/server/middleware clients, baseline migration (extensions, `set_updated_at()`, shared enums), `seed.sql`, `db:types` script, one passing pgTAP test.
  - Acceptance:
    - [ ] `pnpm supabase start` and `pnpm supabase db reset` succeed from scratch
    - [ ] `pnpm supabase test db` passes (trigger test)
    - [ ] Generated types compile
    - [ ] Service-role key is never imported in browser code (lint rule or test)
  - Verify: `pnpm supabase db reset && pnpm supabase test db && pnpm typecheck`
  - Dependencies: Task 6, Docker installed
  - Files: `supabase/config.toml`, `supabase/migrations/*`, `supabase/tests/*`, `src/lib/supabase/*`

- [ ] **Task 10: `job_runs` table and `/api/health` DB check** (Small)
  - Description: `job_runs` table (job name, idempotency key unique, status, timestamps) with RLS enabled and no access for anon/authenticated roles. Health endpoint checks the DB.
  - Acceptance:
    - [ ] pgTAP: anon and authenticated cannot read or write `job_runs`
    - [ ] Unique `(job_name, idempotency_key)` enforced
    - [ ] `/api/health` is 200 when the DB is up and 503 when it is down (tested)
  - Verify: `pnpm supabase test db && pnpm test`
  - Dependencies: Task 9
  - Files: `supabase/migrations/*_job_runs.sql`, `supabase/tests/job_runs.test.sql`, `src/app/api/health/route.ts`

- [ ] **Task 11: Scheduler spike** (Medium, highest risk)
  - Description: First verify `pg_cron` and `pg_net` on the hosted free tier. Build a `heartbeat` Edge Function called by `pg_cron`, writing a `job_runs` row with an idempotency key. Document how later modules register jobs.
  - Acceptance:
    - [ ] Heartbeat runs on schedule on a hosted project and writes a row
    - [ ] Triggering twice with the same key creates one row (tested)
    - [ ] Fallback documented if `pg_cron` is unavailable
  - Verify: `pnpm supabase functions serve` plus a test; check `job_runs` on the hosted project
  - Dependencies: Task 10, a hosted Supabase project
  - Files: `supabase/functions/heartbeat/index.ts`, `supabase/migrations/*_heartbeat_cron.sql`, `docs/adr/002-scheduling.md`

### Checkpoint C: Backend

- [ ] `supabase db reset` rebuilds with migrations only
- [ ] DB tests and app tests green
- [ ] Review with you before continuing

## Phase 4: Ship

- [ ] **Task 12: Deploy and verify on real devices** (Medium)
  - Description: Hosted Supabase (London region), Vercel project with previews per PR and production on main, environment variables set, migrations applied via a documented step. Smoke test on a real Android and iPhone.
  - Acceptance:
    - [ ] Production URL loads and installs on Android and iPhone
    - [ ] Lighthouse mobile: Performance >= 90, Accessibility >= 95, PWA installable
    - [ ] Health endpoint healthy in production; heartbeat row appears
    - [ ] No horizontal scroll at 360px
  - Verify: Lighthouse report, manual device check
  - Dependencies: Tasks 8, 11
  - Files: `vercel.json` (if needed), deployment docs

- [ ] **Task 13: Documentation and ADRs** (Small)
  - Description: README (10-minute setup incl. Docker install on Windows), CONTRIBUTING (module lifecycle, definition of done), ADR-001 stack, ADR-002 scheduling, ADR-003 multi-tenancy and RLS, `THIRD_PARTY_NOTICES.md` finalised.
  - Acceptance:
    - [ ] A fresh clone follows the README to a running app without help
    - [ ] ADRs 001 to 004 merged
  - Verify: Walk through the README from a clean clone
  - Dependencies: Task 12
  - Files: `README.md`, `CONTRIBUTING.md`, `docs/adr/*`

### Checkpoint: Foundation complete

- [ ] All spec success criteria met
- [ ] Ready for review; next module is `identity` (spec first)
