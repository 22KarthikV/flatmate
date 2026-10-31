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

## Money (ledger)

**Rollout order** for each ledger migration (`ledger`, `ledger_expenses`, `ledger_settlements`, `ledger_leaving`): apply it to the hosted project before merging the pull request that needs it, then fix the recorded version (the migration tool stamps its own timestamp) so `list_migrations` matches `supabase/migrations/`.

**`delete-account` must be redeployed after `ledger_leaving`** (`supabase functions deploy delete-account --no-verify-jwt`). Until it is, nothing unsafe happens: the database refuses to delete an account with money open by raising `open_balance`, and the older function treats any error as a failure and deletes nothing, so the person only sees the general "couldn't delete your account, nothing has been lost" message instead of "settle up first". Deploying it first is also safe, since before the migration it behaves exactly as before.

**Things to know**

- Balances are never stored; they are summed from the expense, share and settlement rows every time, and always add up to zero.
- Nothing in the ledger is deleted or rewritten. A correction voids the old expense and adds a new one; a payment is decided once.
- **Reminders:** a `ledger-reminders` row should appear in `job_runs` once a day (08:00 UTC): it nudges people who have owed over £1 for their flat's interval (owners and admins choose never, 3, 7 or 14 days on Your flat) and reminds receivers of payments waiting 2 days or more (once a day, three times at most). Running it twice in a day does nothing.
- Push text for money types is fixed in the database (`notification_types.push_title` and `push_body`), so no amount reaches a lock screen. `deliver-push` is unchanged.
- A flatmate who is removed with money open stays listed under "Former flatmates". If they are owed money, a payment to them can be recorded and another admin (not the payer) confirms it on their behalf. If they **owe** money there is no way to close it yet: it stays on the books until a decision is made about writing debts off.

### Phone checks for money (owner, once)

- [ ] Add an expense on one phone: the other phone's bell rises and a push arrives that shows **no amount** on the lock screen; the inbox shows the amount.
- [ ] Record a payment on one phone, confirm it from the push on the other: both balances move.
- [ ] A flatmate who owes money sees why they cannot leave, and cannot delete their account (after `delete-account` is redeployed) until they have settled.

## After a deploy

- `GET /api/health` returns 200 with `app` and `database` both `ok`.
- A `heartbeat` row appears in `job_runs` within the hour.
- A `deliver-push` row appears in `job_runs` within the minute (once the function is deployed and the scheduler secrets exist).

## Rota

**Rollout order** for each rota migration (`rota`, `rota_availability`, `rota_weeks`, `rota_schedule`, `rota_swaps`, `rota_leaving`, `rota_away`): the orchestrating session applies it to the hosted project before the pull request that needs it merges, then fixes the recorded version so `list_migrations` matches `supabase/migrations/`.

**Things to know**

- Chores and checklists are templates only admins edit. Weeks copy a chore's name, effort and checklist when generated, so editing a template never changes a week that already exists.
- A flat with no chores sees "Load the usual five" on `/rota/chores`: Bins 1, Kitchen 3, Living room 4, Bathroom 2, Hallway 1 (effort), all editable.
- Rota never touches money.

### Rota generation and reminders

- **The `rota-generate` Edge Function must be deployed by the owner** (`supabase functions deploy rota-generate --no-verify-jwt`). Until it is, nothing breaks, but weeks are not built automatically; an owner or admin can still use "Give out a week now" on the Chores screen. It runs the same pure scheduler as the app, from a generated copy in `supabase/functions/_shared/rota` (`node scripts/sync-rota-edge.mts` refreshes it; a test fails if it is stale).
- **Jobs** (all hourly, each at its own minute): `rota-generate` at :07 (the Edge Function, registered with `private.register_edge_job` in `20261119000000_rota_schedule.sql`), `rota-availability` at :17, `rota-reminders` at :37, plus `rota-rebalance` every ten minutes (see below). Rows appear in `job_runs`. They only touch flats that have at least one active chore.
- A week is generated once, shortly after Saturday 18:00 London for the week starting the next day. People who did not answer are filled in as around and marked "assumed".
- Push text for rota types is fixed in the database and never names a chore or a person.

### Rota: when someone leaves

- A trigger on `memberships.left_at` (migration `20261121000000_rota_leaving.sql`) records a `rota_rebuilds` row whenever someone leaves, is removed or deletes their account, but only for flats with an active chore where the leaver holds an unfinished chore from today on. A flat closing is ignored. None of the existing leaving functions is edited, and the trigger cannot make leaving fail for rota reasons.
- **Redeploy the `rota-generate` Edge Function** (`supabase functions deploy rota-generate --no-verify-jwt`). The same function now applies pending rebuilds, using the pure `rebalanceAfterLeave` from `supabase/functions/_shared/rota`. A new job, `rota-rebalance`, calls it every ten minutes. Until it is redeployed, rebuilds stay `pending` (nothing is lost or half done) and the leaver's chores keep their name on them; once it is deployed the next run catches up.
- Chores that start within 24 hours, or that someone has already ticked, are locked: only the leaver's own are moved. Nothing is rewritten: each moved chore becomes a new assignment pointing at the old one, with ticks carried across, and every move is recorded in `rota_rebuild_moves`.
- An owner or admin sees "After someone left" on `/rota` for 24 hours and can undo. Undo puts a chore back with the person it was taken from if they are still in the flat; a leaver's own chores cannot go back to someone who is gone, so they stay with their new person.
- A joiner is in the rota from the next week that is generated, with a starting load equal to the flat's average. Weeks already generated are not changed.

### Rota: away periods

- Migration `20261126000000_rota_away.sql` adds `away_periods` (read by flatmates, written only by `set_away` and `end_away`). Every day in a period counts as not available in every week it touches, replacing "assumed available"; a day the person marks available again wins. The scheduler input, the leaver-rebuild input and the screens all read the same combined view, so they agree.
- Money never reads this table: rent, bills and the ledger are unchanged. There is no admin alert for long periods, and a period is never treated as a move-out.
- A period set or extended over days that already have chores queues a rebuild of kind `away` (same table, same job, same 24-hour lock and 24-hour undo as a leaver). No new job and **no further Edge Function deploy** beyond the `rota-generate` redeploy for the leaver rebuild: the redeployed function reads the new `cause` field. Deploy that function after this migration is applied, not before.
- Fair shares are weighted by days around, so away days do not count against anyone and nobody returns to a pile of owed chores.
- Leaving the flat ends any open period.

### Rota: a chore's usual day is a preference

A weekly chore's usual day is a target. Only people around that day are normally considered. Someone who was passed over for a chore (because they were away on its day) is owed it, and next time can take it a day either side of the usual day, so being away on a fixed weekday never shuts a person out of that chore for good. The assignment's explanation says it was moved. This changes the shared scheduler, so **`rota-generate` must be redeployed** after this merges (`supabase functions deploy rota-generate --no-verify-jwt`). No migration.

### Rota: rollout summary and phone checks

**What is live.** Migrations `20261116000000_rota` to `20261120000000_rota_swaps`, then `20261121000000_rota_leaving` and `20261126000000_rota_away`. One Edge Function, `rota-generate`, which builds weeks and applies rebuilds after someone leaves or is away. It must be redeployed whenever the shared scheduler code changes (`supabase functions deploy rota-generate --no-verify-jwt`); a test fails if its generated copy in `supabase/functions/_shared/rota` is stale. The version that applies rebuilds (including the `cause` field for away periods) is the one to have deployed.

**Jobs** (rows in `job_runs` or `cron.job_run_details`): `rota-generate` hourly at :07, `rota-availability` at :17, `rota-reminders` at :37, `rota-rebalance` every ten minutes (calls the same function). They only touch flats that have at least one active chore. If nothing seems to happen, check in this order: the function is deployed, the Vault secrets exist, then `select * from cron.job where jobname like 'rota%'`.

**Checking it works without waiting for a Saturday.** An owner or admin can press "Give out the week" on Edit chores. To see a rebuild: have a test flatmate leave, then within ten minutes the admin sees "After someone left" on the Rota (a `rota_rebuilds` row moves from `pending` to `applied`). A row stuck at `pending` for longer means the function is not deployed or failed; its logs say why, and nothing is lost.

**Owner phone checklist** (two phones, two flatmates in one flat; the second can be a test account):

1. Install the app on both phones and allow notifications.
2. Admin: open Rota, Edit chores, load the usual five, give out the week. Both phones show chores with a reason on each.
3. On the other phone, open one chore, tick its steps one by one, and finish it. Untick one and check it can be undone.
4. Ask for a swap from one phone; the other phone gets a notification and can accept or decline. The old chore shows as replaced.
5. Open Which days are you around and read the deadline sentence. On one phone, mark next week as away with a note. Check the other phone sees the dates and note, the chores skip that person, and the wording says rent and bills still apply. Check the Money tab is unchanged.
6. Fairness: open Who has done what and check the numbers match what you did, with away days shown as away.
7. Have the test flatmate leave the flat. Within ten minutes the remaining phone gets "Some chores were moved" and the Rota shows who has them; the admin sees the undo for 24 hours. Try the undo.
8. Check a push never names a chore or a person (lock screen text is fixed wording).

**Left for later** (not built, by design or by scope): "Rebuild from here" for joiners beyond the manual regenerate, rent-free periods (away never touches money), admin alerts for long absences, and any notification when an undo expires.

## Rent and bills (recurring)

**Rollout order** for each recurring migration (`recurring`, `recurring_templates`, `recurring_generate`, `recurring_rent`, `recurring_reminders`): the orchestrating session applies it to the hosted project before the pull request that needs it merges, then fixes the recorded version so `list_migrations` matches `supabase/migrations/`. Apply `recurring_reminders` last: it registers the `recurring-daily` job. No Edge Function is added and `deliver-push` does not change.

**Things to know**

- An admin sets up the rent (by room) and each bill once on `/money/recurring`. A daily job creates each month ahead of its due date: 7 days before for rent and fixed bills, 14 days before for bills whose amount changes. A month whose due date has passed is never created, and a month is never created twice.
- Bills become ordinary ledger expenses (category "Bills") written through the ledger's own function. Rent is **private**: it lives in its own tables (`rent_charges`, `rent_payments`), never in `expenses`, `expense_shares`, `settlements` or the balances, and unpaid rent does not stop anyone leaving or deleting their account.
- **How to check the daily job ran:** a `recurring-daily` row should appear in `job_runs` once a day (07:00 UTC, an hour before the ledger's reminders) with status `succeeded`. Running it twice in a day does nothing. To see what it would do on a given day, ask the database for `select private.recurring_generate('2026-11-30 12:00:00+00')` and `select private.recurring_remind('2026-11-30 12:00:00+00')` (in the SQL editor only; both are idempotent).
- Reminders: rent 7, 3, 2 and 1 days before, on the day, then daily until it is paid; a bill that needs its amount 14, 7, 3 and 1 days before, on the day, then daily. Nobody who has paid is reminded. Each person can snooze or turn a type off in notification settings.
- If someone with a share of the rent or of a percentage bill leaves, or the collector or payer leaves, that template is **paused** by the next daily run, every admin is told, and nothing new is created until an admin edits it and resumes it. Equal bills carry on over whoever is in the flat.
- Push text for these types is fixed in the database, so no amount reaches a lock screen. Inbox text carries amounts only for the person or the admins it concerns.

### Phone checks for rent and bills (owner, once)

- [ ] Set up the rent by room and a gas bill on `/money/recurring/new`. Each flatmate gets "Your rent has been created" as a push that shows **no amount**, and the inbox shows only their **own** amount.
- [ ] On a flatmate's phone open **Your rent** (Money, then Your rent): only their own amount appears. Open the link of the rent template from the admin's phone on the flatmate's phone: it says "We couldn't find that."
- [ ] A flatmate taps "I paid my rent", the collector's phone gets a push, and confirming turns the flatmate's rent to "paid".
- [ ] The payer of the gas bill gets "A bill needs its amount" about two weeks before it is due, enters the amount, and the others see it on Money.
- [ ] As a normal member, look through Money, Rent and bills, the inbox and the history: no other person's rent appears anywhere.
