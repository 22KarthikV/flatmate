# Deployment

| Piece    | Where                                   | Trigger                                         |
| -------- | --------------------------------------- | ----------------------------------------------- |
| App      | Vercel project `flatmate` (Hobby)       | Push to `main` = production; every PR = preview |
| Database | Supabase project `flatmate` (eu-west-2) | Migrations applied by hand (below)              |
| Jobs     | `pg_cron` on the same Supabase project  | Registered by migrations (ADR-002)              |

## Environment variables (Vercel, Production and Preview)

| Name                                   | Value                               |
| -------------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_...` key        |
| `LOG_LEVEL`                            | `info`                              |

Only the publishable key ever goes into Vercel. Service-role or secret keys never do (a test enforces this for `src/`).

## Applying migrations to the hosted project

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push
```

If migrations were applied through the dashboard or an MCP tool, their versions differ from the files; run `supabase migration repair` before `db push`. (The foundation migrations were aligned on 2026-10-28, and the five household migrations on 2026-10-29, by updating `supabase_migrations.schema_migrations` to the file versions.)

Order matters when a change touches both the database and an Edge Function: apply the migrations first, then deploy the function (`delete-account` calls `end_memberships_for_account`). Application code that reads new tables is deployed by Vercel from `main`, so apply migrations before merging, or expect the new screens to show "no flat" until you do.

## Per-environment scheduler secrets

Once per environment, in the SQL editor (never in a migration):

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'scheduler_secret');
```

Then deploy the function: `supabase functions deploy heartbeat --no-verify-jwt`.

## Push notifications

Push needs a VAPID key pair, made once with `pnpm vapid:generate` (it prints; it writes nothing). The two halves go to different places:

| Half    | Where                                                                                              | Why                                        |
| ------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Public  | Vercel env `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Production and Preview), and `.env.local` for local use | Browsers need it to subscribe. Not secret. |
| Private | Supabase secret `VAPID_PRIVATE_KEY`, never the repo, Vercel or any `NEXT_PUBLIC_` variable         | It signs every push the worker sends.      |

The worker also needs the public key and a contact address as secrets. One command sets all three (the script prints it ready to paste):

```bash
pnpm exec supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:<your address> --project-ref <project-ref>
```

Roll out in this order: migrations first (`claim_push_outbox`, `complete_push`, the two cron jobs), then the secrets, then `supabase functions deploy deliver-push --no-verify-jwt`, then the Vercel variable and a redeploy. Until the secrets exist the function answers 503 and claims nothing, so queued pushes just wait and nothing is lost; the in-app inbox is unaffected either way.

**Rotating the keys** invalidates every existing subscription: the push service rejects the old ones, the worker removes them as "gone", and each device re-subscribes the next time the app is opened. Update the Supabase secrets and the Vercel variable together, then redeploy both. Do this only if the private key may have leaked.

**Checking it locally** (Docker and `pnpm db:start` running): `node scripts/local-push-check.mts` serves `deliver-push` in the real Edge runtime and proves it authenticates, claims queued pushes, signs a request with `web-push`, and records retries. It cannot show a push being accepted, because the local runtime only trusts public certificates; status handling is covered by the unit tests.

**Watching it in production:** a `deliver-push` row should appear in `job_runs` every minute, and `notification-retention` once a day (03:17 UTC). A gap in `deliver-push` rows means the worker or the scheduler is down. Rows stuck in `push_outbox` with `next_attempt_at = 'infinity'` are pushes that were given up on after four attempts; the notification itself is still in the person's inbox.

## After a deploy

- `GET /api/health` returns 200 with `app` and `database` both `ok`.
- A `heartbeat` row appears in `job_runs` within the hour.
- A `deliver-push` row appears in `job_runs` within the minute (once the function is deployed and the scheduler secrets exist).
