# ADR-001: Technology stack

Status: accepted
Date: 2026-10-28

## Context

FlatMate must be free to run, installable on Android and iPhone, quick on mid-range phones, and able to grow from one flat to thousands of households without a rewrite. One developer maintains it.

## Decision

| Concern         | Choice                                                     | Why                                                                                 |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| App framework   | Next.js 16 (App Router) with React 19 and TypeScript       | One codebase for pages, server logic and API routes; strong PWA and Vercel support  |
| Styling         | Tailwind CSS 4 with CSS-variable design tokens             | Small output, tokens drive light and dark mode ([ADR-004](004-design-direction.md)) |
| Primitives      | Radix UI                                                   | Accessible headless components (keyboard, focus, ARIA)                              |
| Motion          | GSAP and Lenis, lazy-loaded; React Bits components copied  | The motion the owner wants, within a 40 KB gzipped budget enforced in CI            |
| Backend         | Supabase (Postgres 17, Auth, Edge Functions)               | Free tier, real SQL and RLS for tenant isolation, Google sign-in built in           |
| Scheduling      | `pg_cron` + `pg_net` + Edge Functions                      | See [ADR-002](002-scheduling.md)                                                    |
| Hosting         | Vercel (app), Supabase (data), GitHub (code, CI)           | All have a free tier; previews per pull request                                     |
| PWA             | Hand-written service worker, Web App Manifest              | Serwist was skipped: the need is small (offline page, immutable asset cache)        |
| Validation      | Zod                                                        | One schema language for env, forms and server writes                                |
| Package manager | pnpm                                                       | Fast, strict, reproducible lockfile                                                 |
| Tests           | Vitest + Testing Library, pgTAP, Playwright, Lighthouse CI | Unit, database, end-to-end and performance gates in CI                              |

The app talks to the database with the user's own session and the publishable key, so row-level security does the protecting ([ADR-003](003-multi-tenancy-rls.md)). The service-role key is used only inside Edge Functions.

## Alternatives considered

- **Native apps (Swift/Kotlin, React Native):** two stores, fees and review delays; a PWA covers the needs (push on iOS requires Home Screen install, noted in the install guidance).
- **Firebase:** document model makes balances, splits and constraints harder than SQL.
- **Self-hosted Postgres plus a custom API:** more to run and secure for one developer.
- **Serwist for the service worker:** extra build plugin for little gain here.

## Consequences

- Free-tier limits apply (database size, egress, function invocations, projects pause after a week idle). Thousands of users should be expected to need Supabase Pro ([REQUIREMENTS](../REQUIREMENTS.md) section 7).
- Next.js 16 differs from earlier versions (`proxy.ts` replaces middleware, Cache Components). `AGENTS.md` tells contributors to read the bundled docs before writing framework code.
- Heavy dependencies need approval and a licence note.
