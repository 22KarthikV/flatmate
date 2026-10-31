# Spec: events

Status: DRAFT, awaiting owner approval. Depends on: `household`, `notifications` (both built), and for the calendar only, read-only, on `rota`, `recurring` and `ledger` (all built). It does not change any of them. Unlocks: nothing; `extras` is independent.

## Objective

Let the flat plan something fun without a group chat that never settles. Anyone proposes an event with a few possible dates. Everyone votes yes, maybe or no on each date. As soon as more than half of the flat says yes to one date, it is confirmed and everybody is told. If that never happens, the best-supported date wins at the voting deadline. Confirmed events sit on a shared calendar next to the chores and the money dates, so one screen answers "what is happening and when?".

Capabilities from the requirements: FR-EV-1 to FR-EV-5, decision D9 (events are confirmed by majority vote), question Q6 (more than half of members vote yes, else highest yes count at the deadline), and FR-NT-3 (reminders are scheduled and never sent twice). The acceptance rules are facts the tests can prove: **a date is confirmed only by the rule below, an event is confirmed at most once, nobody outside the flat can see or vote on it, and the calendar never shows another member's rent or any amount.**

### User stories

- As a member, I propose an event with a title, a short description, a place and two or more possible dates and times, and I choose when voting closes.
- As a member, I see what is waiting for my vote, vote yes, maybe or no on each date, and change my mind until voting ends.
- As a member, I see how each date is doing ("3 yes, 1 maybe. One more yes confirms it") and who has not voted yet.
- As a member, I am told when a date is confirmed or the event is cancelled, and reminded before it happens.
- As the organiser, I can fix typos, add a date, drop a date, cancel the event, and break a tie when the vote cannot.
- As an admin, I can cancel any event (for example one whose organiser has left).
- As a member, I open one calendar and see confirmed events, my chores and the dates rent and bills fall due, without anyone's private money showing.
- As a new flatmate, I am asked to vote on events still open. As a leaving flatmate, my votes stop counting and nobody is stuck waiting for me.

## Decisions already settled (do not reopen)

| #   | Decision                                                                                                                                                                                                                                     | Source                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| S1  | Events are confirmed by majority vote: more than half of the household members vote yes on one date, else at the voting deadline the date with the highest yes count wins. Ties are broken by the organiser.                                 | D9, Q6, FR-EV-3                                                       |
| S2  | Anyone in the flat may propose an event. (Recommended default; see the questions at the end.)                                                                                                                                                | FR-EV-1                                                               |
| S3  | An event has 2 or more candidate dates, each a date and time.                                                                                                                                                                                | FR-EV-1                                                               |
| S4  | Rent is private. A member sees only their own rent. The calendar shows at most "Your rent is due", read through `my_rent()`, with no amount, and never anything about anyone else's rent.                                                    | D7, `SPEC-recurring`, `SPEC-home`                                     |
| S5  | No amounts in push text, and no event title, place or person in push text either. Push is generic ("A new event to vote on"); the inbox row holds the detail.                                                                                | N9, `SPEC-notifications`; `SPEC-ledger` L8; same as the rota's choice |
| S6  | Notification types are append-only. This module's types all start with `event_`. Each is a row in `notification_types` from our own migration plus an entry in `src/features/notifications/types.ts`; a unit test fails if the two disagree. | `PARALLEL-WORK.md`, N7                                                |
| S7  | Tenant isolation is enforced by row-level security through `authz.is_household_member`. The app never uses the service key.                                                                                                                  | `SPEC-household`, ADR-003                                             |
| S8  | Channels now are the inbox and web push. Email is deferred (N2). Each person chooses per type, as for every other module.                                                                                                                    | N1, N2                                                                |
| S9  | Times are shown in `Europe/London`. Stored as `timestamptz`.                                                                                                                                                                                 | Requirements section 1                                                |
| S10 | Reminders are scheduled by `pg_cron` plus a `job_runs` key, deduplicated by `notify`'s unique `(recipient, dedupe_key)`. No new scheduler and no Edge Function.                                                                              | N6, ADR-002                                                           |
| S11 | Writes go only through `security definer` functions that derive the caller from `auth.uid()`. The browser role has no insert, update or delete on any events table.                                                                          | Pattern of rota, recurring                                            |
| S12 | History is kept. Nothing is deleted when an event is cancelled, a date is dropped or a person leaves.                                                                                                                                        | Requirements 6.1 (soft delete)                                        |

## Behaviour in plain words

### Proposing

1. A member taps "Propose an event" on the Events tab.
2. They give a **title** (up to 80 characters), an optional **description** (up to 500), an optional **place** (up to 100) and **2 to 8 possible dates and times** (each optionally with an end time). Every date must be in the future.
3. They choose **when voting closes**. The form suggests three days from now, or one day before the earliest date if that is sooner (the owner can change this default). Voting must close after now and before the earliest date.
4. Every other member is told "Sam proposed: Pizza night" in their inbox, with a push if they have it on. The organiser is not told about their own action.
5. A flat can have at most 10 events still being voted on at once, so the list stays readable.

### Voting

1. Each member sees every candidate date with three buttons: **Yes**, **Maybe**, **No**. Not answering is not the same as "No": it just means "not voted yet".
2. A member can change any answer until voting ends. The organiser votes like everyone else.
3. Under each date everybody sees the count ("3 yes, 1 maybe, 0 no") and a plain line about what it still needs ("One more yes confirms this date"). Flatmates can see who voted what, by name (they live together, and it lets people nudge each other). The screen says so.
4. **Only yes counts toward confirming.** "Maybe" is shown so people can plan, but it is not a yes.

### How a date is confirmed

Let N be the number of current members of the flat at that moment. A date has a **majority** when its yes votes are **more than N divided by two** (3 of 5, 3 of 4, 2 of 3, 2 of 2, 1 of 1). Only current members' votes count.

1. **Early confirmation.** The moment a vote gives one date a majority, that date is confirmed and voting stops. One vote changes one date's count, so two dates cannot cross on the same vote.
2. **At the deadline.** If nothing has a majority when voting closes, the date with the **most yes votes** wins, as long as it has at least one yes.
3. **Ties.** If two or more dates share the top yes count, the **organiser picks** one of those dates. They are asked once, with a reminder, and the event is shown as "Waiting for {organiser} to pick". If the organiser does nothing for 48 hours, the earliest of the tied dates is chosen so the event is never stuck.
4. **Nobody said yes.** If voting closes and no date has any yes, the event is cancelled with the reason "Nobody could make any of the dates", and everyone is told. Anyone can propose it again.
5. Confirmation happens once. Later votes, joins or leaves never un-confirm a confirmed event.

### Changing or cancelling

- **Organiser, while voting:** can edit the title, description and place, move the deadline later (or earlier, if still in the future), add a date, and drop a date as long as two remain. Dropping or adding a date does not clear other dates' votes. People who had voted on a dropped date are told. Everyone is told when title, place or dates change ("Pizza night was updated").
- **Organiser, once confirmed:** can fix the title, description and place, and can cancel. The confirmed date cannot be moved. To move it, cancel and propose again.
- **Cancelling** (organiser or any admin) asks for an optional short reason. Everyone is told.
- Admins can cancel any event but not edit it.

### Members joining and leaving mid-vote

- **Someone joins.** They count in N from that moment (so a 5-person flat needing 3 yes becomes a 6-person flat needing 4). They are told about each event still being voted on and can vote. A confirmed event is not reopened; they simply see it on the calendar.
- **Someone leaves, is removed, or deletes their account.** Their votes stay in the history but stop counting, and N shrinks. Because N shrank, a date may now have a majority, and it is then confirmed (and everybody told). If two dates reach a majority at the same instant this way, the one with more yes wins; if they are level it goes to the organiser as a tie.
- **The organiser leaves.** Their open and upcoming events pass to the longest-standing admin, who is told. Their name stays on the history as "Deleted user" if the account is gone.
- **Flat closed.** Nothing happens; the flat is closed and its rows are read-only history.

### The shared calendar

A page that lists, by day, for the next 8 weeks (with earlier and later months a tap away):

| Shows                 | Who sees it    | Detail                                                                                                                                                                        |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed events      | the whole flat | Title, time, place.                                                                                                                                                           |
| Events being voted on | the whole flat | Not on the calendar itself. They appear in a "Still deciding" strip above it (FR-EV-4 asks for confirmed events).                                                             |
| My chores             | me             | The chores I am assigned, on their due day, from the generated rota weeks. Only weeks the rota has already generated appear. Links to the chore.                              |
| Bills due             | the whole flat | Bill name and due date, **no amount**, from the bill months the Money screens already read. A skipped or cancelled bill is not shown. Links to the bill month.                |
| My rent due           | me only        | "Your rent is due" on my due date, **no amount**, from `my_rent()`. Nobody else's rent, and no collector or paid status. A member whose flat has no rent set up sees nothing. |
| Rota deadline         | the whole flat | "Rota availability closes", the same date the Home page already shows.                                                                                                        |

The calendar is built from readers that already exist and respect their own privacy rules, so it adds no new way to see money. Whether to show other people's chores, or amounts of any kind, is an owner question below; the default is no.

### Reminders

- **Before the event:** a reminder about a day before and another about two hours before, to everyone in the flat except people who voted **No** on the confirmed date. A reminder is skipped if its moment was already past when the event was confirmed (so confirming at 9pm for 10am tomorrow does not send a "tomorrow" reminder). Times are approximate to the hour because the job runs hourly.
- **Voting about to close:** one reminder, about a day before the deadline, to members who have not voted on this event.
- **Tie waiting for the organiser:** the organiser is asked straight away and reminded after 24 hours.
- Each reminder is sent once per person (dedupe key), even if the job runs twice. A person who snoozes a reminder gets it later; one who turned a type off gets nothing for it.

## Assumptions (correct me)

1. A flat's events are visible only to its current members. A person who has left sees nothing new from that flat.
2. Candidate dates are single moments with an optional end time. Multi-day trips are entered by choosing the start (and an end time can be days later). A per-day "all day" option is not included.
3. There is no per-event guest list, headcount or cost split. If an event costs money, people use Money as they do today.
4. Nobody can be forced to attend. "Yes" means "I can make this date", not "I must come".
5. There are no recurring events (a weekly film night). Each is proposed separately.
6. Calendar export (to a phone calendar) is not in this spec.

## Tech and structure

### Files

```
src/features/events/
  schemas.ts          zod: propose / edit form, date list limits, vote answer, deadline rules
  majority.ts         pure: threshold, tally per date, "needs N more yes", leading date, tie detection
  parity-vectors.ts   shared cases used by Vitest and pgTAP (same approach as recurring/parity-vectors.ts)
  format.ts           dates and times in Europe/London, "Fri 6 Nov, 19:30", relative deadline text
  errors.ts           database error codes to plain messages (same shape as rota/errors.ts)
  events.ts           server: open events with my votes, one event with all votes, confirmed events
  calendar.ts         server: gathers events, my chores, bills, my rent, deadline for a date range
  calendar-model.ts   pure: merges them into days, sorts, drops anything private, dedupes
  actions.ts          server actions: proposeEvent, updateEvent, addOption, removeOption,
                      castVote, cancelEvent, decideTie
  event-form.tsx      propose / edit form (client, loaded lazily)
  event-card.tsx      a row in the list: title, status, my answer, next step
  vote-panel.tsx      the yes / maybe / no buttons per date, counts, who has voted
  organiser-panel.tsx edit, drop date, cancel, pick after a tie
  calendar-view.tsx   the agenda by day
src/app/(app)/events/page.tsx                  existing placeholder, replaced
src/app/(app)/events/new/page.tsx              propose
src/app/(app)/events/[id]/page.tsx             one event: vote, results, organiser actions
src/app/(app)/events/[id]/edit/page.tsx        organiser: edit
src/app/(app)/events/calendar/page.tsx         the shared calendar
supabase/migrations/20261141000000_events.sql              tables, constraints, RLS, guards
supabase/migrations/20261142000000_events_write.sql        write functions, majority logic, notification types
supabase/migrations/20261143000000_events_schedule.sql     deadline and reminder job, join/leave trigger
supabase/tests/database/events-schema.test.sql
supabase/tests/database/events-voting.test.sql
supabase/tests/database/events-schedule.test.sql
supabase/tests/database/events-membership.test.sql
e2e/events.spec.ts
```

Pages follow the existing pattern in `src/app/(app)/events/page.tsx` and `src/app/(app)/rota/assignments/[id]/page.tsx`: request data is read inside `Suspense` under `RequireFlat` (the project runs with `cacheComponents`), and dynamic route `params` and `searchParams` are promises. This Next.js version differs from older ones, so the build task reads the relevant guide in `node_modules/next/dist/docs/` (the install is in the main repo) before writing any page, and does not copy patterns from memory.

Reuse, do not rebuild: `authz.is_household_member`, `authz.current_profile_id`, `private.notify`, `private.notify_flatmates`, `private.notification_name`, `public.job_runs`, `cron.schedule`, `getMembership`, `getMembers`, `getWeeks`, `getBillMonths`, `getMyRent`, `londonDate`, `londonWallTime` and `availabilityDeadline` (`rota/week.ts`), the `Card` components and the rota's error-message pattern. No new dependency.

### Data model

Three tables, as the requirements list. All have `household_id` and RLS. Column names follow the existing tables (`profiles.id` is what `*_id` columns point at, as `away_periods.profile_id` does).

```sql
create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  organiser_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  location text check (location is null or char_length(location) between 1 and 100),
  -- voting: open. tiebreak: voting closed, the organiser must pick among tied dates.
  status text not null default 'voting' check (status in ('voting', 'tiebreak', 'confirmed', 'cancelled')),
  vote_deadline timestamptz not null,
  tiebreak_since timestamptz,
  -- Set together when a date is confirmed. starts_at / ends_at are copied from the date for fast calendar reads.
  confirmed_option_id uuid,
  confirmed_at timestamptz,
  confirmed_by text check (confirmed_by in ('majority', 'deadline', 'organiser', 'auto_tiebreak', 'member_change')),
  starts_at timestamptz,
  ends_at timestamptz,
  cancelled_at timestamptz,
  -- Null when the app cancelled it (nobody said yes).
  cancelled_by uuid references public.profiles (id),
  cancelled_reason text check (char_length(cancelled_reason) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((confirmed_option_id is null) = (confirmed_at is null)),
  check ((confirmed_option_id is null) = (starts_at is null)),
  check (status <> 'confirmed' or confirmed_option_id is not null),
  check (status not in ('voting', 'tiebreak') or confirmed_option_id is null),
  check (status <> 'tiebreak' or tiebreak_since is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);

create table public.event_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  household_id uuid not null references public.households (id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- A dropped date keeps its row and its votes, but counts for nothing.
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  unique (id, event_id)
);
-- The same date cannot be offered twice on one event (while it is still offered).
create unique index event_options_one_per_time on public.event_options (event_id, starts_at) where removed_at is null;
create index event_options_flat_time on public.event_options (household_id, starts_at);

alter table public.events
  add constraint events_confirmed_option_fk
  foreign key (confirmed_option_id, id) references public.event_options (id, event_id);

create table public.event_votes (
  option_id uuid not null,
  event_id uuid not null,
  household_id uuid not null references public.households (id),
  profile_id uuid not null references public.profiles (id),
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Unique per option and person, as the requirements say.
  primary key (option_id, profile_id),
  foreign key (option_id, event_id) references public.event_options (id, event_id)
);
create index event_votes_event on public.event_votes (event_id);
create index event_votes_person on public.event_votes (profile_id, event_id);
```

**Other indexes.** `events (household_id, status, vote_deadline)` partial where `status in ('voting','tiebreak')` for the deadline job and the list; `events (household_id, starts_at)` partial where `status = 'confirmed'` for the calendar and reminders. Both lead with `household_id` as the requirements' tenant-key rule says.

**Triggers.** `set_updated_at` on `events` and `event_votes` (the same helper other tables use). A **guard trigger** (`private.events_guard_vote`, modelled on the rota's `rota_guard_*` functions) refuses an insert or update on `event_votes` unless the event is `voting`, the option is not removed, and the vote's `household_id` and `event_id` match the option. This is belt and braces behind the functions, so even a future function with a bug cannot let a vote land on a closed event. Another refuses to change `household_id` or `organiser_id` except through the organiser-hand-over function.

**Row-level security** (every table; `enable row level security`, `revoke all ... from anon, authenticated`, then grant select only):

| Table           | Select policy                                                                                  | Insert / update / delete                         |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `events`        | `authz.is_household_member(household_id)` (current members only)                               | none for `authenticated`; none at all for `anon` |
| `event_options` | `authz.is_household_member(household_id)`                                                      | none                                             |
| `event_votes`   | `authz.is_household_member(household_id)`, so flatmates can see each other's answers by design | none                                             |

**Functions.** All `security definer`, `set search_path = ''`, written with fully qualified names, `revoke all ... from public, anon`, then `grant execute ... to authenticated` for the public ones; `private.*` ones are revoked from everybody but their callers, exactly as `private.notify` and the rota functions are. The caller is always `authz.current_profile_id()`, never an argument. Each takes the event row's lock (`select ... from public.events where id = ... for update`) before reading votes, the same way `leave_household` locks the flat, so two simultaneous votes cannot both "complete" a majority or confirm twice.

| Function                                                                                | Who may call              | What it does                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.propose_event(p_title, p_description, p_location, p_options jsonb, p_deadline)` | any current member        | Validates lengths, 2 to 8 future dates, deadline after now and before the earliest date, and the 10-open-events cap. Inserts the event and options, notifies the flat. Returns the event id.                   |
| `public.update_event(p_event, p_title, p_description, p_location, p_deadline)`          | organiser                 | Edits text; moves the deadline only while `voting`. Notifies on a real change.                                                                                                                                 |
| `public.add_event_option(p_event, p_starts_at, p_ends_at)`                              | organiser, while `voting` | Adds a date (max 8).                                                                                                                                                                                           |
| `public.remove_event_option(p_option)`                                                  | organiser, while `voting` | Sets `removed_at`; refuses if fewer than 2 would remain. Re-checks the majority (a drop cannot create one, but keeps the rule in one place).                                                                   |
| `public.cast_event_vote(p_option, p_answer)`                                            | any current member        | Upserts the caller's answer (or clears it with a null answer), only while `voting`. Then runs `private.events_evaluate`.                                                                                       |
| `public.cancel_event(p_event, p_reason)`                                                | organiser or admin        | Allowed in `voting`, `tiebreak` and `confirmed`. Notifies the flat.                                                                                                                                            |
| `public.decide_event_tie(p_event, p_option)`                                            | organiser                 | Only in `tiebreak`, and only for an option that is among the tied leaders. Confirms it.                                                                                                                        |
| `private.events_tally(p_event)`                                                         | internal                  | Returns yes, maybe and no per live option, counting only current members' votes, plus N.                                                                                                                       |
| `private.events_evaluate(p_event, p_now, p_deadline_passed)`                            | internal                  | The one place the rule lives. Applies early majority, the deadline rule, ties and "nobody said yes". Idempotent: it only moves `voting` to `confirmed`, `tiebreak` or `cancelled`, and does nothing otherwise. |
| `private.events_confirm(p_event, p_option, p_by)`                                       | internal                  | Sets the confirmed fields and notifies once (dedupe key per event).                                                                                                                                            |

The majority test is `yes > N / 2` written as `yes * 2 > N` in integers, so there is no rounding. N is `count(*)` of `memberships` with `left_at is null` for the flat; a vote counts only if its voter is in that set.

### Notifications

New rows in `notification_types`, appended by `20261142000000_events_write.sql` with the same two statements the ledger, recurring and rota migrations use: an `insert into public.notification_types (type, default_in_app, default_push, snoozable)` and an `update ... set push_title = ..., push_body = ...` per type (the `push_title` and `push_body` columns were added by the ledger migration, and the push worker sends them instead of the inbox row's own text). The same ids are added to the `NotificationType` union and `NOTIFICATION_TYPES` in `src/features/notifications/types.ts`, and the existing test that compares the two keeps them in step. Nothing existing is edited. `notifications.href` must be an internal path, so every link below is a `/events/...` path.

| Type                      | Goes to                                                             | Inbox title (can name the event)                   | Default in app / push / snoozable | Push title and body (fixed, generic)                             | Dedupe key                              |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| `event_proposed`          | every other current member; a joiner, for each open event           | "Sam proposed: Pizza night"                        | yes / yes / no                    | "A new event to vote on" / "Open FlatMate to take a look."       | `event_proposed:<event>`                |
| `event_changed`           | every current member except the editor; voters on a dropped date    | "Pizza night was updated"                          | yes / no / no                     | "An event was updated" / "Open FlatMate to see what changed."    | `event_changed:<event>:<update number>` |
| `event_confirmed`         | every current member (the confirming vote's author included)        | "Pizza night is on: Fri 6 Nov, 19:30"              | yes / yes / no                    | "An event is confirmed" / "Open FlatMate to see when."           | `event_confirmed:<event>`               |
| `event_cancelled`         | every current member except the canceller                           | "Pizza night was cancelled"                        | yes / yes / no                    | "An event was cancelled" / "Open FlatMate to see why."           | `event_cancelled:<event>`               |
| `event_vote_reminder`     | current members who have not voted, about a day before the deadline | "Vote on Pizza night before Wed 4 Nov"             | yes / yes / yes                   | "An event needs your vote" / "Open FlatMate to vote."            | `event_vote_reminder:<event>`           |
| `event_tiebreak`          | the organiser (asked straight away, reminded after 24 hours)        | "Pizza night is tied: please pick a date"          | yes / yes / no                    | "An event needs you to pick a date" / "Open FlatMate to choose." | `event_tiebreak:<event>:<1 or 2>`       |
| `event_reminder`          | current members except people who voted No on the confirmed date    | "Pizza night is tomorrow, 19:30" / "...in 2 hours" | yes / yes / yes                   | "An event is coming up" / "Open FlatMate to see the details."    | `event_reminder:<event>:day` / `:hour`  |
| `event_organiser_changed` | the new organiser                                                   | "You are now organising Pizza night"               | yes / no / no                     | "You are organising an event" / "Open FlatMate to see it."       | `event_organiser:<event>:<profile>`     |

Rules: nobody is told about their own action; every call goes through `private.notify` or `private.notify_flatmates` inside the same transaction as the change, so a failed change sends nothing; because `notify` checks that the recipient is a current member of that flat, nobody outside the flat can receive one. Channels are the inbox and push only, controlled per type by the existing preferences screen at `/more/notifications`. There is no email (N2).

### Scheduled work

One pg_cron job, no Edge Function, modelled on `rota-reminders`:

- `private.events_run(p_now timestamptz)` does everything, taking the time as a parameter so tests can move through it. `private.run_events_hourly()` wraps it with a `job_runs` row named `events-hourly`, key `YYYY-MM-DD"T"HH24` (UTC), `on conflict do nothing`, and success or failure recorded. A second run in the same hour does nothing.
- Registered with `select cron.schedule('events-hourly', '47 * * * *', 'select private.run_events_hourly()')`. Minute 47 is free: heartbeat and the daily jobs use minute 0, rota uses 7, 17, 37 and every 10 minutes, retention uses 17 past 3am, and push delivery runs every minute. `PARALLEL-WORK.md` asks each module to pick a different minute.
- Work per run, in order: (1) for each `voting` event past its deadline call `events_evaluate(..., true)`; (2) for each `tiebreak` event older than 48 hours, auto-pick the earliest tied date; (3) the organiser's 24-hour tie reminder; (4) vote reminders; (5) event reminders. Each step is safe to repeat because state moves only forward (`voting` to something else) and every notification has a dedupe key.
- Only flats with at least one event are touched, and closed flats are skipped.

A trigger on `memberships` (the same style as `rota_note_member_left`, which is how the rota hooks leavers without editing anyone else's code) handles joins and leaves:

- **After insert** (a member joins): send `event_proposed` for each event still in `voting`, dedupe key per event so a re-join does not repeat.
- **After update of `left_at`** (leave, removal, account deletion; not `flat_closed`): hand the person's open and upcoming events to the longest-standing active admin (with `event_organiser_changed`), then call `events_evaluate` for each open event, since N just got smaller.

### Security and privacy

- **Who sees what.** Members of the flat see its events, dates, places and everyone's answers. Nobody else sees anything: a member of flat A reads zero rows of flat B, `anon` reads nothing, a former member sees nothing new. No event data is public or shared by link.
- **No service key in the app.** Every read and write from the app runs as the signed-in person, through RLS or a function that checks the caller. The hourly job runs inside the database.
- **Calendar privacy.** The calendar reads only through existing readers: rent through `my_rent()` (own rows only, due date only, amount dropped before rendering), bills through `getBillMonths` (name and date only; the amount is dropped before rendering), chores through the rota readers (own assignments). A test proves no amount or other person's rent reaches the component.
- **Push is generic.** No title, place, name or time in any push (S5). The page title never contains event details.
- **Input validation twice.** Lengths, date limits and the open-event cap are checked by the form (friendly messages) and again by the function and table constraints (the enforcement). Text is rendered as text, never as HTML, and links are never made from user text.
- **Privacy page.** The data list on `src/app/(public)/privacy/page.tsx` gets a new section, "What we store about events", saying: the events you propose (title, description, place, dates, when voting closes), the dates offered, your yes/maybe/no answers (**which your flatmates can see**), who organised and who cancelled an event, and that when you leave or delete your account your answers stay as part of the flat's history under "Deleted user" but stop counting. `src/features/legal/privacy-matches-data.test.tsx` gets a case listing every column of `events`, `event_options` and `event_votes`, so adding a column fails the test until the notice is read.
- **Leaving and account deletion.** `delete-account` does not change: it already anonymises the profile after `end_memberships_for_account` ends the membership. The membership trigger above does the event work for every path (leave, removal, account deletion), the way the rota does. **Hook status:** this spec needs **no edit** to `end_memberships_for_account` or `private.can_leave`, because leaving should never be blocked by an event and the trigger sees every path. If the orchestrator prefers a central hook instead of a trigger, that is requested as a separate small PR to the orchestrator before the events task that needs it, and this module does not edit those functions. Data export: the app has no export screen yet; when it exists it must include the person's votes and proposed events (noted for that work).
- **Abuse limits.** At most 8 dates and 10 open events per flat, 80/500/100 character limits, one answer per person per date by primary key.

### Routes

| Route               | Who                              | Behaviour                                                                                                                                                                                                                    | Budget (KB, first-load JS)             |
| ------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `/events`           | flat members                     | The Events tab. "Needs your vote" first, then "Waiting for the organiser", "Coming up" (confirmed), a link to the calendar and "Propose an event". Past and cancelled events in a collapsed list.                            | 200 (already in `bundle-budgets.json`) |
| `/events/new`       | flat members                     | Propose form: title, description, place, 2 to 8 dates, voting deadline.                                                                                                                                                      | 200 (new)                              |
| `/events/[id]`      | flat members of the event's flat | The event: dates with counts and answer buttons, who has voted, status line. Organiser panel (edit, drop date, cancel, pick after a tie); admins see Cancel. A different flat's id looks like "We couldn't find that event." | 200 (new)                              |
| `/events/[id]/edit` | organiser                        | Edit text, deadline, add or drop dates.                                                                                                                                                                                      | 200 (new)                              |
| `/events/calendar`  | flat members                     | The shared calendar by day; `?month=YYYY-MM` moves between months.                                                                                                                                                           | 200 (new)                              |

`scripts/bundle-budgets.json` gets four new entries (`/events/new`, `/events/[id]`, `/events/[id]/edit`, `/events/calendar`), each **200**, matching the other app routes. No existing budget is raised, and the whole feature must fit: the list, vote panel and calendar are server components; only the vote buttons (a tiny client form) and the lazily imported event form are client code. If a route cannot fit in 200 KB the fix is to split code, not raise the number.

### Navigation

The Events tab is already in the bottom bar (`src/features/shell/nav-items.ts`, `href: "/events"`), so `nav-items.ts` and `nav.tsx` do not change. `isActive` already treats `/events/...` as the Events tab. The only shell change is replacing the placeholder page. The Events tab does not show a badge in this spec (the Home page and the bell carry the "vote" prompt).

### How it appears on the Home page

This spec does not edit the home page. It proposes two small additions for the home work to take, using a reader the events feature will export (`getEventsForHome()`, plain RLS reads, no new SQL):

1. **Waiting on you:** one line per open event I have not voted on, at the same priority as a swap: "Vote on Pizza night. Closes Wed 4 Nov", linking to `/events/<id>`. An event waiting on me to break a tie is a line too ("Pick a date for Pizza night"). These join the existing four-line cap and "and N more".
2. **Coming up:** confirmed events in the next 14 days as dated lines, "Pizza night, Fri 6 Nov, 19:30", linking to the event. Titles are fine on screen; Home still shows no amounts. This adds events to `buildComingUp` input and keeps its date sort.

Both are hidden when there are none. Home must keep `/dashboard` at 200 KB; these are server-rendered lines.

## Commands

Same as the other modules: `pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types` (regenerates `src/lib/db/types.ts`, never edited by hand or conflict-resolved by hand), `pnpm test:e2e`. Hosted rollout: the orchestrator applies each migration to the hosted database in merge order, then the PR merges. No Edge Function and no new environment variable, so the owner has nothing to deploy. `docs/DEPLOY.md` gets an "Events" section (the job, the migration range and phone checks) and nobody else's sections are edited.

## Testing strategy

**pgTAP (written first, one file per migration; style of `rota-away.test.sql`: `begin; select plan(n); ... rollback`):**

- `events-schema.test.sql`: the three tables exist with RLS on; `anon` has no privilege and `authenticated` has select only; `event_votes` has the primary key `(option_id, profile_id)`; a vote cannot name an option from another event; an option's `ends_at` must be after `starts_at`; the confirmed-fields checks hold; a member of flat A reads zero rows from flat B in all three tables and cannot call the functions against B's ids; a person who has left sees nothing.
- `events-voting.test.sql`: parity vectors (below) for the tally; early majority confirms on the vote that crosses (3 of 5, 2 of 3, 1 of 1, 2 of 4 does not, 3 of 4 does); "maybe" and "no" never confirm; a member who left does not count either as voter or in N; a second vote from the same person updates, not duplicates; voting on a closed, tied, confirmed or cancelled event is refused; the guard trigger blocks a direct insert; the open-event cap and 2 to 8 dates are enforced; only the organiser edits, only organiser or admin cancels, only the organiser picks and only among tied dates; two dates cannot both be confirmed (second `events_evaluate` is a no-op).
- `events-schedule.test.sql` (time travel with `p_now`): before the deadline nothing happens; just after it the highest-yes date is confirmed; a tie moves the event to `tiebreak`; 48 hours later the earliest tied date is chosen; no yes votes cancels with the stated reason; running the job twice and an hour later creates one confirmation and one set of reminders; a reminder whose moment passed before confirmation is skipped; people who voted No on the confirmed date get no event reminder; push rows carry the generic fixed text and no event title; every notification type exists in `notification_types` with the stated defaults.
- `events-membership.test.sql`: a joiner is notified about each open event once and counts in N; a leaver's votes stay but stop counting; a leave through each path (`leave_household`, `remove_member`, account deletion via `end_memberships_for_account`) can complete a majority and confirms once; an organiser who leaves hands open and upcoming events to an admin, who is notified; a closed flat does nothing.
- Also asserted: no event table is in the `supabase_realtime` publication.

**Vitest:**

- `majority.ts` against `parity-vectors.ts`: the SQL file copies the same numbers, so TypeScript and SQL cannot drift (precedent: recurring's bill-split vectors). Property cases: with N from 1 to 12 and random votes, a majority is `yes * 2 > N`, at most one date can cross on one vote, and "votes still needed" is never negative.
- `schemas.ts`: title, description and place limits; 2 to 8 dates; dates in the future; deadline before the earliest date; duplicate times rejected.
- `format.ts`: London times across both clock changes (a 19:30 event the Friday after the clocks change); "closes in 2 days" wording.
- `calendar-model.ts`: merges events, chores, bills, rent and the rota deadline in date order; a bill or rent value never carries an amount into the output; another person's rent is impossible to pass in; cancelled and skipped items are dropped; an empty range gives a calm "Nothing planned" state; events being voted on are not on the grid.
- `errors.ts`: every database error code maps to a plain sentence.
- Components: vote panel (buttons mark my answer, the counts and the "needs one more yes" line, a closed event hides the buttons), event card statuses, organiser panel shows only to the organiser, form validation messages, calendar day grouping.
- Notification registry: the eight `event_` types are in `types.ts` and match the migration defaults.
- Privacy test: the three tables' columns are listed (see above).

**End-to-end (Playwright, `desktop-chrome`, several people in the shared local database, style of `e2e/rota-away.spec.ts` using `signUpAndIn`, `createFlat`, `joinFlat`)** in `e2e/events.spec.ts`, one journey: three flatmates; A proposes "Pizza night" with two dates; B and C see "Needs your vote"; B votes yes on the first date, nothing is confirmed (1 of 3); C votes yes on the same date, the event is confirmed and A sees it on the calendar; the calendar also shows A's rent as "Your rent is due" with no amount and does not show B's; a fourth flatmate is not in the flat and cannot open the event link; A cancels and B sees it cancelled. Push delivery itself is covered at the database level (the outbox rows) as for other modules.

**Manual (real phones, in `DEPLOY.md`):** a proposal reaches a second phone as a push with generic text; confirming sends "An event is confirmed"; the reminder arrives with no event name on the lock screen; the calendar at 360px has no sideways scroll; voting buttons are at least 44px tall.

**Gates that stay green:** lint, typecheck, unit, build, `pnpm check:bundle` (no budget raised), Lighthouse targets on pages already audited. New pages meet WCAG 2.1 AA: status is never colour alone (each answer and status carries a word), buttons have visible focus, the vote buttons form a labelled group per date.

## Phased task breakdown

Each task is one branch and one PR, tests first, shippable in order. A task with a migration asks the orchestrator to apply it before merge. Migration numbers stay in 20261141..20261160; spare numbers are left for fixes.

| Task | Delivers                                                                                                                                                                                                                             | Migration                            | Needs  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------ |
| E1   | Tables, constraints, indexes, RLS, guard trigger, `majority.ts` and parity vectors, schemas, privacy page section and test, `DEPLOY.md` stub. pgTAP `events-schema`.                                                                 | `20261141000000_events.sql`          | none   |
| E2   | Write functions, `events_evaluate`, the eight notification types (migration and `types.ts`), `/events` list, `/events/new`, `/events/[id]` with voting, organiser actions; bundle budgets for the new routes. pgTAP `events-voting`. | `20261142000000_events_write.sql`    | E1     |
| E3   | Hourly job: deadline confirmation, tiebreak, reminders; join and leave trigger with organiser hand-over. pgTAP `events-schedule` and `events-membership`.                                                                            | `20261143000000_events_schedule.sql` | E2     |
| E4   | `/events/calendar`: `calendar.ts` and `calendar-model.ts`, privacy tests, link from `/events`. Vitest only; no migration.                                                                                                            | none                                 | E2     |
| E5   | One e2e journey, `DEPLOY.md` section with phone checks, the home-page proposal handed to whoever owns Home. Hosted rollout and manual phone checks.                                                                                  | none                                 | E3, E4 |

E4 and E3 touch different files and can run side by side once E2 lands. Anything that changes a migration, `notification_types` or `types.ts` stays with the module session, one writer at a time.

## Shared files this module touches

Small and append-only, per `PARALLEL-WORK.md`; whoever merges second rebases.

- `notification_types` rows (new migration) and `src/features/notifications/types.ts` (eight `event_` entries).
- `scripts/bundle-budgets.json`: four `/events/...` routes at 200; the existing `/events` entry unchanged.
- `src/app/(public)/privacy/page.tsx` and `src/features/legal/privacy-matches-data.test.tsx`: an events section and test case.
- `src/lib/db/types.ts`: regenerated after each migration.
- `docs/DEPLOY.md`: a new "Events" section.
- `src/app/(app)/events/page.tsx`: placeholder replaced (this module owns it).
- Not touched: `nav-items.ts`, `nav.tsx`, `end_memberships_for_account`, `private.can_leave`, the delete-account function, any ledger, recurring or rota file, `SPEC-extras.md` and its files.
- Migration range: 20261141..20261160 only. The latest existing migration is `20261126000000_rota_away.sql` and Home reserves 20261131..20261140.

## Boundaries

- **Always:** write only through functions that derive the caller from `auth.uid()`; take the event's lock before counting; give every notification a dedupe key; keep push text generic; keep RLS on every table; regenerate types; keep history (drop and cancel, never delete); show times in London time.
- **Ask first:** letting only admins propose; counting "maybe" toward a majority; hiding who voted what; showing any amount or other people's chores on the calendar; adding email, calendar export, recurring events, guest lists, costs or a photo; raising a bundle budget; adding an Edge Function or a new scheduler; changing a shared hook.
- **Never:** put an event title, place, person or amount in a push; show another member's rent or any rent amount on the calendar; let the browser write an events table; confirm an event twice or un-confirm it; use the service key from the app; count a vote from someone who has left; edit `end_memberships_for_account` or `private.can_leave` from this module.

## Success criteria

1. Any member can propose an event with 2 to 8 dates, and the rest of the flat is told once.
2. A date is confirmed the moment it gets more than half of the current members' yes votes, and by no other path before the deadline; "maybe" and "no" never confirm. Proven by the shared vectors in TypeScript and pgTAP.
3. At the deadline the highest-yes date wins, a tie goes to the organiser (auto-picked after 48 hours), and an event with no yes votes is cancelled with a stated reason. Proven with `p_now`.
4. An event is confirmed at most once, even with simultaneous votes or the job running twice.
5. A joiner counts and is asked to vote; a leaver by any of the three paths stops counting and can complete a majority; an organiser who leaves hands over to an admin.
6. pgTAP proves cross-flat isolation on all three tables, that `anon` and the browser role cannot write, and that no table is on Realtime.
7. The calendar shows confirmed events, the viewer's own chores, bill names and dates, the viewer's own "rent is due" and the rota deadline, and never an amount or someone else's rent, proven by test.
8. No push contains an event title, place, person or amount.
9. Reminders arrive about a day and about two hours before, once per person, skipped when already past at confirmation.
10. The privacy page names the data, says flatmates can see each other's answers, and its test fails if a column is added without it.
11. `pnpm check`, `pnpm db:test`, `pnpm test:e2e` pass in CI; all five `/events` routes are within 200 KB and no budget was raised.

## Risks

| Risk                                                          | Mitigation                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two votes arrive together and confirm two dates or twice      | Event row lock before counting; `events_evaluate` only moves `voting` forward; unique dedupe key on the confirmation; pgTAP double-call test.    |
| The majority rule differs between the screen and the database | One rule in SQL (`yes * 2 > N`), TypeScript only for display, both tested against the same vectors.                                              |
| A member leaves or joins and the vote quietly changes meaning | Trigger re-evaluates on every membership change; the screen always shows N and the number needed; tests per leave path.                          |
| The calendar leaks money                                      | Built only from existing readers; amounts are dropped in a pure function that tests prove; rent comes only from `my_rent()`.                     |
| A tie or an absent organiser leaves an event stuck            | 48-hour auto-pick of the earliest tied date; hand-over when the organiser leaves; admins can cancel.                                             |
| Reminders fire at odd times or twice                          | Dedupe keys; `job_runs` key per hour; skip rules for missed windows; London-time tests across both clock changes.                                |
| Push noise as events pile up                                  | Defaults: only proposed, confirmed, cancelled, reminders and "needs you" push; "updated" and organiser change are inbox only; per-type switches. |
| Cron minute clashes with another module                       | Minute 47 is unused today; checked against every `cron.schedule` and `register_edge_job` in the migrations.                                      |
| Bundle budget exceeded by forms and calendar                  | Server components for lists and calendar, lazy form, vote buttons as tiny client forms; fix by splitting code, never by raising a budget.        |
| The Home page change stalls                                   | Events ships fully without it; Home reads `getEventsForHome()` whenever its owner takes it.                                                      |
| Migration range collides with another module                  | Range is fixed to 20261141..20261160; checked against `supabase/migrations` before each PR.                                                      |

## Open questions for the owner

1. **How should the "more than half" rule handle the awkward cases?** Recommended default: only "yes" counts (a "maybe" is shown but does not confirm); if the top dates are tied at the deadline the organiser picks, and if they do nothing for 48 hours the earliest tied date wins; if nobody said yes the event is cancelled. In a flat of 4, 2 yes is not enough, 3 is.
2. **When should voting close by default?** Recommended default: three days after the proposal, or one day before the earliest date if that comes sooner. The proposer can change it. Does that suit your flat?
3. **When should reminders arrive?** Recommended default: one reminder about a day before the event and one about two hours before, to everyone except people who voted No on the chosen date, plus one nudge a day before voting closes for people who have not voted.
4. **Who can propose an event?** Recommended default: any member, as the requirements say. Alternative: admins only, or any member with an admin able to cancel. Is "anyone" right?
5. **What should the shared calendar show besides events?** Recommended default: confirmed events, your own chores, the names and due dates of bills (no amounts), a line "Your rent is due" on your own due date (no amount), and the rota availability deadline. It would not show flatmates' chores or any money. Do you want other people's chores on it, or less than this?
6. **Should flatmates see who voted what?** Recommended default: yes, by name, because five people living together can nudge each other and it avoids "who has not answered" questions, and the screen and privacy page say so. Alternative: show only the counts and who has voted, not their answers. (Exporting the calendar to a phone calendar is left out of this version; say so if you want it next.)
