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

**Checking it locally** (Docker and `pnpm db:start` running): `node scripts/local-push-check.mts` serves `deliver-push` in the real Edge runtime and proves it authenticates, claims queued pushes, signs a request with `web-push`, and records retries. It cannot show a push being accepted, because the local runtime only trusts public certificates; status handling is covered by the unit tests. The check borrows the local stack's function runtime and removes it when it finishes, so afterwards run `pnpm db:stop && pnpm db:start` to bring the stack's own functions (including `delete-account`, which the end-to-end tests use) back.

**Watching it in production:** a `deliver-push` row should appear in `job_runs` every minute, and `notification-retention` once a day (03:17 UTC). A gap in `deliver-push` rows means the worker or the scheduler is down. Rows stuck in `push_outbox` with `next_attempt_at = 'infinity'` are pushes that were given up on after four attempts; the notification itself is still in the person's inbox.

### Rollout order for notifications

1. Migrations, in order, to the hosted project (`supabase db push`, or the migration tool followed by `migration repair`): `notifications`, `household_notifications`, `push_delivery`, `account_deletion_notifications`. Apply before merging the pull request that needs them.
2. VAPID secrets in Supabase, then `supabase functions deploy deliver-push --no-verify-jwt`.
3. Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for Production and Preview, then redeploy.
4. `delete-account` does **not** need redeploying: removing a deleted person's notification data happens inside the database function it already calls (`anonymise_profile`), in the same transaction.
5. Compare `list_migrations` with `supabase/migrations/`, and run the Supabase security and performance advisors. The only new findings should be the intended ones: security-definer functions in `public` that only the service role (or signed-in people, for the inbox functions) can run.

### Phone checks (owner, once, on real devices)

The automated tests fake the push service, so this is the first time a push is truly accepted. Use a second account as the admin.

- [ ] **Android (Chrome):** open the site, install the app, open Settings, Notifications, tap "Turn on push on this device" and allow. The device appears under "Your devices" with "This device".
- [ ] **iPhone (iOS 16.4 or later):** in Safari the page explains Add to Home Screen and shows no switch. After installing from Share, Add to Home Screen and opening the Home Screen app, "Turn on push" appears and works.
- [ ] Close the app completely. From another account (an owner or admin), make the phone's account an admin. Within a minute or two a push arrives: "You are now an admin".
- [ ] Tap the push: the app opens on Your flat.
- [ ] With push on for two devices, remove one under "Your devices". The other still receives pushes.
- [ ] Turn "Your role changes" off for push, repeat the role change: the notification appears in the inbox but no push arrives.
- [ ] Delete a throwaway account that had push on: its device disappears, and no push is delivered afterwards.

If a push never arrives, check in this order: `deliver-push` rows in `job_runs` every minute; the person's `push_outbox` row (`attempts`, `last_error`, `next_attempt_at`); that the device row has no `failed_at`; and the function logs on the Supabase dashboard (they show a status code, never the endpoint).

## After a deploy

- `GET /api/health` returns 200 with `app` and `database` both `ok`.
- A `heartbeat` row appears in `job_runs` within the hour.
- A `deliver-push` row appears in `job_runs` within the minute (once the function is deployed and the scheduler secrets exist).
