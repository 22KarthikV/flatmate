# Spec: notifications

Status: **approved by the owner** (2026-10-29; open questions settled below). Depends on: `household` (complete). Unlocks: `ledger`, `recurring`, `rota`, `events`.

## Objective

Give every later module one way to tell a person something: write a notification row, and FlatMate shows it in an **in-app inbox** (bell with unread count) and, if the person allows it, as a **phone push** on the installed app. This module builds the pipeline, the inbox, the settings and push delivery. It also wires the first real events from `household` ("Sam joined", "Sam left", "You are now an admin") so the pipeline is proven in production before `ledger` depends on it.

Capabilities from the requirements: FR-NT-1 (inbox with unread count), FR-NT-2 (channels chosen per person per type; web push and in-app now, email deferred, see N2), FR-NT-3 (reminders scheduled and deduplicated), FR-NT-4 (failed sends retry with backoff; dead push subscriptions removed), FR-NT-5 (snooze a reminder). Architecture rule from the requirements: **outbox pattern**, so a business action and its notification commit together and delivery failures never lose or duplicate events.

### User stories

- As a member, I see a bell with an unread count; opening it shows my notifications, newest first, and marks them read.
- As a member, I can mark one or all as read, and open a notification to land on the relevant screen.
- As a member on the installed app, I can turn on push, and I get a push for events I care about, even when the app is closed.
- As a member, I choose per notification type whether I get it in the inbox, as a push, or not at all.
- As a member, I can snooze a reminder for an hour, until this evening or until tomorrow.
- As a member, I can turn push off on one device without affecting my other devices.
- As another module's author, I call one function (`notify`) in the same transaction as my change, with a dedupe key, and never think about delivery.
- As the developer, I can prove that nobody reads or changes another person's notifications, and that a reminder is never created twice.

## Decisions to confirm

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **Channels now: in-app and web push.** The inbox is the source of truth; push is a delivery of an inbox row. A person with push off still gets everything in the inbox.                                                                                                                                                                                                                                                                                                                                               |
| N2  | **Email is deferred** to a later change. It needs a sending domain, a provider account and unsubscribe handling, none of which exist; push plus inbox covers the five-person flat. The schema's channel list leaves room for it.                                                                                                                                                                                                                                                                                      |
| N3  | **One `notifications` row per recipient per event.** Columns: recipient, household, type, title, body, link path, `dedupe_key`, `created_at`, `read_at`, `snoozed_until`. Unique `(recipient_id, dedupe_key)` makes "never twice" a database fact, not a hope.                                                                                                                                                                                                                                                        |
| N4  | **Writing is only through `public.notify(...)`**, a security-definer function callable by the service role and by other database functions, never by the browser. Recipients are always members of the household named, checked inside. Members can only `select` their own rows and call `mark_read`, `mark_all_read` and `snooze`.                                                                                                                                                                                  |
| N5  | **Outbox:** a `push_outbox` row is created with each notification for each of the recipient's enabled devices and types. A worker (Edge Function `deliver-push`) sends, records success or failure, retries with backoff (1, 5, 30 minutes, then gives up) and deletes a subscription that the push service reports gone (404/410).                                                                                                                                                                                   |
| N6  | **Scheduling reuses the existing heartbeat/`job_runs` pipeline** (idempotency key per run). A one-minute job drains the outbox; later modules register their own reminder jobs. No new scheduler.                                                                                                                                                                                                                                                                                                                     |
| N7  | **Types are a code-side registry** (`types.ts`): id, label, default channels, whether it can be snoozed, who may receive it. Launch types: `member_joined`, `member_left`, `role_changed`. Defaults (used when a person has no saved preference row): `member_joined` and `member_left` in-app only; `role_changed` in-app and push. Later modules add theirs (`expense_added`, `payment_due`, `chore_due`, ...). Unknown types are rejected by `notify`'s check constraint list, updated by each module's migration. |
| N8  | **Push needs consent per device.** The permission prompt only appears after a tap on "Turn on push", never on load. On iPhone it is offered only in the installed Home Screen app (iOS 16.4+); in Safari the card explains how to install. A subscription belongs to one profile and one browser/device.                                                                                                                                                                                                              |
| N9  | **Push payloads are minimal and non-sensitive:** a title, one short line and a path. Amounts and other private detail stay in the app. Nothing in a payload is secret beyond what the person's own inbox already shows.                                                                                                                                                                                                                                                                                               |
| N10 | **VAPID keys** (public in the client, private only as an Edge Function secret) are generated once and stored in Supabase secrets and Vercel env. They are never committed. Rotating them invalidates all subscriptions, which re-subscribe on next open.                                                                                                                                                                                                                                                              |
| N11 | **Live inbox:** the bell count updates without navigating, using the same Realtime approach as `LiveFlat` (set auth, subscribe to `notifications`, RLS limits rows to the recipient), lazily loaded to respect the bundle budgets.                                                                                                                                                                                                                                                                                    |
| N12 | **Retention:** read notifications older than 90 days and sent outbox rows older than 14 days are deleted by a daily job. Unread ones are kept.                                                                                                                                                                                                                                                                                                                                                                        |
| N13 | **Deleted accounts:** notifications and subscriptions for a profile are removed when the account is deleted (the `delete-account` path), and the privacy notice names them. Notifications that mention a deleted member keep showing "Deleted user".                                                                                                                                                                                                                                                                  |
| N14 | **No quiet hours (owner's answer):** push is sent as soon as it is queued. Per-person quiet hours are a later extra.                                                                                                                                                                                                                                                                                                                                                                                                  |

## Assumptions (correct me)

1. Push is a nice-to-have on top of the inbox. If a browser refuses or has no support, the app works fully without it.
2. A person gets notifications about a flat only while they are an active member. Leaving does not delete past notifications from that flat, but new ones stop.
3. You are not notified about your own actions ("You joined"), except where the action was done to you ("Sam made you an admin").
4. "Snooze" applies to reminder-type notifications only: it hides the row from the unread count and the push is re-sent when the snooze ends.
5. A joiner's "Sam joined" goes to the other active members, not to everyone who ever lived there.
6. Notification text is English only and uses GBP, as everywhere else.

## Tech and structure

New dependency: `web-push` (Node) is not needed because delivery runs in a Deno Edge Function; the push protocol call uses a small, audited library (`jsr:@negrel/webpush` or `npm:web-push`, chosen in the plan). **Ask first** before adding it.

```
src/features/notifications/
  types.ts               notification type registry (id, label, defaults, snoozable)
  schemas.ts             zod: preferences, snooze choices, push subscription shape
  inbox.ts               server: list, unread count (cached per request)
  actions.ts             server actions: markRead, markAllRead, snooze, savePreference,
                         savePushSubscription, removePushSubscription
  bell.tsx               nav bell + unread badge (client, lazy live updates)
  live-inbox.tsx         Realtime listener, same pattern as household/live-flat.tsx
  inbox-list.tsx         the list, grouped by day
  push-card.tsx          "Turn on push on this device" with the iOS install explanation
  preferences-form.tsx   per-type in-app / push toggles
  push-client.ts         permission, subscribe, unsubscribe (browser APIs, mockable)
src/app/(app)/notifications/page.tsx          the inbox
src/app/(app)/more/notifications/page.tsx     settings and device list
public/sw.js                                  adds push and notificationclick handlers
supabase/migrations/*_notifications.sql
supabase/tests/database/notifications.test.sql
supabase/functions/deliver-push/              outbox worker (handler.ts + index.ts + tests)
supabase/functions/delete-account/            extended: remove notifications, subscriptions
```

The service worker today caches only static assets and never pages (see `public/sw.js`). The push work adds two listeners and bumps `VERSION`; it keeps that rule.

### Data model

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  household_id uuid not null references public.households (id),
  type text not null check (type in ('member_joined','member_left','role_changed')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) <= 200),
  href text not null check (href like '/%' and href not like '//%'),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  snoozed_until timestamptz,
  unique (recipient_id, dedupe_key)
);
create index notifications_inbox on public.notifications (recipient_id, read_at, created_at desc);

create table public.notification_preferences (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  in_app boolean not null default true,
  push boolean not null default true,
  primary key (profile_id, type)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,                       -- coarse label only, for the device list
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failed_at timestamptz
);

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  unique (notification_id, subscription_id)
);
create index push_outbox_due on public.push_outbox (next_attempt_at) where sent_at is null;
```

- **RLS:** `notifications` and `notification_preferences`: a person selects only their own rows; preferences are written by the owner via an upsert policy or function. `push_subscriptions`: the owner can select (without `p256dh`/`auth`, by column grants) and delete their own; inserts go through a function that sets `profile_id` from `auth.uid()`. `push_outbox`: no access for app roles; the service role only. `anon` gets nothing.
- **Functions** (security definer, empty `search_path`, execute revoked from `public`/`anon`): `private.notify(recipient, household, type, title, body, href, dedupe_key)` (inserts the row, honours the in-app preference, fans out outbox rows for push-enabled devices, `on conflict do nothing`); `mark_read(id)`, `mark_all_read()`, `snooze(id, until)`, `save_push_subscription(...)`. `household` functions call `private.notify` in their own transactions.
- **Realtime:** `public.notifications` joins the `supabase_realtime` publication, like `memberships` before it; a pgTAP test asserts that nothing else personal was added.
- **Types and seed:** `pnpm db:types` regenerates `src/lib/db/types.ts`.

### Routes

| Route                 | Who          | Behaviour                                                                                         |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `/notifications`      | signed in    | The inbox: unread first, grouped by day, mark read on open, "Mark all read", snooze on reminders. |
| `/more/notifications` | signed in    | Push on/off for this device, device list with remove, per-type toggles, explanation for iPhone.   |
| bell in the app shell | flat members | Badge with unread count (hidden at zero, "9+" above nine), live without navigation.               |

### First events (from `household`)

| Type            | Goes to                       | Text                                 | Dedupe key                        |
| --------------- | ----------------------------- | ------------------------------------ | --------------------------------- |
| `member_joined` | other active members          | "Sam joined Flat 4"                  | `joined:<membership_id>`          |
| `member_left`   | remaining active members      | "Sam left Flat 4" (or "was removed") | `left:<membership_id>`            |
| `role_changed`  | the person whose role changed | "You are now an admin"               | `role:<membership_id>:<role>:<n>` |

## Commands

Same as household: `pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`, `pnpm test:e2e`. Deploying to hosted: the migration through the Supabase migration tool first, then `deliver-push` and the extended `delete-account`, then the Vercel env for the public VAPID key. Generating keys: a one-off `pnpm vapid:generate` script (prints, never writes to a file in the repo).

## Testing strategy

- **Database (pgTAP), first:**
  - Isolation: a person cannot read another person's notifications, preferences, subscriptions or outbox rows, even in the same flat; `anon` gets nothing; the browser role cannot insert or update notifications except through the read/snooze functions; secret subscription keys are not selectable.
  - Pipeline: `notify` writes once per `(recipient, dedupe_key)`; repeated calls are no-ops; recipients outside the household are rejected; an in-app-off preference suppresses the inbox row but a push-only path is not invented; outbox rows are created only for push-enabled devices.
  - Household hooks: join, leave, removal and role changes create exactly the rows in the table above, to the right people, with no self-notification.
  - Realtime publication contains `notifications` and nothing more personal.
- **Unit (Vitest):** type registry; schemas (subscription shape, snooze choices, href must be an internal path); unread badge formatting; inbox grouping by day; push-client permission states (granted, denied, unsupported, iOS in-browser); service-worker push and click handlers with a fake `self`; `deliver-push` handler (success marks sent, 5xx retries with backoff, 404/410 deletes the subscription, retries stop after the limit).
- **End-to-end (Playwright, local stack):** A creates a flat, B joins from the link; A's open page shows the bell count rise without navigating; opening the inbox marks it read; B changes a preference off and the next event does not reach B's inbox; snooze hides a test reminder until later; settings page shows the unsupported-push explanation in a browser without push. Push delivery itself is tested at the handler level with a fake push service, not in Playwright.
- **Manual (real phones):** install the app on iPhone and Android, turn on push, have an admin make you an admin, receive a push with the app closed, tap it and land on the right screen; turn push off on one device; check the iOS in-Safari explanation.
- **Performance:** the Realtime inbox listener is lazily imported; bundle budgets in `scripts/bundle-budgets.json` are not raised; Lighthouse targets still hold on `/dashboard`.

## Boundaries

- **Always:** write notifications through `private.notify` in the same transaction as the event; give every notification a dedupe key; derive the caller from `auth.uid()`; keep push payloads minimal; keep RLS on every new table; ask for push permission only after a tap; regenerate types.
- **Ask first:** adding the push library; adding email or any other channel; adding quiet hours; any change to what a push payload contains; a new scheduler.
- **Never:** let the browser insert notifications for anyone; store or log subscription keys or VAPID private keys outside the database column and the secret store; put VAPID private keys in the repo or in a `NEXT_PUBLIC_` variable; send a push without an inbox row behind it; let a notification link point off-site; cache pages in the service worker.

## Success criteria

1. A flatmate joining shows up as a bell badge and inbox entry on the other members' open screens without navigating; a role change also arrives as a push on an installed phone with the app closed.
2. pgTAP proves a person can never read or change anyone else's notifications, preferences or subscriptions, and `anon` has no access.
3. The same event can be reported twice and creates one notification per recipient.
4. A dead push subscription is removed after the push service reports it gone; transient failures retry with backoff and stop after the limit; no failure loses the inbox row.
5. A person can switch each type's in-app and push delivery on or off, and turn push off per device.
6. On iPhone in Safari (not installed) the settings page explains how to install and does not show a broken switch.
7. Another module can register a type and call `notify` with only a migration entry and a registry line; a unit test demonstrates this.
8. The privacy notice names notifications, preferences and push subscription data, and its test fails if the tables change without it; account deletion removes them.
9. `pnpm check`, `pnpm db:test`, `pnpm test:e2e` pass in CI; bundle budgets and Lighthouse targets hold.

## Risks

| Risk                                                                | Mitigation                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| iPhone push only works for the installed app, and permission quirks | Inbox is the source of truth; clear install guidance; manual phone test is a ship criterion.                   |
| Duplicate or lost notifications on retries                          | Unique dedupe key and unique outbox pair; the row commits with the event; delivery is separate and idempotent. |
| Push services reject or rate-limit                                  | Backoff, attempt cap, dead-subscription cleanup, failures recorded on the outbox row.                          |
| Notification spam as modules arrive                                 | Per-type preferences from day one; types are registered deliberately; joined/left are inbox only by default.   |
| Realtime inbox adds bundle weight                                   | Lazy import as with `LiveFlat`; budgets are not raised.                                                        |
| VAPID private key leaks                                             | Secret store only, never in the repo or client env; rotation documented in `docs/DEPLOY.md`.                   |
| Edge Function worker is down                                        | Inbox unaffected; outbox rows wait and drain when it returns; `job_runs` shows the gap.                        |
| Cross-flat leak through a notification's text                       | `notify` checks recipients belong to the household; text is built from that household's own data only.         |

## Settled questions (owner, 2026-10-29)

1. Email: deferred to a later change (N2).
2. Quiet hours: none; push is sent immediately (N14).
3. "Sam joined" and "Sam left": **inbox only** by default (push off, the person can turn it on). Only `role_changed` pushes by default.
4. Push library: the smallest audited one that runs on Deno, chosen in Task 1 of the plan and confirmed with the owner before it is added.
