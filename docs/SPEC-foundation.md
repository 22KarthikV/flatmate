# Spec: foundation

Module id: `foundation` (depends on: none). Status: DRAFT, awaiting approval.
Parent docs: [REQUIREMENTS.md](REQUIREMENTS.md), [CAPABILITY-MAP.md](CAPABILITY-MAP.md).

## Objective

Build the empty but production-grade shell every later module plugs into: a deployed, installable, tested, CI-checked PWA connected to a Supabase project, with a migration workflow and a database test harness already working. No user-facing features yet.

**Who it's for:** the developer (and future contributors). The end user sees only an installable app shell.

**Success looks like:** a new module can be started by adding a migration, a feature folder and tests, with no setup decisions left open.

### User stories

- As the developer, I can run the whole stack locally with one command so I can build offline.
- As the developer, every push is built, linted, type-checked and tested automatically, and a failing check blocks merging.
- As the developer, I can change the database only through reviewed migrations, and a test proves tenant isolation can be checked at the database level.
- As a flatmate, I can open the URL on my Android or iPhone, install it to the Home Screen, and see an app shell that looks right at phone width.

## Assumptions (correct me)

1. Next.js (App Router) + TypeScript, deployed to Vercel Hobby. Supabase (Postgres, Auth, Edge Functions) is the backend. Exact versions are pinned in the lockfile when scaffolding and recorded in ADR-001.
2. Scheduled jobs (reminders, monthly bills, weekly rota) run from **Supabase `pg_cron` + Edge Functions**, not Vercel Cron. Reason: Vercel Hobby cron runs at most once a day with up to a ±59 minute window, which is too coarse for reminders. I will verify `pg_cron` is available on the free Supabase tier during task 1.
3. Local development uses the Supabase CLI, which needs Docker Desktop on Windows.
4. Package manager: pnpm. Node LTS.
5. Source control: this folder is **not yet a git repository**. `foundation` initialises git, and CI assumes a GitHub remote.
6. Supabase project region: London (`eu-west-2`) for UK GDPR and latency.
7. Free-tier limits checked today (verify again before launch): Supabase Free is 500 MB database, 50,000 monthly active users, 5 GB egress, 1 GB storage, 500,000 Edge Function invocations, 200 concurrent realtime connections, 2 free projects, and projects pause after 1 week of inactivity. Pro starts at $25/month.

## Tech stack

| Concern                | Choice                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Framework              | Next.js (App Router), React, TypeScript (`strict`)                                                                |
| Styling                | Tailwind CSS, CSS variables for design tokens, dark mode via `prefers-color-scheme`                               |
| UI primitives          | Accessible headless components (Radix UI / shadcn pattern)                                                        |
| Data/Auth client       | `@supabase/supabase-js`, `@supabase/ssr`                                                                          |
| Validation             | Zod, shared between forms and server actions                                                                      |
| PWA                    | Web App Manifest + service worker (Serwist), offline app shell                                                    |
| Motion                 | GSAP + `@gsap/react` (`useGSAP`), lazy-loaded; plugins only as needed (Flip, SplitText, ScrollTrigger)            |
| Smooth scroll          | Lenis, scoped to the landing/sign-in pages and desktop only (see Motion section)                                  |
| Animated components    | Selected React Bits components, copied into `src/components/fx/` via the shadcn registry (TS + Tailwind variants) |
| Unit/integration tests | Vitest + Testing Library                                                                                          |
| DB tests               | `supabase test db` (pgTAP)                                                                                        |
| E2E                    | Playwright (Chromium + WebKit, with a mobile viewport)                                                            |
| Lint/format            | ESLint + Prettier                                                                                                 |
| CI                     | GitHub Actions                                                                                                    |
| Hosting                | Vercel (app), Supabase (database, auth, functions)                                                                |

## Commands

```
Install:        pnpm install
Dev (app):      pnpm dev
Dev (backend):  pnpm supabase start          # local Postgres, Auth, Studio (needs Docker)
Stop backend:   pnpm supabase stop
Build:          pnpm build
Type check:     pnpm typecheck               # tsc --noEmit
Lint:           pnpm lint
Format:         pnpm format                  # prettier --write .
Unit tests:     pnpm test                    # vitest run
Unit (watch):   pnpm test:watch
Coverage:       pnpm test -- --coverage
DB tests:       pnpm supabase test db        # pgTAP
New migration:  pnpm supabase migration new <name>
Apply locally:  pnpm supabase db reset       # re-applies all migrations + seed
Gen DB types:   pnpm db:types                # supabase gen types typescript --local > src/lib/db/types.ts
E2E:            pnpm test:e2e                # playwright test
All checks:     pnpm check                   # lint + typecheck + test + build
```

## Project structure

```
src/
  app/                  Next.js routes (App Router). Thin: compose features, no business logic.
    (public)/           Signed-out pages
    (app)/              Signed-in shell: layout, bottom nav, placeholders per module
    api/health/         Health endpoint
  features/<module>/    One folder per capability-map module (components, actions, queries, domain)
  components/ui/        Shared UI primitives
  lib/
    supabase/           Browser/server/middleware clients
    db/                 Generated DB types
    env.ts              Typed, validated environment variables
    logger.ts           Structured logging
  styles/               Tokens and global CSS
supabase/
  migrations/           Timestamped SQL migrations (the only way the schema changes)
  tests/                pgTAP tests (RLS, constraints)
  functions/            Edge Functions (scheduler workers, added by later modules)
  seed.sql              Local-only fixtures
public/                 Manifest, icons
e2e/                    Playwright tests
docs/                   REQUIREMENTS, CAPABILITY-MAP, SPEC-*, ADRs
docs/adr/               Architecture decision records
tasks/                  plan.md, todo.md
.github/workflows/      CI
```

## Code style

TypeScript strict, named exports, no `any`. Domain logic is pure functions, separate from I/O so it is trivially unit-testable. Files are `kebab-case`, components `PascalCase`, SQL objects `snake_case`.

```ts
// src/features/ledger/domain/split-equally.ts
/** Splits `totalPence` across `userIds` so shares always sum exactly to the total. */
export function splitEqually(totalPence: number, userIds: readonly string[]): Map<string, number> {
  if (!Number.isInteger(totalPence) || totalPence < 0)
    throw new RangeError("totalPence must be a non-negative integer");
  if (userIds.length === 0) throw new RangeError("userIds must not be empty");

  const base = Math.floor(totalPence / userIds.length);
  let remainder = totalPence - base * userIds.length;
  const sorted = [...userIds].sort(); // deterministic remainder assignment
  return new Map(sorted.map((id) => [id, base + (remainder-- > 0 ? 1 : 0)]));
}
```

(Example of the style only. The ledger module owns this code.)

SQL conventions: every household-owned table has `household_id uuid not null`, `created_at timestamptz not null default now()`, RLS enabled in the same migration that creates the table, and an index on `(household_id, ...)`.

## Scope of this module

1. **Repository and tooling:** git init, `.gitignore`, `.editorconfig`, pnpm workspace, ESLint, Prettier, strict `tsconfig`, commit hooks for lint/format.
2. **App shell:** Next.js app with a responsive layout (360px and up), a bottom navigation (mobile) and side navigation (desktop) with placeholder pages for each future module, light/dark theme, and design tokens.
   2a. **Design system and motion:** three style options for you to choose from, then design tokens, shared motion tokens, a lazy-loaded GSAP setup, Lenis scoped to public pages, a curated set of React Bits components, a `/design` page that shows every component (dev only), and `THIRD_PARTY_NOTICES.md`.
3. **PWA:** manifest (name, icons incl. maskable, theme colours), service worker with an offline fallback page, install prompt guidance for iOS (Share -> Add to Home Screen).
4. **Backend wiring:** Supabase local stack, env handling (`.env.example`, validated typed env), server/browser/middleware Supabase clients, no secrets in the repo.
5. **Database workflow:** migrations folder, a baseline migration (extensions, a `set_updated_at` trigger function, shared enums), seed file, generated types, pgTAP harness with one passing sample test.
6. **Scheduler spike:** prove `pg_cron` -> Edge Function works with a no-op `heartbeat` job writing to a `job_runs` table. Document how later modules register jobs, with idempotency keys.
7. **Quality gates:** Vitest, Playwright (home page loads, manifest is valid, mobile viewport screenshot), GitHub Actions running `pnpm check`, DB tests and E2E on every PR.
8. **Observability baseline:** structured logger, error boundary, `/api/health` (app + DB check), client error reporting hook (no third-party service yet).
9. **Deployment:** Vercel project (preview per PR, production on main), Supabase hosted project, documented env variables, migration deploy step.
10. **Documentation:** README (setup in 10 minutes), ADR-001 (stack), ADR-002 (scheduling with pg_cron), ADR-003 (multi-tenancy and RLS approach), CONTRIBUTING (module lifecycle and definition of done).

**Out of scope:** auth screens and sign-in (`identity`), any household tables (`household`), notification delivery (`notifications`).

## Motion and visual design

Direction: a warm, playful-premium look. Rounded cards, generous spacing, one confident accent colour, a distinct colour per flatmate, and motion that rewards actions (ticking a checklist item, settling a debt) without getting in the way. The visual direction is confirmed with you in task 2 (three short style options to pick from) before the design tokens are fixed.

### Libraries (licences checked from the upstream repos)

| Library    | Licence                                                                                                                                                                                                                                                        | Use here                                                                                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GSAP       | Free for commercial use under Webflow's standard licence, including formerly paid plugins (SplitText, Flip, ScrollTrigger). The only restriction that matters: not embedding it in a visual animation builder that competes with Webflow. FlatMate is not one. | Page and route transitions, list stagger, checklist tick animation, balance count-ups, Flip for rota swaps/reordering                                                                                                                                                                                             |
| Lenis      | MIT                                                                                                                                                                                                                                                            | Smooth scroll on the landing and sign-in pages and on desktop. **Not** inside the signed-in mobile app, modals, sheets or long lists, where native touch scroll, pull-to-refresh and iOS rubber-banding must stay untouched. Lenis keeps native touch scrolling by default and honours reduced motion by default. |
| React Bits | MIT + Commons Clause. Free to use inside an app, even commercially. Not allowed to resell or redistribute the components themselves. Copyright notice must be kept.                                                                                            | Copy in a small curated set (text reveals, count-up numbers, micro-interactions, one light background for sign-in). Avoid heavy WebGL backgrounds on in-app screens. Notices recorded in `THIRD_PARTY_NOTICES.md`.                                                                                                |

### Motion rules

1. Animate `transform` and `opacity` only. Nothing that triggers layout.
2. Durations 150 to 400 ms for UI feedback, up to 700 ms for page-level moments. Shared easing tokens in `src/lib/motion.ts`.
3. `prefers-reduced-motion` is respected everywhere. Animations collapse to instant state changes, and Lenis smoothing is off.
4. Animation libraries load lazily, after first paint. Initial JS added by motion must stay within a 40 KB gzipped budget (measured in CI with a bundle-size check).
5. Motion never blocks interaction, and nothing animated is the only way to convey information (colour/motion always paired with text or icon).
6. Test on a mid-range Android and an iPhone. If a effect drops below 60 fps there, it is removed or simplified.

## Testing strategy

| Level     | Tool                     | What it covers in this module                                                                                                              |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit      | Vitest                   | `env.ts` validation (missing/invalid vars throw), logger formatting, any pure helpers                                                      |
| Component | Vitest + Testing Library | App shell renders nav, theme toggle, and offline page                                                                                      |
| DB        | pgTAP                    | Baseline migration applies cleanly from empty, `set_updated_at` trigger works, `job_runs` is write-protected from anon/authenticated roles |
| E2E       | Playwright               | Home page loads at mobile and desktop size, `manifest.webmanifest` valid, service worker registers, `/api/health` returns 200              |
| CI        | GitHub Actions           | All of the above plus lint, typecheck and build on every PR                                                                                |

Coverage expectation: no numeric target for scaffolding code, but every pure function has a test. Domain modules later target at least 90% on pure domain logic. Per-module constraints can be pinned with the constraints skill when you want them enforced.

## Boundaries

- **Always:** write tests before domain logic; make every schema change a migration; enable RLS in the migration that creates a table; validate all input with Zod; keep secrets in env variables; run `pnpm check` before committing.
- **Ask first:** adding any dependency beyond the stack above (including more React Bits components that pull in WebGL libraries such as three/ogl); changing CI config; any paid service or plan upgrade; changing region; anything that alters the module order.
- **Never:** commit secrets or `.env` files; edit schema through the Supabase dashboard (migrations only); disable RLS; skip or delete failing tests without approval; use the service-role key in browser code; use floating point for money.

## Success criteria

1. `git clone` -> `pnpm install` -> `pnpm supabase start` -> `pnpm dev` works from the README alone.
2. `pnpm check`, `pnpm supabase test db` and `pnpm test:e2e` all pass locally and in CI, and a failing check blocks merge.
3. The deployed URL loads in Android Chrome and iPhone Safari without horizontal scroll at 360px, and installs to the Home Screen with correct name and icon.
4. Lighthouse (mobile) on the deployed shell: Performance >= 90, Accessibility >= 95, PWA installable.
5. `supabase db reset` rebuilds the database from migrations only, with no manual steps.
6. The `heartbeat` job runs on schedule in the hosted project and writes a row to `job_runs`, and running it twice for the same key does not duplicate.
7. `/api/health` reports healthy when the DB is up and unhealthy when it is not.
   8a. With `prefers-reduced-motion` on, no animation plays and Lenis smoothing is disabled. Motion adds no more than 40 KB gzipped to the initial JS, and the Lighthouse targets above still hold with animations enabled.
8. No secrets exist in git history, and `.env.example` lists every variable.
9. ADR-001 to ADR-003 and CONTRIBUTING are merged.

## Open questions

1. **GitHub:** do you have (or want me to help you create) a GitHub repo for CI and Vercel previews?
2. **Docker Desktop:** not installed yet, and you will install it. It is required before the local Supabase tasks (task 4 onwards). Earlier tasks do not need it.
3. **Project name and domain:** keep "FlatMate", and do you want a custom domain later, or is the free `*.vercel.app` URL fine for now?
4. **Environments:** one hosted Supabase project is enough on the free tier (2 free projects allowed). Do you want a separate staging and production project, or one hosted project plus local development?
5. **Visual identity:** you have no fixed reference, so I will present three style options in task 2 for you to pick from. Name any apps or sites whose look you like and I will steer the options toward them.
