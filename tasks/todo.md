# Task list: notifications

Plan: [plan.md](plan.md). Spec: [../docs/SPEC-notifications.md](../docs/SPEC-notifications.md). Tests come first for any logic (TDD). Database tasks write the pgTAP file before the migration.

## Carry-over (owner checks, none block this module)

- [ ] Android Chrome: Google sign-in, persistence (iPhone Safari already confirmed 29 Oct)
- [ ] Installed Home Screen app on iPhone and Android: sign-in stays in the app, session persists
- [ ] Delete an account on the live site with a real Google account
- [ ] Add each flatmate's Gmail as a Google test user; set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel
- [ ] Re-time the Account page on a phone after the London region change
- [ ] Two real phones on production: invite link from the share sheet, second phone joins (Safari and installed app), roles, removal, leave and rejoin
- [ ] Live flat updates on real phones: a join, leave or role change shows on an open Home and Your flat screen without navigating

---

- [x] **Task 1: Tables, `private.notify`, read/snooze functions, type registry, isolation tests** (Medium) 59 pgTAP assertions. The registry also lives in the database as `notification_types` (so `notify` can decide on push); a unit test keeps `types.ts` and the migrations in step.
  - Description: Migration `*_notifications.sql` with `notifications`, `notification_preferences`, `push_subscriptions`, `push_outbox` (spec data model), RLS (own rows only; outbox service role only; subscription keys not selectable), `private.notify(...)`, `mark_read`, `mark_all_read`, `snooze`, `save_push_subscription`, and `public.notifications` added to the Realtime publication. `src/features/notifications/types.ts` registry with defaults (`member_joined`, `member_left` in-app only; `role_changed` in-app and push). pgTAP first.
  - Acceptance:
    - [x] pgTAP: a person cannot read another person's notifications, preferences or subscriptions, even in the same flat; `anon` reads nothing; the browser role cannot insert or update notifications except via the read/snooze functions; subscription keys are not selectable
    - [x] pgTAP: `notify` is idempotent per `(recipient, dedupe_key)`; rejects recipients outside the household; honours an in-app-off preference; creates outbox rows only for push-enabled devices; `href` must be an internal path
    - [x] pgTAP: Realtime publication contains `notifications` and nothing more personal
    - [x] Unit: type registry defaults and lookup; unknown type rejected
    - [x] Types regenerated; `pnpm db:test` green
  - Verify: `pnpm db:reset && pnpm db:test && pnpm db:types && pnpm test`
  - Dependencies: none
  - Files: migration, `notifications.test.sql`, `src/lib/db/types.ts`, `src/features/notifications/types.ts` and test

- [x] **Task 2: Inbox page and bell** (Medium)
  - Description: `inbox.ts` (list, unread count, cached per request), `/notifications` page grouped by day with mark read on open and "Mark all read", bell with badge in the app shell (hidden at zero, "9+" above nine), empty state. Server actions `markRead`, `markAllRead`.
  - Acceptance:
    - [x] Unit: badge formatting; day grouping; schemas
    - [x] A seeded notification shows in the inbox and the bell; opening it marks it read and follows its link; "Mark all read" clears the badge
    - [x] Bell is reachable on mobile and desktop nav without crowding; no sideways scroll on mobile
    - [x] E2E (desktop-chrome): seed through the service role, check inbox and bell
  - Verify: `pnpm test`, `pnpm test:e2e`
  - Dependencies: Task 1
  - Files: `src/features/notifications/*`, `src/app/(app)/notifications/page.tsx`, `src/features/shell/nav.tsx`, `e2e/notifications.spec.ts`

- [x] **Task 3: Household events create notifications** (Medium)
  - Description: Migration changing `join_household`, `leave_household`, `remove_member`, `set_member_role` (and the account-deletion membership end) to call `private.notify` in the same transaction: `member_joined` and `member_left` to the other active members, `role_changed` to the person affected. No self-notification. Existing behaviour unchanged.
  - Acceptance:
    - [x] pgTAP: each action creates exactly the rows in the spec's table, to the right people, with the right dedupe keys; repeating an action path cannot duplicate; existing household suites still pass
    - [x] E2E: A creates a flat, B joins from the link; A's inbox shows "B joined"; B is told nothing about their own join; A makes B an admin and B's inbox shows it
  - Verify: `pnpm db:test`, `pnpm test:e2e`
  - Dependencies: Tasks 1, 2
  - Files: migration, `household-notifications.test.sql`, `e2e/notifications.spec.ts`

- [x] **Task 4: Live bell** (Small)
  - Description: `live-inbox.tsx`, same pattern as `household/live-flat.tsx`: lazy import of the browser client, `getSession` then `realtime.setAuth`, subscribe to `notifications` (RLS limits rows to the recipient), debounced `router.refresh()`, refresh on tab focus and a 60 s backstop. Mounted next to `LiveFlatGate`.
  - Acceptance:
    - [x] Unit: sets auth before subscribing, debounces bursts, refreshes on focus and backstop, cleans up on unmount, never subscribes if unmounted early (mirrors `live-flat.test.tsx`)
    - [x] E2E: with A's page open, B joins and A's bell count rises without navigating
    - [x] Bundle budgets unchanged (no raise); CI green
  - Verify: `pnpm check`, `pnpm test:e2e`
  - Dependencies: Task 3
  - Files: `src/features/notifications/live-inbox.tsx` and test, `(app)/layout.tsx`

- [ ] **Task 5: Preferences and snooze** (Medium)
  - Description: `/more/notifications` with per-type in-app and push toggles (saved rows override code defaults), a link from More, `savePreference` action, `snooze` on snoozable types (one hour, this evening, tomorrow morning) hiding the row from the unread count until the snooze ends. The in-app toggle off means no inbox row for that type.
  - Acceptance:
    - [ ] Unit: preference resolution (saved overrides default); snooze choice to timestamp in Europe/London; schemas
    - [ ] pgTAP: owner-only writes to preferences; snooze only on the caller's own snoozable row
    - [ ] E2E: turn a type off and the next event does not reach the inbox; snoozing hides a test reminder from the badge
  - Verify: `pnpm test`, `pnpm db:test`, `pnpm test:e2e`
  - Dependencies: Tasks 1, 2 (3 for the E2E)
  - Files: `src/features/notifications/{preferences-form,actions,schemas}.ts*`, `src/app/(app)/more/notifications/page.tsx`, `src/app/(app)/more/page.tsx`

- [ ] **Task 6: Push on the device** (Medium)
  - Description: Spike and choose the smallest audited Web Push library that runs on Deno (confirm with the owner before adding). `pnpm vapid:generate` script. `push-client.ts` (permission, subscribe, unsubscribe; states granted, denied, unsupported, iOS in-browser), `push-card.tsx` with the iPhone install explanation, `savePushSubscription` and remove actions, device list with remove. `public/sw.js` gains `push` and `notificationclick` handlers and a `VERSION` bump; it still caches no pages. Permission is only requested after a tap.
  - Acceptance:
    - [ ] Unit: push-client state machine with mocked browser APIs; service-worker handlers with a fake `self` (shows title, body, opens the path, ignores off-site paths); subscription schema
    - [ ] E2E: settings page shows the unsupported explanation in a browser without push, and a working toggle where supported (subscription stored, removable)
    - [ ] No permission prompt on page load; bundle budgets unchanged
  - Verify: `pnpm test`, `pnpm test:e2e`, `pnpm check`
  - Dependencies: Task 5
  - Files: `src/features/notifications/push-*.ts*`, `public/sw.js`, `scripts/vapid-generate.mts`, `package.json`

- [ ] **Task 7: `deliver-push` worker, outbox drain, retention** (Medium)
  - Description: Edge Function `deliver-push` (`handler.ts`, `index.ts`, tests): reads due outbox rows, sends, records success, retries with backoff (1, 5, 30 minutes then gives up), deletes subscriptions reported gone (404/410). A one-minute job through the existing `job_runs` scheduler calls it; a daily job deletes read notifications older than 90 days and sent outbox rows older than 14 days. Payload is title, one short line and a path only.
  - Acceptance:
    - [ ] Unit (Deno): success marks sent; 5xx retries with growing delay; 404/410 removes the subscription; attempt cap stops retries; payload carries no more than the spec allows
    - [ ] pgTAP: outbox claim cannot hand the same row to two workers; retention deletes only what it should
    - [ ] Local: a notification for a subscribed test device reaches a fake push endpoint through `functions serve`
  - Verify: `pnpm test`, `pnpm db:test`, local functions serve check
  - Dependencies: Task 6
  - Files: `supabase/functions/deliver-push/*`, migration (jobs, claim function), `docs/DEPLOY.md`

- [ ] **Task 8: Account deletion, privacy notice, hosted rollout, phone checks** (Medium)
  - Description: Extend `delete-account` so notifications, preferences and push subscriptions go with the account (rows already cascade; handler test proves it). Privacy page names the new data and `privacy-matches-data` covers the four tables. Hosted rollout in order: migrations, VAPID secrets (Supabase) and public key (Vercel), `deliver-push` deploy, `delete-account` redeploy, advisors check. Owner device checks.
  - Acceptance:
    - [ ] Handler test: deleting an account removes the person's notifications, preferences and subscriptions
    - [ ] Privacy test fails if the tables change without the notice
    - [ ] Hosted: `list_migrations` matches the repo; advisors show no new warnings beyond the intended function ones
    - [ ] Owner on real phones: install the app, turn on push, an admin makes them an admin and the push arrives with the app closed; tapping opens the right screen; push off on one device leaves others on; Safari shows the install explanation
  - Verify: `pnpm check`, `pnpm db:test`, `pnpm test:e2e`, production `/api/health`
  - Dependencies: Tasks 1 to 7
  - Files: `supabase/functions/delete-account/*`, `src/app/(public)/privacy/page.tsx`, `src/features/legal/privacy-matches-data.test.tsx`, `docs/DEPLOY.md`
