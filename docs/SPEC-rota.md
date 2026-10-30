# Spec: rota

Status: **approved by the owner** (2026-10-30, on the defaults below, with the effort scores and availability warning set by the owner). Depends on: `household` and `notifications` (both complete). It does not depend on `ledger` or `recurring`, and nothing in this module reads or writes money. Unlocks: the shared calendar in `events` (FR-EV-4 shows rota days).

## Objective

Make the cleaning fair without anyone having to run it. Admins list the chores and what "done" means for each. Each week every flatmate says which days they are around. The app then hands out the chores by strict rotation (D3), explains every assignment, lets people tick off a checklist, lets two people swap, and shows over time who has done what. When someone leaves, the future work is rebuilt for the people who remain, shared by effort rather than by count (D13).

Capabilities from the requirements: FR-RT-1 to FR-RT-9, decisions D3, D4, D5 and D13, the whole of `DESIGN-rota-rebalancing.md`, and open questions Q1 to Q5. The acceptance rules are facts the tests can prove: **the same inputs always give the same rota, no chore is given to someone who is unavailable that day, and every assignment can be explained.**

### User stories

- As an admin, I define chores: a name, how often (weekly on a preferred day, or every N days), how much effort it is, and a checklist of steps.
- As an admin, I start from the first flat's chores (Kitchen, Living room, Hallway, Bathroom, Bins) and edit them.
- As a member, I say which days next week I am available. The window opens a week ahead and I am reminded before it closes.
- As a member, I see my chores this week and why each one is mine ("You did Bathroom longest ago"), and I tick off the checklist as I go. The chore is done when every step is ticked.
- As a member, I can ask someone to swap a chore with me. They accept or decline. An admin can move a chore directly.
- As a member, I see who has done what over time and whether anyone is owed a turn.
- As a member, I am told when a chore is given to me, when it is due today, and when it is overdue.
- As a flatmate who stays, I do not have to fix the rota when someone leaves. The leaver's future chores are given out fairly and I am told what moved and why, with a one-tap undo for 24 hours for admins.
- As the developer, I can prove the scheduler is deterministic, fair within a stated bound, respects availability, and that nobody outside the flat can see any of it.

## Decisions to confirm

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **The scheduler is one pure function.** `buildWeek(input) => { assignments, explanations }` in TypeScript has no clock, no random and no database. It takes the members, the chores, each person's availability by day, the rotation state and a week start, and returns assignments plus a plain-English reason for each. It is written test first with property tests (below). The database stores its output; it never computes assignments itself.                                                                                                                                                                                                                                                                                                                                                                                                   |
| T2  | **Weeks run Sunday to Saturday** (D4), as `date` values in Europe/London. A week is identified by its Sunday (`week_start`). Dates are never stored as timestamps at midnight, so daylight saving cannot shift a chore to the wrong day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T3  | **Strict rotation by effort-weighted fairness** (D3). Nobody is permanently assigned a chore. For each chore the person who did it longest ago, among the available people with the lowest carried load, takes it. Ties break by a stable seeded order (profile id), so a rerun gives the same answer. "Carried load" is effort done minus fair share so far, kept in `rotation_state`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| T4  | **Effort scores** (from the design note). Each chore has an effort of 1 to 5. Defaults, set by the owner: **Bins 1, Kitchen 3, Living room 4, Bathroom 2, Hallway 1.** The living room and the hallway are two separate chores (the hallway takes the vacuum and mop items from the old combined chore), so the first flat has five chores for five people. **Editable per flat by an admin.** Changing an effort affects weeks not yet generated only.                                                                                                                                                                                                                                                                                                                                                                                                  |
| T5  | **Availability** (D5, Q1, Q3). Each person marks each day of the coming week as available or not. The window opens on the Sunday a week ahead and **closes Saturday 18:00 London time** for the week that starts the next day. Two nudges go before the close. A person who has not answered by the close is **assumed available every day** and the rota marks them "assumed". **The deadline is always stated in plain words** on the availability screen and in both nudges, for example "Answer by Saturday 6pm. If you do not, you will be treated as available every day this week and can be given any chore." The same line appears in the first nudge (three days before the close) and the last nudge (the morning of the close). Admins can set a different deadline day and hour per flat later; the default is the only one in this module. |
| T6  | **Unavailable assignee** (FR-RT-4). A weekly chore goes on its preferred day. If its assignee is unavailable, it moves to the nearest day in the week when they are available (earlier day wins a tie). If they have no available day, it passes to the next eligible person and the original person is recorded in `rotation_state` as owed that chore next rotation. If nobody can do it, it stays **unassigned** and admins are told. It is never silently dropped.                                                                                                                                                                                                                                                                                                                                                                                   |
| T7  | **Bins** (Q2). Bins are a separate, light rotation that stacks on top of the weekly chores. Each occurrence (every 2 days by default) is given to the next available person in the bins rotation. Weekly chores rotate among all available people; with fewer weekly chores than people, someone has none that week, and the fairness tracking makes that someone different each time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| T8  | **Templates versus instances** (FR-RT-5, Q5). A chore and its checklist are editable templates. When a week is generated, each assignment **copies** the checklist items (`assignment_items`), so editing a template later never changes past or already generated assignments. Only admins edit templates. Members can send a suggestion, which is a short note to the admins in their inbox, not a separate workflow.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| T9  | **Immutable history.** Assignments, their ticks and swaps are never deleted. A rebuild creates a **new revision** of a week; older revisions stay. The week's identity is `(household_id, week_start, revision)`, which is also its idempotency key. Generating twice yields one revision, not two.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T10 | **Generation is a scheduled job.** A job runs hourly, finds each flat whose availability window has just closed (Saturday 18:00 London) and which has no revision for the next week, and generates it. It uses `job_runs` with a key of `rota-generate:<household>:<week_start>`, and takes `p_now` so tests can move through time, exactly like `run_ledger_reminders`. Running it twice is harmless. An admin can also press "Generate now" for a week.                                                                                                                                                                                                                                                                                                                                                                                                |
| T11 | **Reminders** (FR-RT-8, FR-RT-3) go through `private.notify`, so each person's own channel settings apply and each has a dedupe key. Types below. Their push text is fixed on the notification type (`push_title`, `push_body`), as the ledger does, and never names a chore or person.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| T12 | **Swaps** (FR-RT-7). One person asks another to take one of their assignments (or to exchange for one of theirs). The other accepts or declines. Only accepted swaps change anything, and they are recorded as a new assignment row pointing at the old one. Admins can reassign directly, with their name on the record. Swapping never lets a chore land on a day the new person marked unavailable unless an admin does it.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| T13 | **Sign-off and photos** (FR-RT-6, Q4). Sign-off by another flatmate is an option per chore, **off by default**. **Photos are deferred**: they need file storage, an upload policy and a privacy-notice update, which do not exist yet. Same reasoning as ledger L12.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T14 | **Fairness view** (FR-RT-9). A page shows, per person, the effort points done over a chosen period, chores done by kind, and any owed turns. It is read-only and computed from assignments and ticks. Skipped or overdue chores are shown honestly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T15 | **Leaver rebalance** (D13). A trigger on `memberships` fires when `left_at` is set, so the three existing paths (leave, remove, account deletion) all use it and none needs editing in its own function. It records a "rebalance needed" row. A job (or, for speed, the same transaction for small flats) runs the algorithm from the design note for every future assignment of the leaver and writes a new revision. See the algorithm section. The leaver's money is never touched by the rota (design rule 5).                                                                                                                                                                                                                                                                                                                                       |
| T16 | **Lock window and undo.** An assignment that starts within the next 24 hours, or is already started, is **locked**: the rebalance check will not move it, but the leaver's own locked tasks are still reassigned (they cannot do them). Rebuilds apply automatically, and an admin can **undo within 24 hours**, which restores the previous revision of the affected weeks and tells those people.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T17 | **Joiners.** A new member joins the rotation from the next ungenerated week, with a carried load equal to the flat's average so they are neither buried nor spared. Weeks already generated are not changed unless an admin presses "Rebuild from here".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T18 | **Types added:** `rota_week_ready` (in-app and push), `availability_open` (in-app), `availability_nudge` (in-app, snoozable), `chore_assigned` (in-app and push), `chore_due` (in-app and push), `chore_overdue` (in-app and push), `swap_requested` (in-app and push), `swap_decided` (in-app), `rota_rebuilt` (in-app), `chore_unassigned` (in-app, admins). Defaults can be changed per person in the existing preferences screen. Push text is generic, for example "You have a chore today", "A flatmate asked to swap a chore with you".                                                                                                                                                                                                                                                                                                           |
| T19 | **Offline.** Reading and ticking offline is out of scope for the same reason as the ledger (L13): the service worker caches no pages. The checklist needs a connection. The requirements' "offline view of cached rota" remains a platform change of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Assumptions (correct me)

1. One time zone, Europe/London. A "day" is a London calendar date.
2. Chores have a preferred weekday only if they are weekly. "Every N days" chores (such as bins) have no preferred day; N is 1 to 14.
3. A flat can have 1 to 12 chores and the app is designed for flats of 1 to 12 people.
4. A flat of one person gets every chore every week (nothing to share). A flat with no chores generates nothing and says so.
5. A week cannot be generated more than 2 weeks ahead, so the future does not fill with stale assignments.
6. Chore names are plain text up to 40 characters. Checklist items are up to 80 characters, up to 20 per chore.
7. A chore is "done" when every checklist item is ticked, and "overdue" when its day has passed and it is not done. Overdue chores stay with their assignee. They do not automatically pass to someone else.
8. Ticks can be undone by the person who made them. A completed chore can be reopened by its assignee or an admin, and the record notes that.
9. Everyone in the flat can see everyone's assignments and progress. Availability entries are visible to the whole flat too, because the rota depends on them.
10. Effort scores are whole numbers, 1 to 5. They only affect fairness, not how long anyone is told to spend.

## Tech and structure

No new dependencies.

```
src/features/rota/
  week.ts                 Sunday to Saturday helpers, London dates, availability window and deadline
  schedule.ts             buildWeek(input): assignments + explanations (pure, deterministic)
  rebalance.ts            rebalanceAfterLeave(input): the design-note algorithm (pure)
  fairness.ts             carriedLoad, owed turns, per-person totals (pure)
  explain.ts              turns an assignment's reasons into one plain sentence
  schemas.ts              zod: chore, checklist, availability, swap, effort
  actions.ts              server actions: saveChore, archiveChore, saveAvailability,
                          tickItem, untickItem, requestSwap, decideSwap, reassign,
                          generateWeek, undoRebuild
  chores.ts               server: chores and templates
  weeks.ts                server: a week's assignments with checklists and explanations
  availability.ts         server: my availability, who has answered
  fairness-data.ts        server: history for the fairness view
  chore-form.tsx          admin: add / edit a chore with its checklist and effort
  availability-form.tsx   seven day toggles for next week
  week-view.tsx           the week: mine first, then everyone
  checklist.tsx           tick items, progress
  swap-sheet.tsx          ask for / answer a swap
  fairness-view.tsx       who did what, owed turns
src/app/(app)/rota/page.tsx                   this week: my chores first, why, progress
src/app/(app)/rota/assignments/[id]/page.tsx  one assignment: checklist, explanation, swap
src/app/(app)/rota/availability/page.tsx      next week's availability
src/app/(app)/rota/fairness/page.tsx          history and owed turns
src/app/(app)/rota/chores/page.tsx            admins: chores, effort, checklists, "Generate now"
supabase/migrations/*_rota.sql                chores, checklist items, availability, week tables, RLS
supabase/migrations/*_rota_weeks.sql          assignment tables, rotation_state, write functions, notifications
supabase/migrations/*_rota_schedule.sql       generation job, availability reminders, due and overdue reminders
supabase/migrations/*_rota_swaps.sql          swap requests and decisions
supabase/migrations/*_rota_leaving.sql        membership trigger, rebalance job, undo
supabase/tests/database/rota-*.test.sql
```

### Data model

```sql
create table public.chores (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id),
  name           text not null check (char_length(name) between 1 and 40),
  cadence        text not null check (cadence in ('weekly','every_n_days')),
  preferred_dow  smallint check (preferred_dow between 0 and 6),        -- 0 = Sunday; weekly only
  every_n_days   smallint check (every_n_days between 1 and 14),        -- every_n_days only
  effort         smallint not null default 3 check (effort between 1 and 5),
  needs_signoff  boolean not null default false,
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);

create table public.chore_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  chore_id   uuid not null references public.chores(id),
  position   smallint not null,
  text       text not null check (char_length(text) between 1 and 80),
  unique (chore_id, position)
);

create table public.availability (
  household_id  uuid not null references public.households(id),
  profile_id    uuid not null references public.profiles(id),
  on_date       date not null,
  available     boolean not null,
  assumed       boolean not null default false,       -- filled in by the app after the deadline
  updated_at    timestamptz not null default now(),
  primary key (household_id, profile_id, on_date)
);

create table public.rota_weeks (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id),
  week_start     date not null check (extract(dow from week_start) = 0),
  revision       integer not null default 1,
  reason         text not null default 'weekly',      -- weekly | member_left | member_joined | manual | undo
  created_by     uuid references public.profiles(id), -- null when a job made it
  superseded_at  timestamptz,                         -- set when a newer revision replaces it
  created_at     timestamptz not null default now(),
  unique (household_id, week_start, revision)         -- the idempotency key (T9)
);

create table public.chore_assignments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id),
  rota_week_id   uuid not null references public.rota_weeks(id),
  chore_id       uuid not null references public.chores(id),
  chore_name     text not null,                       -- snapshot (T8)
  effort         smallint not null,                   -- snapshot
  assignee       uuid references public.profiles(id), -- null = unassigned, admins told
  due_on         date not null,
  explanation    text not null,                       -- "Why this is yours" in one sentence
  replaces_id    uuid references public.chore_assignments(id), -- set on a swap or reassign
  completed_at   timestamptz,
  signed_off_by  uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index on public.chore_assignments (household_id, due_on);
create index on public.chore_assignments (household_id, assignee, due_on);

create table public.assignment_items (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.chore_assignments(id),
  position       smallint not null,
  text           text not null,                       -- snapshot of the template item
  done_at        timestamptz,
  done_by        uuid references public.profiles(id),
  unique (assignment_id, position)
);

create table public.rotation_state (
  household_id    uuid not null references public.households(id),
  profile_id      uuid not null references public.profiles(id),
  chore_id        uuid not null references public.chores(id),
  last_done_on    date,                               -- for "longest ago" (T3)
  owed_turns      smallint not null default 0,        -- passed over because unavailable (T6)
  primary key (household_id, profile_id, chore_id)
);

create table public.swap_requests (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id),
  assignment_id  uuid not null references public.chore_assignments(id),
  from_profile   uuid not null references public.profiles(id),
  to_profile     uuid not null references public.profiles(id),
  status         text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  check (from_profile <> to_profile)
);

-- households gets: availability_deadline (default Saturday 18:00 London), no other column.
```

Carried load per person is derived from `chore_assignments` and `rotation_state` when a week is built, not stored, in the same spirit as ledger balances (L3). `rotation_state` holds only what cannot be derived cheaply: when someone last did each chore, and owed turns.

Row-level security: members of the flat can `select` its rows; nobody writes directly (no write policies). Every write is a `security definer` function that derives the caller from `auth.uid()` and checks membership and role. `anon` sees nothing. A member may set only their own availability and tick only items on their own assignments (or, for an admin, anyone's).

### Routes

| Route                    | Who          | Behaviour                                                                                       |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------------------- |
| `/rota`                  | flat members | This week: my chores first with the reason and progress, then everyone's. Link to availability. |
| `/rota/assignments/[id]` | flat members | One assignment: checklist, explanation, swap request. Assignee or admin can tick.               |
| `/rota/availability`     | flat members | Seven toggles for next week, deadline shown, who has answered.                                  |
| `/rota/fairness`         | flat members | Effort done per person over a period, owed turns, chores by kind.                               |
| `/rota/chores`           | admins       | Add, edit and archive chores, effort, preferred day, checklist, sign-off, "Generate now".       |

### The scheduler (T1, T3, T6, T7)

Input: the week start, active members, active chores (with effort, cadence, preferred day), availability by person and day, `lastDone[person][chore]`, `carriedLoad[person]`, `owed[person][chore]`, and a fixed ordering seed (profile ids).

1. For every chore occurrence in the week, create a slot with a target day (preferred day, or each N days from the week's start).
2. Order the slots by effort, highest first, then by chore id, so the order never depends on input order.
3. For each slot, the candidate people are those available on the target day. If there are none, widen to the nearest available day for each person. If still none, mark the slot unassigned.
4. Choose the candidate with, in order: an owed turn for this chore, the lowest `carriedLoad + effort already given this week`, the oldest `lastDone[person][chore]`, then the stable order.
5. Record the reason for the choice as structured data ("lowest load", "longest since Bathroom", "owed a turn"), and render it as one sentence.
6. A person who could not be given a slot they were next in line for gains an owed turn for that chore.
7. Return the assignments, the unassigned slots, and the owed-turn changes. Nothing is written by this function.

Bins are scheduled in the same pass as their own light rotation (T7): the occurrences are handed out one at a time to the next available person, each counting only its small effort.

### Rebalancing when someone leaves (T15, T16, and the design note)

`rebalanceAfterLeave` is a second pure function with the exact steps of `DESIGN-rota-rebalancing.md`: collect the leaver's future assignments, order them by effort, assign greedily to the available person with the lowest load, then check the gap between highest and lowest total future effort and move the smallest set of tasks that closes it when it exceeds one average task, preferring tasks that are not started and not in the next 24 hours. It returns the new assignments and an explanation per move ("moved because Sam left"). The database wrapper writes a new `rota_weeks` revision for each affected week, marks the old one superseded, notifies affected people through the outbox with a dedupe key per revision, and records the undo point.

Recurring shares of rent and bills are the `recurring` module's concern. The design note's step 5 is built there, hooked to the same membership change.

## Slices (order of work)

| #   | Slice                        | What it delivers                                                                                 | Needs first | Can run alongside          |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------- | -------------------------- |
| R1  | Chores and checklists        | Tables, RLS, admin page, defaults for the first flat, effort, pgTAP, unit and component tests    | none        | none (it fixes the schema) |
| R2  | Availability                 | Table, page, window and deadline rules, assumed-available fill, nudges                           | R1          | R3 pure code               |
| R3  | Scheduler (pure)             | `week.ts`, `schedule.ts`, `fairness.ts`, `explain.ts` with property tests; no database           | R1 shape    | R2, R4 UI                  |
| R4  | Generation and assignment UI | Week tables, write functions, hourly job, `/rota`, assignment page, checklist ticking, reminders | R1, R3      | R2 UI                      |
| R5  | Swaps and admin reassign     | Table, functions, swap sheet, notifications                                                      | R4          | R6                         |
| R6  | Fairness view                | Read-only page from existing rows                                                                | R4          | R5                         |
| R7  | Leaver rebalance and undo    | Pure `rebalance.ts`, membership trigger, revisions, undo, notifications, joiner handling         | R4          | R5, R6 (separate files)    |
| R8  | Checkpoint                   | Hosted rollout, docs, manual phone checks                                                        | all         | none                       |

Work that independent subagents can take inside the module, because it touches different files and needs no output from the other: the pure scheduler (R3) and the availability tables and page (R2) after R1 lands; the swap slice (R5) and the fairness view (R6) after R4; the pgTAP files versus the component tests for one slice once its schema is fixed. Anything that changes a migration, `notification_types` or `types.ts` stays with the module session, one writer at a time.

## Shared files this module touches

For the orchestrator's coordination document. Each edit is small and append-only where possible.

- `notification_types` (new types in T18) via migrations.
- `src/features/notifications/types.ts` (mirror of the types for the preferences screen).
- `src/features/shell/nav.tsx` (a Rota entry; the Money entry belongs to the ledger).
- `scripts/bundle-budgets.json` (new `/rota/*` routes; no existing budget raised).
- `src/app/(public)/privacy/page.tsx` and `src/features/legal/privacy-matches-data.test.tsx` (availability and chore history are personal data; export and anonymise on deletion).
- `src/lib/db/types.ts` (regenerated after each migration, never edited by hand).
- `docs/DEPLOY.md` (a "Rota" section: job, phone checks).
- `e2e/rota.spec.ts` (new file; `e2e/ledger.spec.ts` is not edited).
- `supabase/functions/delete-account` is **not** changed: the membership trigger and `end_memberships_for_account` already do the work.
- Migrations take the filename range `20261101…` (the orchestrator assigns the range so it cannot clash with another module's).

## Commands

`pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`, `pnpm test:e2e`. Hosted: the orchestrator applies each migration through the Supabase migration tool first, in merge order, then the module merges. `deliver-push` does not change.

## Testing strategy

- **Pure logic (Vitest, test first):**
  - `week`: a week starts on Sunday, a London date across the clock change is the right day, the deadline and window boundaries are exact.
  - `schedule` property tests over random flats (1 to 12 people, 1 to 12 chores, random availability): same input in a different order gives the same result; **no assignment lands on a day the person is unavailable**; every slot is assigned or reported unassigned (nothing lost or duplicated); with equal availability the effort gap between the highest and lowest total is at most the largest single chore; over enough weeks every available person does every chore; an owed turn is honoured next time.
  - `rebalance` property tests exactly as listed in the design note: total effort conserved, gap at most the largest task, availability respected, idempotent, the leaver never appears again, a leaver with nothing upcoming changes nothing, a lone remaining member gets everything, zero remaining members gives no assignments and no error.
  - `explain`: every assignment yields a non-empty sentence that names its real reason.
- **Database (pgTAP, first for each migration):**
  - Isolation: a member of flat A reads zero rows from flat B and cannot write there; `anon` gets nothing; the browser role cannot insert, update or delete any rota table directly.
  - Integrity: unique `(household_id, week_start, revision)`; a week start must be a Sunday; assignees must be active members; an assignment snapshot is unaffected by a later template edit.
  - Permissions: only admins edit chores; a member sets only their own availability; only the assignee or an admin ticks; only the recipient decides a swap; only an admin reassigns directly.
  - Idempotency: the generation job run twice (and with `p_now` moved forward) creates one revision; reminders carry dedupe keys and never repeat.
  - Time travel with `p_now`: before the deadline nothing is generated; just after it the week appears; late availability is marked assumed.
  - Leaver: setting `left_at` through each path (leave, remove, account deletion) leaves no future assignment for the leaver, creates one new revision, writes the notifications once, and undo restores the previous revision.
  - Notifications: each action writes exactly the rows in T18 to the right people, once, with generic push text.
- **Unit (components and actions):** chore form (cadence fields, checklist add/reorder, effort), availability form, week view ordering (mine first), checklist progress, swap sheet; server actions map database errors to messages.
- **End-to-end (Playwright, desktop-chrome, several people in the shared local database):** an admin defines a chore; three people submit availability; the week is generated; each sees their chores and reasons; one ticks a checklist to completion; two swap; one leaves and the rest are told what moved; an admin undoes it.
- **Manual (real phones):** availability reminder arrives; a chore-due push arrives with no chore name on the lock screen; ticking on one phone shows on the other.
- **Performance:** `/rota` stays within its bundle budget with no existing budget raised; the chore form is split from the page; the week is read in one query.

## Boundaries

- **Always:** write only through functions that derive the caller from `auth.uid()`; keep the scheduler pure; give every generated row and notification an idempotency or dedupe key; snapshot templates into assignments; keep RLS on every new table; regenerate types; keep history and create new revisions instead of editing old ones.
- **Ask first:** photo attachments or any file storage; permanent chore assignments; changing the week start or time zone; letting members edit templates; automatic penalties or points; anything that touches money.
- **Never:** assign a chore to someone on a day they marked unavailable (except an explicit admin override); delete or rewrite an assignment; use randomness or the clock inside the scheduler; let the browser write to a rota table; put a chore name or person in a push; let a template edit change a past assignment.

## Success criteria

1. Admins can define chores with a cadence, effort and checklist, and the first flat's defaults load in one tap.
2. Members submit availability for next week; the deadline and the assumed-available rule behave as in T5, proven with `p_now`.
3. The week is generated automatically once the window closes, once only, and every person sees their chores with a plain-English reason.
4. The scheduler is deterministic, never assigns an unavailable person, and keeps the effort gap within the stated bound, proven by property tests.
5. Checklist ticks complete a chore; later template edits never change existing assignments.
6. Swaps change an assignment only after the other person accepts; admins can reassign, with their name on the record.
7. The fairness view shows effort done and owed turns that match the underlying rows.
8. When someone leaves by any path, their future chores are rebuilt fairly, affected people are told why, and an admin can undo within 24 hours.
9. No chore name or person appears in any push payload.
10. pgTAP proves cross-flat isolation and that `anon` and the browser role cannot write rota tables.
11. `pnpm check`, `pnpm db:test` and `pnpm test:e2e` pass in CI; bundle budgets hold and none is raised.

## Risks

| Risk                                                 | Mitigation                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The rotation feels unfair or unexplainable           | Pure function, property tests with a stated bound, and a plain-English reason on every assignment.                |
| Daylight saving moves a chore to the wrong day       | Dates are `date` values in London, never midnight timestamps; tests cover both clock changes.                     |
| The job runs twice or late and duplicates a week     | Unique `(household_id, week_start, revision)` and `job_runs` keys; tests run it twice and with moved time.        |
| People forget to enter availability                  | Two nudges, then assumed available and marked as such (Q1).                                                       |
| A rebuild surprises people                           | Automatic but explained, locked near-term tasks, notifications, and a 24-hour admin undo.                         |
| A template edit rewrites history                     | Assignments snapshot name, effort and checklist; a pgTAP test edits a template and checks the old week.           |
| The leaver hook is missed on one path                | A trigger on `memberships.left_at` covers leave, removal and account deletion; one test per path.                 |
| The module collides with `recurring` in shared files | The coordination document lists the shared files and who may touch them; migrations use separate filename ranges. |
| Scope creep into photos, offline and calendar        | Deferred in T13, T19 and to `events`.                                                                             |

## Open questions (with proposed defaults)

1. Availability deadline: Saturday 18:00 London for the next Sunday to Saturday week (Q3, T5). OK?
2. Nobody answers by the deadline: assumed available every day, marked "assumed", two nudges before (Q1). OK?
3. Bins are a separate light rotation on top of the weekly chores (Q2, T7). OK, or should the bins person be excluded from a weekly chore that week?
4. Sign-off by another flatmate is off by default, per chore (Q4, T13). OK?
5. Admins only edit checklist templates; members send a suggestion note (Q5, T8). OK?
6. Settled by the owner: Bins 1, Kitchen 3, Living room 4, Bathroom 2, Hallway 1, editable by admins (T4). Questions 1 and 2 are settled too, with the warning text added (T5).
7. Rebuilds after someone leaves apply automatically, with an admin undo for 24 hours and a 24-hour lock on imminent tasks (T16). OK, or would you rather preview and approve first?
8. Photo attachments deferred, like receipt photos (T13). OK?
9. Overdue chores stay with their assignee and are never reassigned automatically (Assumption 7). OK?
