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

- [x] **Task 4: App shell, navigation, motion and scoped smooth scroll** (Medium)
  - Description: Signed-in layout with bottom nav (mobile) and side nav (desktop), placeholder routes for each module, public layout for landing/sign-in. Lazy-loaded GSAP setup with route/entrance transitions. Lenis only on public pages and desktop. A few curated React Bits components (copied in) with `THIRD_PARTY_NOTICES.md`.
  - Acceptance:
    - [ ] Navigation works at 360px with 44px touch targets and no horizontal scroll
    - [ ] GSAP and Lenis are not in the initial bundle's critical path (lazy)
    - [ ] Reduced motion disables animations and Lenis smoothing (tested)
    - [ ] Each added React Bits component's dependencies are reviewed and noted
  - Verify: `pnpm test`, `pnpm build`, manual check on a phone browser
  - Dependencies: Task 3
  - Files: `src/app/(app)/layout.tsx`, `src/app/(public)/layout.tsx`, `src/components/fx/*`, `src/lib/gsap.ts`, `THIRD_PARTY_NOTICES.md`

- [x] **Task 5: PWA** (Small to Medium). Serwist skipped: hand-written `public/sw.js` (offline fallback and immutable-asset caching only).
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

- [x] **Task 6: Typed env, logger, error boundary** (Small)
  - Description: `src/lib/env.ts` (Zod-validated), `src/lib/logger.ts` (structured), root error boundary and not-found page, `/api/health` (app-only for now).
  - Acceptance:
    - [ ] Missing or invalid env vars throw a clear error at startup (tests first)
    - [ ] Logger emits JSON with level, message, context and never logs secrets
    - [ ] `/api/health` returns 200 with app status
  - Verify: `pnpm test`
  - Dependencies: Task 1
  - Files: `src/lib/env.ts`, `src/lib/logger.ts`, `src/app/error.tsx`, `src/app/api/health/route.ts`, tests

- [x] **Task 7: Playwright smoke tests** (Small). 84 passing, 9 intentionally skipped (WebKit service worker, browser-independent health checks run once).
  - Description: Playwright for Chromium and WebKit with a mobile viewport. Tests: home loads, navigation works, manifest valid, service worker registers, `/api/health` is 200, reduced-motion respected.
  - Acceptance:
    - [ ] `pnpm test:e2e` passes locally on Windows
    - [ ] Mobile and desktop viewports covered
  - Verify: `pnpm test:e2e`
  - Dependencies: Tasks 4, 5, 6
  - Files: `playwright.config.ts`, `e2e/*.spec.ts`

- [x] **Task 8: CI pipeline and budgets** (Medium)
  - Description: GitHub Actions running lint, typecheck, unit tests, build, Playwright, a bundle-size check (motion adds at most 40 KB gzipped to initial JS) and Lighthouse CI on the shell. Branch protection requires green checks. Needs the GitHub repo.
  - Acceptance:
    - [x] A PR with a failing check cannot merge (PR #1: GitHub reported `BLOCKED` and refused a merge without `--admin`)
    - [x] Exceeding the bundle budget fails CI (PR #1: landing page initial JS 205 KB vs 195 KB budget, and GSAP in the initial load; only the `check:bundle` step failed)
    - [x] CI runtime under ~10 minutes (slowest job 3m18s)
  - Verify: open a test PR with a passing and a failing change
  - Dependencies: Task 7, GitHub repo
  - Files: `.github/workflows/ci.yml`, `scripts/check-bundle-size.ts`, `lighthouserc.json`

### Checkpoint B: CI

- [x] Passing PR merges (PR #2), failing PR blocked (PR #1)
- [x] Review with you before continuing

## Phase 3: Backend (needs Docker Desktop)

- [x] **Task 9: Supabase local stack, clients, baseline migration, pgTAP** (Medium)
  - Description: `supabase init`, local stack, browser/server/proxy clients (Next 16 renamed middleware to `proxy.ts`), baseline migration (`set_updated_at()`; extensions and enums arrive with the modules that first need them), `seed.sql`, `db:types` script, one passing pgTAP test, and a CI database job.
  - Acceptance:
    - [x] `pnpm supabase start` and `pnpm supabase db reset` succeed from scratch
    - [x] `pnpm supabase test db` passes (trigger test, 5 assertions)
    - [x] Generated types compile
    - [x] Service-role key is never imported in browser code (guard test scans `src/`)
  - Verify: `pnpm supabase db reset && pnpm supabase test db && pnpm typecheck`
  - Dependencies: Task 6, Docker installed
  - Files: `supabase/config.toml`, `supabase/migrations/*`, `supabase/tests/*`, `src/lib/supabase/*`

- [x] **Task 10: `job_runs` table and `/api/health` DB check** (Small). Health probe is a `public.health_ping()` RPC (constant `true`), so no table access is exposed.
  - Description: `job_runs` table (job name, idempotency key unique, status, timestamps) with RLS enabled and no access for anon/authenticated roles. Health endpoint checks the DB.
  - Acceptance:
    - [x] pgTAP: anon and authenticated cannot read or write `job_runs`
    - [x] Unique `(job_name, idempotency_key)` enforced
    - [x] `/api/health` is 200 when the DB is up and 503 when it is down (tested)
  - Verify: `pnpm supabase test db && pnpm test`
  - Dependencies: Task 9
  - Files: `supabase/migrations/*_job_runs.sql`, `supabase/tests/job_runs.test.sql`, `src/app/api/health/route.ts`

- [x] **Task 11: Scheduler spike** (Medium, highest risk). Proven on the hosted project 2026-10-28: pg_cron fired, one job_runs row, repeat returned created:false.
  - Description: First verify `pg_cron` and `pg_net` on the hosted free tier. Build a `heartbeat` Edge Function called by `pg_cron`, writing a `job_runs` row with an idempotency key. Document how later modules register jobs.
  - Acceptance:
    - [x] Heartbeat runs on schedule on a hosted project and writes a row
    - [x] Triggering twice with the same key creates one row (tested)
    - [x] Fallback documented if `pg_cron` is unavailable
  - Verify: `pnpm supabase functions serve` plus a test; check `job_runs` on the hosted project
  - Dependencies: Task 10, a hosted Supabase project
  - Files: `supabase/functions/heartbeat/index.ts`, `supabase/migrations/*_heartbeat_cron.sql`, `docs/adr/002-scheduling.md`

### Checkpoint C: Backend

- [x] `supabase db reset` rebuilds with migrations only
- [x] DB tests and app tests green
- [ ] Review with you before continuing

## Phase 4: Ship

- [ ] **Task 12: Deploy and verify on real devices** (Medium). Live at https://flatmate-ten.vercel.app; docs/DEPLOY.md. Real-device install check still to do.
  - Description: Hosted Supabase (London region), Vercel project with previews per PR and production on main, environment variables set, migrations applied via a documented step. Smoke test on a real Android and iPhone.
  - Acceptance:
    - [ ] Production URL loads and installs on Android and iPhone
    - [x] Lighthouse mobile on production: / perf 99, a11y 100; /dashboard perf 96, a11y 100
    - [x] Health endpoint healthy in production (app + database ok); heartbeat row appears (Task 11)
    - [ ] No horizontal scroll at 360px
  - Verify: Lighthouse report, manual device check
  - Dependencies: Tasks 8, 11
  - Files: `vercel.json` (if needed), deployment docs

- [x] **Task 13: Documentation and ADRs** (Small). A fresh clone installed and built following the README steps.
  - Description: README (10-minute setup incl. Docker install on Windows), CONTRIBUTING (module lifecycle, definition of done), ADR-001 stack, ADR-002 scheduling, ADR-003 multi-tenancy and RLS, `THIRD_PARTY_NOTICES.md` finalised.
  - Acceptance:
    - [x] A fresh clone follows the README to a running app without help
    - [x] ADRs 001 to 004 merged
  - Verify: Walk through the README from a clean clone
  - Dependencies: Task 12
  - Files: `README.md`, `CONTRIBUTING.md`, `docs/adr/*`

### Checkpoint: Foundation complete

- [ ] All spec success criteria met
- [ ] Ready for review; next module is `identity` (spec first)
