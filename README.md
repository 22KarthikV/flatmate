# FlatMate

A free, installable web app (PWA for Android and iPhone) for people who share a home: a strict-rotation cleaning rota, rent and recurring bills, shared expenses with who-owes-whom, and a majority-vote event planner. English and GBP only. Built for one flat of five first, designed so thousands of households can use it later.

Live: https://flatmate-ten.vercel.app

Status: the **foundation** module (app shell, PWA, CI, database workflow, scheduler) is complete. Feature modules follow in this order: identity, household, notifications, ledger, recurring, rota, events, extras. See [docs/CAPABILITY-MAP.md](docs/CAPABILITY-MAP.md) and [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Stack

Next.js 16 (App Router) and React 19, TypeScript (strict), Tailwind CSS 4, Supabase (Postgres 17, Auth, Edge Functions, `pg_cron`), Vercel, pnpm. Details and reasons: [ADR-001](docs/adr/001-stack.md).

## Run it locally (about 10 minutes)

### 1. Install the tools

| Tool           | Version | Notes                                                           |
| -------------- | ------- | --------------------------------------------------------------- |
| Node.js        | 24 LTS  | https://nodejs.org                                              |
| pnpm           | 12+     | `npm install -g pnpm` (or `corepack enable`)                    |
| Git            | any     | https://git-scm.com                                             |
| Docker Desktop | latest  | Needed only for the local database. See the Windows note below. |

**Docker Desktop on Windows.** Install from https://www.docker.com/products/docker-desktop, keep "Use WSL 2" ticked, and restart when asked. Virtualisation must be on in your BIOS if Docker reports it is missing. Open Docker Desktop once and wait until it says "Engine running" before the next step.

### 2. Get the code and start everything

```bash
git clone https://github.com/22KarthikV/flatmate.git
cd flatmate
pnpm install
pnpm db:start
```

`pnpm db:start` pulls the Supabase images the first time (a few minutes), then prints the local API URL and the publishable key.

### 3. Configure the app

```bash
cp .env.example .env.local
```

On Windows PowerShell use `Copy-Item .env.example .env.local`. Open `.env.local` and paste the `PUBLISHABLE_KEY` printed by `pnpm db:start` into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The URL default already points at the local stack. Run `pnpm exec supabase status` to print the values again.

### 4. Start the app

```bash
pnpm dev
```

Open http://localhost:3000. Check http://localhost:3000/api/health: both `app` and `database` should say `ok`.

## Everyday commands

| Command                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `pnpm dev`             | Dev server                                                      |
| `pnpm check`           | Lint, types, formatting, unit tests, build, bundle budget       |
| `pnpm test`            | Unit tests (Vitest)                                             |
| `pnpm test:e2e`        | End-to-end tests (Playwright; needs the local database running) |
| `pnpm db:start / stop` | Start or stop the local Supabase stack                          |
| `pnpm db:reset`        | Rebuild the local database from migrations and `seed.sql`       |
| `pnpm db:test`         | Database tests (pgTAP)                                          |
| `pnpm db:types`        | Regenerate `src/lib/db/types.ts` after a migration              |

First time with Playwright: `pnpm exec playwright install chromium webkit`.

## Project layout

```
src/app/            routes: (public) pages, (app) signed-in shell, api/
src/features/       one folder per feature module (shell, pwa, health, ...)
src/components/     ui/ primitives, fx/ animation helpers
src/lib/            env, logger, motion tokens, Supabase clients
supabase/           config, migrations/, tests/ (pgTAP), functions/ (Edge Functions)
docs/               requirements, specs, ADRs, deployment guide
tasks/              plan and task list for the module in progress
e2e/                Playwright tests
```

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md): how a module is built and what "done" means
- [docs/DEPLOY.md](docs/DEPLOY.md): Vercel, hosted Supabase, scheduler secrets
- Decisions: [001 stack](docs/adr/001-stack.md), [002 scheduling](docs/adr/002-scheduling.md), [003 multi-tenancy and RLS](docs/adr/003-multi-tenancy-rls.md), [004 design direction](docs/adr/004-design-direction.md)

## Troubleshooting

- **`Missing environment variables`**: `.env.local` is missing or the key is empty. Redo step 3.
- **`/api/health` returns 503**: the database is not running (`pnpm db:start`) or the key is wrong.
- **Docker errors on `db:start`**: Docker Desktop is not running yet. Wait for "Engine running".
- **Port already in use**: stop the other process, or `pnpm db:stop` and start again.

Third-party code and licences: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
