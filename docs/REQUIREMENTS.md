# FlatMate: Product Requirements

Status: DRAFT v1, awaiting approval. Module specs (`SPEC-<module>.md`) come after this is approved.

## 1. Vision

A free, installable web app that makes shared flat life easier: fair cleaning rotas, rent and bill tracking, shared expenses, and group planning, with reminders for every deadline.

- First household: 5 flatmates in Edinburgh, UK.
- Designed from day one as multi-tenant, so many households can join later.
- Platform: PWA that works on Android, iPhone and desktop browsers.
- Locale: English only, GBP only, timezone `Europe/London`.

## 2. Decisions log

| #   | Decision                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| D1  | PWA, single codebase. No native apps.                                                                               |
| D2  | Auth: Google OAuth through Supabase Auth. No passwords stored by us.                                                |
| D3  | Rota is strict rotation. Nobody is permanently assigned to a chore.                                                 |
| D4  | Week runs Sunday to Saturday.                                                                                       |
| D5  | Availability is entered per person, per day, one week in advance.                                                   |
| D6  | Roles: owner, admin, member. Admins can add other admins.                                                           |
| D7  | Rent is collected by a designated collector (an admin). Due day is configured by the admin (6th in the first flat). |
| D8  | Gas, electricity, Wi-Fi and council tax recur monthly, amounts can vary by month.                                   |
| D9  | Events are confirmed by majority vote.                                                                              |
| D10 | The app tracks debts only. No payment processing. People pay outside the app.                                       |
| D11 | Money is stored as integer pence.                                                                                   |
| D12 | Free to run for the first household. Scaling to thousands of users may need a paid tier (see section 7).            |

## 3. Assumptions (correct me)

1. Notifications: push works on iPhone only after the app is added to the Home Screen (iOS 16.4+). Email is the fallback, and onboarding prompts for install.
2. A user belongs to one household at a time in v1. The schema allows several.
3. Members who leave keep their history. Their balances must be settled before leave is completed.
4. Data lives in the UK/EU region, and UK GDPR rules apply (export and delete on request).

## 4. Functional requirements

### 4.1 identity

- FR-ID-1: User signs in with Google and lands in the app. A profile (name, avatar) is created automatically on first login.
- FR-ID-2: Session persists across app restarts on mobile. Sign-out works on all devices.
- FR-ID-3: User can delete their account. Their shared history is anonymised, not removed.
- Acceptance: unauthenticated requests can never read or write any household data.

### 4.2 household

- FR-HH-1: A signed-in user can create a household. An admin setup wizard asks: household name, number of flatmates, rent collector, rent due day, rent share per person (equal or custom), which recurring bills exist, and chore list.
- FR-HH-2: Admins generate invite links (expiring, revocable). Joining requires Google sign-in.
- FR-HH-3: Roles: owner (creator), admin, member. Admins can promote and demote members, remove members, and edit settings. At least one admin must always exist.
- FR-HH-4: Members see only their own household's data. This is enforced in the database, not only in the UI.
- Acceptance: a user from household A can never read household B's rows, tested at the database level.

### 4.3 notifications

- FR-NT-1: In-app inbox with unread count.
- FR-NT-2: Channels: web push, email, in-app. Each user chooses channels per notification type.
- FR-NT-3: Reminders are scheduled and deduplicated. A reminder is never sent twice for the same event.
- FR-NT-4: Failed sends retry with backoff, and permanently failing push subscriptions are removed.
- FR-NT-5: Users can snooze a reminder.

### 4.4 ledger (shared expenses)

- FR-LG-1: Any member adds an expense: amount, description, category, date, who paid, and who it is for.
- FR-LG-2: Split modes: equal, exact amounts, percentages, and "for one person" (e.g. bought something for a flatmate). Rounding differences are assigned deterministically so shares always sum exactly to the total.
- FR-LG-3: Each affected member is notified: "You owe Karthik £4.20 for kitchen roll".
- FR-LG-4: Balances screen shows who owes whom, with simplified debts (fewest transfers).
- FR-LG-5: Settle-up: payer marks "I paid", receiver confirms. Unconfirmed settlements stay pending, and the receiver gets a reminder.
- FR-LG-6: Expenses can be edited or voided by the creator or an admin. Edits are recorded and balances recalculate. History is never silently lost.
- FR-LG-7: Overdue gentle nudges to people who owe, at a configurable interval.
- FR-LG-8: Optional receipt photo attachment.
- Acceptance: for any household, the sum of all balances is exactly zero.

### 4.5 recurring (rent and bills)

- FR-RC-1: Rent: the admin configures collector, due day (e.g. the 6th), and each person's share. Each month the system creates a debt from each flatmate to the collector.
- FR-RC-2: Reminders go to unpaid flatmates before the due day, on the day, and after. The collector sees a "who has paid" dashboard and confirms payments.
- FR-RC-3: Bills: gas, electricity, Wi-Fi, council tax, and custom ones. Each has name, payer, split, due day, and mode fixed or variable.
- FR-RC-4: For variable bills, the payer gets a reminder to enter the month's amount. Once entered, it splits and notifies everyone.
- FR-RC-5: Council tax recurs monthly (all 12 months by default, with an option to choose active months).
- FR-RC-6: Changing a template (amount, shares) affects future months only.
- FR-RC-7: A month history view shows what was due, paid, and outstanding.

### 4.6 rota (cleaning and chores)

- FR-RT-1: Admins define chores. Each chore has a name, a cadence (weekly with a preferred day, or every N days), and a checklist template.
- FR-RT-2: Initial chores for the first flat:
  - Kitchen: microwave, gas stove, sink, counters, put away plates and cutlery.
  - Living room and hallway: vacuum, mop, clean dining table, clean common living room table.
  - Bathroom: toilet, shower, wash the bath mats in the washing machine.
  - Bins (every 2 days): take out the filled bag, put a new bag in the bin.
- FR-RT-3: Availability: each member marks per day whether they are available for the coming week (Sun to Sat). The window opens a week ahead and has a deadline, with reminders.
- FR-RT-4: Auto-scheduling (strict rotation):
  - Over successive weeks every available member cycles through every chore.
  - Weekly chores go on their preferred day (e.g. Sunday cleaning day). If the assignee is unavailable that day, it moves to the nearest day in the week when they are available. If they have no available day, the chore passes to another available member and the original member is owed that chore next rotation.
  - Bins: each occurrence is assigned to the next available person in the bins rotation.
  - Rotation is deterministic and explainable ("why was I assigned?").
- FR-RT-5: Checklist instance: when assigned, the chore copies the template checklist. The assignee ticks items off, sees progress, and the chore is complete when all items are ticked. Later template edits never change past assignments.
- FR-RT-6: Optional photo and optional sign-off by another flatmate.
- FR-RT-7: Swaps: two members can swap assignments (with acceptance). Admins can override.
- FR-RT-8: Reminders: assigned, due today, and overdue.
- FR-RT-9: Fairness view: who did what over time, and any owed turns.

### 4.7 events (the fun section)

- FR-EV-1: Anyone proposes an event with title, description, location, and 2 or more candidate date/times.
- FR-EV-2: Members vote yes / maybe / no per option.
- FR-EV-3: Confirmation by majority: an option is confirmed when more than half of the household members vote yes, or at the voting deadline the option with the highest yes count wins. Ties are broken by the organiser.
- FR-EV-4: Confirmed events appear on a shared calendar that also shows rota and rent/bill due dates.
- FR-EV-5: Reminders before the event.

### 4.8 extras (each ships on its own)

Shopping list (one tap to turn a bought item into an expense), meter readings log, Edinburgh bin-collection reminders, fix-it log, noticeboard, house rules, activity feed.

## 5. Non-functional requirements

| Area            | Requirement                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive      | Usable at 360px width and up. Touch targets at least 44px.                                                                                                |
| PWA             | Installable, offline shell, offline view of cached rota and balances. Writes made offline sync when the connection returns.                               |
| Performance     | Core screens load in under 2.5 s (LCP) on a mid-range phone on 4G. API p95 under 300 ms for standard queries.                                             |
| Accessibility   | WCAG 2.1 AA.                                                                                                                                              |
| Security        | Row-level security on every table, least-privilege roles, secrets only in env vars, input validation on every write, rate limiting on invites and writes. |
| Privacy         | UK GDPR: data export, account deletion, minimal data collected.                                                                                           |
| Reliability     | Scheduled jobs are idempotent. A job can run twice without duplicating reminders or debts.                                                                |
| Observability   | Structured errors and logs, with job-run history for the scheduler.                                                                                       |
| Browser support | Last 2 major versions of Chrome, Safari (iOS 16.4+), Firefox, Edge.                                                                                       |
| Testing         | TDD for domain logic (splits, simplification, rotation). Integration tests against the real schema and RLS. E2E for core journeys.                        |

## 6. Data architecture (design principles)

### 6.1 Principles

1. **Tenant key everywhere.** Every household-owned table has `household_id`. RLS policies check membership through one security-definer helper function, with an index to make it cheap.
2. **Money is integer pence** (`bigint`). Never floats. A database constraint ensures `sum(shares) = amount` for every expense.
3. **Immutable financial history.** Expenses, shares and settlements are append-only. Corrections are voids or adjustments, not overwrites. Balances are derived from these rows, with a cached balance table maintained transactionally for fast reads.
4. **Templates vs instances.** Chore checklists, recurring bills and rotas separate the editable template from the generated instance. Instances snapshot the template.
5. **UUID primary keys** and `timestamptz` everywhere. Household-local dates (rent due day, week start) are `date` plus the household timezone.
6. **Idempotent generation.** Generated rows (monthly bills, weekly rota, reminders) carry a unique key such as `(template_id, period)` or `dedupe_key`, so retries are safe.
7. **Outbox pattern** for notifications: a transaction writes the notification row, and a worker delivers it. Delivery failures never lose or duplicate business events.
8. **Soft delete** (`deleted_at` / `voided_at`) for user-facing data. Hard delete only for personal data on account deletion, via anonymisation.

### 6.2 Core entities (draft, finalised in each module spec)

| Module        | Tables                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| identity      | `profiles` (id = auth user id, display_name, avatar_url)                                                                                                                                 |
| household     | `households`, `memberships` (household_id, user_id, role, status, joined_at, left_at), `invites`, `household_settings`                                                                   |
| notifications | `notifications` (dedupe_key unique), `push_subscriptions`, `notification_preferences`, `job_runs`                                                                                        |
| ledger        | `expenses`, `expense_shares`, `settlements`, `member_balances` (cached)                                                                                                                  |
| recurring     | `recurring_templates`, `recurring_template_shares`, `recurring_instances` (unique per template and period)                                                                               |
| rota          | `chores`, `chore_checklist_items`, `availability` (household, user, date, status), `rota_weeks`, `chore_assignments`, `assignment_items`, `rotation_state` (owed turns), `swap_requests` |
| events        | `events`, `event_options`, `event_votes` (unique per option and user)                                                                                                                    |

### 6.3 Key indexes

- `memberships (user_id, household_id)` and `(household_id, user_id)` for RLS checks.
- Every child table: `(household_id, <primary access column>)`, e.g. `expenses (household_id, occurred_on desc)`, `chore_assignments (household_id, week_start, user_id)`, `notifications (user_id, read_at, created_at desc)`.
- Unique keys that enforce idempotency: `recurring_instances (template_id, period)`, `rota_weeks (household_id, week_start)`, `notifications (dedupe_key)`.

## 7. Scalability

The unit of scale is the **household**: 5 users and a few thousand rows per year. Tenants are tiny and independent, which makes this workload easy to scale horizontally.

| Stage     | Households (users)       | Approach                                                                                                                                                 |
| --------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Launch | 1 to ~100 (to ~500)      | Supabase free + Vercel free. Single Postgres.                                                                                                            |
| 2. Growth | ~100 to ~2,000 (to ~10k) | Supabase Pro (small paid plan), connection pooling (Supavisor), read-optimised cached balances, scheduled jobs batched per household.                    |
| 3. Scale  | 2,000+ (10k+)            | Partition high-volume append-only tables (`notifications`, activity) by time, move fan-out to a queue worker, read replica, CDN for assets, rate limits. |

Design choices that keep this cheap later:

- Tenant isolation by `household_id` with composite indexes means queries never scan across households.
- Scheduled jobs process households in small batches with a per-household idempotency key, so work can be sharded or parallelised without rewriting.
- Reminders are rows in an outbox table, so the sender can be scaled or swapped independently.
- No cross-household joins in application code, so a household could be moved to its own shard if ever needed.
- Rule of thumb for the free tier: the first flat, and likely tens of households, fit comfortably. The free tier has limits on database size, auth users, egress and function invocations, plus project pausing after inactivity. I will check the current limits when writing `foundation`. Thousands of users should be expected to need a paid plan.

Load targets to be validated in `foundation` and `ledger`: 10k users, 2k households, 50 expenses per household per month, and a reminder burst of 10k notifications per hour.

## 8. Definition of done (per module)

1. `SPEC-<module>.md` approved.
2. `tasks/plan.md` and task list approved.
3. Migrations reviewed, RLS policies tested (including a cross-tenant denial test).
4. Domain logic written test-first. Integration and E2E tests for the module's journeys pass.
5. Review across correctness, readability, architecture, security and performance.
6. Deployed, smoke-tested on one Android and one iPhone browser, and the changelog updated.

## 9. Out of scope (for now)

Payment processing or bank integration, native apps, languages other than English, currencies other than GBP, chat, multi-household switching UI.

## 10. Open questions (with proposed defaults)

| #   | Question                                            | Proposed default                                                                                                                                                                                                         |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Someone doesn't submit availability by the deadline | Assume available every day, mark as "assumed", send two nudges before the deadline.                                                                                                                                      |
| Q2  | Bins and weekly chores: does one person get both?   | Bins are a separate, light rotation that stacks on top. Weekly chores rotate among all available members, and with 3 weekly chores and 5 people, two members have no weekly chore that week (fair rotation tracks this). |
| Q3  | Availability deadline                               | Saturday evening, for the week starting the next Sunday (i.e. one week ahead). Please confirm.                                                                                                                           |
| Q4  | Chore sign-off                                      | Optional per chore, off by default.                                                                                                                                                                                      |
| Q5  | Who can edit checklist templates                    | Admins only. Members can suggest changes.                                                                                                                                                                                |
| Q6  | Event majority                                      | More than half of members vote yes, else highest yes count at deadline.                                                                                                                                                  |
