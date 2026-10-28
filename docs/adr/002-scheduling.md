# ADR-002: Scheduling with pg_cron, pg_net and Edge Functions

Status: accepted (hosted proof pending, see Verification)
Date: 2026-10-28

## Context

FlatMate needs timed work: rent reminders, bill generation, weekly rota rollover, bin reminders. It has to run on the free tier, be safe to retry, and work the same locally and hosted.

## Decision

- **`pg_cron`** owns the clock. **`pg_net`** makes the HTTP call. An **Edge Function** does the work with the service role.
- Every run records a row in `job_runs` with a unique `(job_name, idempotency_key)`. A second trigger with the same key inserts nothing, so retries and double fires are harmless.
- The cron-to-function call is authenticated with a shared secret in the `x-scheduler-secret` header. The secret and the project URL live in **Vault** (`scheduler_secret`, `project_url`), never in migrations, so one migration serves every environment. Functions check the secret through `public.verify_scheduler_secret()` (service role only). Rotating it is one Vault update, with nothing to redeploy.
- Functions are deployed with `verify_jwt = false` because they authenticate themselves with that secret. (Platform JWT checks do not understand the new secret-key format.)
- Until both Vault secrets exist, `private.invoke_edge_function()` logs a warning and does nothing, so a fresh environment never errors on schedule.

## How a module registers a job

In the module's migration:

```sql
select private.register_edge_job('rent-reminders', '0 9 * * *', 'rent-reminders');
```

Same name replaces the schedule in place. Then add `supabase/functions/<name>/` with a pure `handler.ts` (tested under Vitest, no Deno imports) and a thin `index.ts` that wires real dependencies. Choose an idempotency key that matches the job's cadence (the heartbeat uses the UTC hour).

Local setup: `pnpm exec supabase functions serve --no-verify-jwt`, then create the two Vault secrets with `project_url = http://kong:8000`.

## Verification

- pgTAP covers registration, the unconfigured no-op, secret verification and role access.
- Vitest covers the handler (auth, idempotency, error hiding).
- Locally: two `invoke_edge_function('heartbeat')` calls produced one `job_runs` row; the second response reported `created: false`.
- Hosted: see the task log in `tasks/todo.md`.

## Alternatives considered

- **GitHub Actions scheduled workflow calling the function.** Documented fallback if `pg_cron` ever becomes unavailable. Less precise (can be delayed minutes) and needs the secret in GitHub.
- **Vercel Cron.** Hobby plan limits it to daily jobs.
- **External cron pinger.** Another account to manage for no gain.

## Consequences

- Free-tier projects pause after a week of inactivity; the hourly heartbeat plus real usage keeps them active.
- Jobs run in UTC. Modules convert to Europe/London when deciding "today".
- Secrets must be created once per environment (documented in the deploy task).
