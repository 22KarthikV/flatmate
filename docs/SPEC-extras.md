# Spec: extras

Status: approved by owner, all recommended defaults accepted. Depends on: `household`, `notifications` and `ledger` (all built). It reuses, and does not change, `recurring` and `rota` code. Unlocks: nothing; it is a leaf module. Runs alongside `events` (its own spec) and shares no tables or screens with it.

## Objective

The big modules (money, rota, events) cover the heavy parts of flat life. Day to day, a flat also runs on small things: "we're out of washing-up liquid", "which bin goes out tonight?", "the boiler is leaking again", "what was the gas reading on 1 November?", "please don't leave bikes in the hall". Today those live in a group chat and get lost.

`extras` is a set of five small, separate tools for exactly that. Each one is a short list or log, readable in a few seconds on a phone, with no setup beyond what a flatmate would do in a minute. They are separate on purpose: **each ships alone**, so a flat can have only the shopping list live and nothing else, and removing or delaying one never touches another.

| Id  | Tool               | One line                                                                      |
| --- | ------------------ | ----------------------------------------------------------------------------- |
| A   | **Shopping list**  | Add what the flat needs, tick it when bought, turn a purchase into an expense |
| B   | **Bin days**       | Which bin goes out on which day, and a reminder the evening before            |
| C   | **Meter readings** | A log of gas, electricity and water readings, with usage between readings     |
| D   | **Fix-it log**     | Report a problem, see its status, see who is chasing the landlord             |
| E   | **Noticeboard**    | Short notes for the flat, pinned or expiring, with admin delete               |

House rules and the activity feed (named in `REQUIREMENTS.md` 4.8) are dealt with under "House rules and activity feed" below. The recommendation is: house rules become pinned noticeboard posts; the activity feed is out of scope.

### User stories

- As a flatmate, I add "toilet roll" to the shopping list from my phone in the shop doorway, and whoever is shopping sees it.
- As a flatmate who did the shop, I tick what I bought, tap "Turn into an expense", type the total, and the flat's money records it with an equal split already filled in.
- As a flatmate, I open Bin days and see which bin goes out next and when, and I get a nudge the evening before so I do not have to remember.
- As an admin, I type in the bin pattern once (for example "grey bin, every week, collected on Tuesdays") and note an exception when the council moves a collection.
- As a flatmate, I type in the gas meter reading on the 1st and see how much we used since the last one.
- As a flatmate, I report "bathroom extractor fan is not working", see it move from open to in progress to fixed, and see who said they will chase the landlord.
- As a flatmate, I pin "Landlord visiting Thursday 10am" to the noticeboard and it disappears by itself afterwards.
- As an admin, I remove a post that should not be there.
- As the owner, I can switch these on one at a time, and a flat with only the shopping list sees no empty "bins" or "meters" screens.

## What "each ships alone" means here

This is the main design rule of the module and it is checked in review.

1. **Own tables, own functions, own migration files, own range.** No sub-feature reads or writes another's tables.
2. **Own files.** Each lives in its own `src/features/<name>/` folder and its own `src/app/(app)/more/<route>/` folder (see "Files").
3. **Own notification types** with their own prefix, and its own scheduled job where it needs one.
4. **Own tests.** A sub-feature's pgTAP, Vitest and end-to-end tests do not need another sub-feature to exist.
5. **Own switch-on.** There is no "extras on/off" flag. A sub-feature is live for everyone the moment its PR is deployed; until then its route does not exist and nothing links to it. The More list gets one entry per sub-feature, added by that sub-feature's own PR.
6. **Shared files are touched only by small append-only edits** (listed under "Shared files"), the same rule `PARALLEL-WORK.md` uses for `recurring` and `rota`.

The only cross-module dependency is one-way and inside A: shopping calls the ledger's existing expense writer. Nothing in the ledger knows shopping exists.

## Order of shipping (recommended)

| Order | Tool                  | Why in this place                                                                                                                                                                                       |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **A. Shopping list**  | Used most often by far, small to build, and it is the only one that touches money. Doing it first proves the "reuse the ledger writer" idea while the ledger is fresh. No cron job needed to be useful. |
| 2     | **B. Bin days**       | The most visible "it just reminds me" feature, and it proves an hourly reminder job that depends on the London clock (including summer time). Admin sets it up once.                                    |
| 3     | **E. Noticeboard**    | Tiny, no setup, and it also carries house rules. Quick win after the two bigger ones.                                                                                                                   |
| 4     | **D. Fix-it log**     | A little larger (two tables, a status flow, a reminder), and it carries one open decision (photos). Better after the smaller tools have shaken out the shared files.                                    |
| 5     | **C. Meter readings** | Useful but monthly, and nothing waits on it. Last.                                                                                                                                                      |

The order is a recommendation, not a dependency: any tool can ship at any time without the others. If the owner would rather have bins before shopping, nothing changes except which PR set goes first (see Open questions).

## Decisions to confirm

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | **Five independent tools, not one "extras" screen.** Each has its own tables, functions, routes and tests (above).                                                                                                                                                                                                                                                                                                                                                  |
| X2  | **Everything is private to the flat.** Every table has `household_id`; every read is guarded by `authz.is_household_member`, as the rota's tables are. Nobody outside a flat can see any of it, and a former member sees nothing after they leave.                                                                                                                                                                                                                  |
| X3  | **The browser role never writes a table.** As in the ledger and rota, tables grant `select` only; every write is a `security definer` function (`set search_path = ''`) that derives the caller from `authz.current_profile_id()`, finds the caller's flat itself (never trusts a flat id from the app), checks the rules again, and raises a named error.                                                                                                          |
| X4  | **Shopping reuses the ledger's writer.** "Turn into an expense" calls `private.ledger_write_expense` and `private.ledger_notify_added` inside one new shopping function, in one transaction, exactly as `private.recurring_post_bill` already does. Shopping never inserts into `expenses` or `expense_shares`, and the ledger is not edited.                                                                                                                       |
| X5  | **No money in push text.** Every new notification type that can push has a fixed `push_title` and `push_body` (the mechanism the ledger added). The inbox row may carry the longer text; the lock screen never carries an amount, a meter value, a post's text, or a problem description.                                                                                                                                                                           |
| X6  | **Notification types are append-only with their own prefix:** `bin_`, `fix_`, `board_` now; `shop_` and `meter_` are reserved and unused in the first version. Each is added to `src/features/notifications/types.ts` and as a `notification_types` row in the sub-feature's own migration. `types.test.ts` keeps the two in step.                                                                                                                                  |
| X7  | **Idempotent jobs.** Every scheduled function takes the time as a parameter (`p_now`), records itself in `job_runs` with a unique `(job_name, idempotency_key)`, and writes notifications with a `dedupe_key`, so running twice sends nothing twice. Same pattern as `run_rota_availability` and `run_recurring_daily`.                                                                                                                                             |
| X8  | **Europe/London dates.** A day is a London calendar date stored as `date`. Reminders that mean "the evening before" are decided by the London hour, so summer time cannot move them by an hour.                                                                                                                                                                                                                                                                     |
| X9  | **No photos in the first version of any tool.** The project has no file storage today. C (meters) never needs it. D (fix-it log) may want it; that is flagged as a decision for the owner and orchestrator (see D and Open questions). Default: text only.                                                                                                                                                                                                          |
| X10 | **Leaving and deleting need no change to `end_memberships_for_account` or `private.can_leave`.** None of the five holds money owed or an obligation that should stop someone leaving. Where something must happen on leaving or account deletion, it is done by a trigger on `memberships` or `profiles`, the way `rota_note_member_left` works, so no existing function is edited. See "Leaving and account deletion" for the hook that would otherwise be needed. |
| X11 | **No realtime in the first version.** Screens refresh when you act and when you reopen them. A live shopping list is a reasonable later addition and would follow `20261029170000_realtime_memberships.sql`; it is not needed to be useful.                                                                                                                                                                                                                         |
| X12 | **Small caps against abuse and accidents,** enforced in the functions (the requirements ask for rate limiting on writes): 100 open shopping items per flat, 20 bin patterns per flat, 10 meters per flat, 1 reading per meter per day, 50 open fix-it reports per flat, 5 noticeboard posts per person per day, 3 pinned posts per flat. Each is a named error with a friendly message.                                                                             |

## Assumptions (correct me)

1. One time zone, Europe/London. Flats are in Edinburgh at first, but nothing is hard-coded to Edinburgh except wording examples; the bin pattern is typed by hand, so any council works.
2. A flat has 1 to 12 people; every tool works for a flat of one.
3. Text is plain, trimmed, with the length limits in each table. No formatting, no links turned into buttons, no images.
4. Everyone in the flat can see everything in all five tools (they are about the flat). The only person-level privacy rule is that **push text is always generic**.
5. The flat's money stays correct if a tool is wrong: the shopping list, for instance, can be wrong without the books being wrong, because an expense only exists when someone confirms an amount.
6. "Admin" means an owner or an admin (`authz.is_household_admin`), as everywhere else.

## Shared building blocks (all exist today)

Nothing here is new infrastructure. Each sub-feature is made from these:

| Need                                        | Existing piece                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Who is the caller, is a member, is an admin | `authz.current_profile_id()`, `authz.is_household_member(uuid)`, `authz.is_household_admin(uuid)` (`20261029120000_households.sql`)                                                                                                        |
| Write an expense                            | `private.ledger_write_expense(...)`, `private.ledger_notify_added(...)`, `public.add_expense` (`20261030130000_ledger_expenses.sql`); split maths in `src/features/ledger/splits.ts` (`splitExpense`) and `form.ts` (`deriveInitialSplit`) |
| Notify one person or the flat               | `private.notify(...)`, `private.notify_flatmates(...)` (`20261029180000`, `20261029190000`); fixed push text via `notification_types.push_title` and `push_body` (`20261030120000_ledger.sql`)                                             |
| Run something on a timer                    | `pg_cron` with `cron.schedule(...)` or `private.register_edge_job(...)`; `job_runs` for idempotency (`20261028130000_job_runs.sql`, `20261028140000_scheduler.sql`)                                                                        |
| Leaving / account deletion                  | Trigger on `memberships.left_at` (precedent `20261121000000_rota_leaving.sql`); `anonymise_profile` sets `profiles.deleted_at`                                                                                                             |
| Tests                                       | pgTAP in `supabase/tests/database/*.test.sql` (impersonate with `request.jwt.claims` and `set local role authenticated`); Vitest; Playwright in `e2e/`                                                                                     |
| Page guard and data reading                 | `RequireFlat`, `getMembership()`, `getMembers()`; server actions in a `"use server"` `actions.ts`; zod in `schemas.ts`; `logger` from `@/lib/logger`                                                                                       |
| Rules from the platform                     | `AGENTS.md`: this project uses Next.js 16, where route `params` is a `Promise` and APIs differ from older versions. A builder reads the relevant guide in `node_modules/next/dist/docs/` before writing any route or action.               |

Cron minutes already taken (do not reuse): every minute (`deliver-push`), `:00` (heartbeat), `:07` (`rota-generate`), every ten minutes (`rota-rebalance`), `:17` (`rota-availability`), `:37` (`rota-reminders`), `:47` (`events-hourly`, from `SPEC-events.md`), and daily at 03:17 (`notification-retention`), 07:00 (`recurring-daily`) and 08:00 (`ledger-reminders`) UTC.

---

# A. Shopping list

## What it does (plain words)

One list for the whole flat. Anyone adds an item with one field and a button. Anyone ticks an item when it has been bought; it moves to a "Bought" section. Anyone can remove an item they added; an admin can remove any.

When someone has bought things, they tick them, tap **Turn into an expense**, and see the normal add-expense form with the description filled in ("Shopping: milk, toilet roll, bin bags"), the category set to groceries (changeable), themselves as the person who paid, and the split already set to **equal among everyone in the flat**. They type the total and save. The ticked items then show "Added to expenses" with a link. The money screens are untouched and see an ordinary expense.

Nothing here sends a notification of its own. The ledger's normal "expense added" message goes to the people sharing it, as for any expense.

Items are shared with the whole flat. There are no private items in this version (see Open questions).

## Data model

```sql
create table public.shopping_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  name          text not null check (char_length(name) between 1 and 60),
  note          text check (note is null or char_length(note) between 1 and 40),   -- "semi-skimmed", "the blue one"
  added_by      uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  bought_at     timestamptz,
  bought_by     uuid references public.profiles (id),
  -- Set when the item was part of an expense made with "Turn into an expense".
  expense_id    uuid references public.expenses (id),
  -- Hidden from the list ("Clear bought"), kept briefly so the expense link still works.
  cleared_at    timestamptz,
  check ((bought_at is null) = (bought_by is null)),
  check (expense_id is null or bought_at is not null),
  check (cleared_at is null or bought_at is not null)
);

create index shopping_items_open on public.shopping_items (household_id, created_at desc)
  where cleared_at is null;
create index shopping_items_expense on public.shopping_items (expense_id) where expense_id is not null;
create index shopping_items_purge on public.shopping_items (cleared_at) where cleared_at is not null;
```

Row-level security: on; `anon` has nothing; `authenticated` has `select` only.

```sql
create policy shopping_items_select_members on public.shopping_items
  for select to authenticated using ((select authz.is_household_member(household_id)));
```

## Functions (all `security definer`, caller checked)

| Function                                                                                                                                                                                            | Who may call           | What it checks and does                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add_shopping_item(p_name text, p_note text) returns uuid`                                                                                                                                          | Any member             | Trims and length-checks. If an open item with the same name (ignoring case) is already on the list, returns that item instead of adding a second (so a double tap or two people adding "milk" is harmless). Cap: 100 open items (`list_full`).                                                                                                                                                                                                                                   |
| `set_shopping_bought(p_item uuid, p_bought boolean) returns void`                                                                                                                                   | Any member of the flat | Sets or clears `bought_at/bought_by`. Un-ticking is refused once `expense_id` is set (`already_in_expense`). Another flat's item id answers "not found", never "not allowed".                                                                                                                                                                                                                                                                                                    |
| `remove_shopping_item(p_item uuid) returns void`                                                                                                                                                    | Adder, or any admin    | Deletes the row, only if `expense_id` is null (an item behind an expense is cleared, not deleted, so the link survives).                                                                                                                                                                                                                                                                                                                                                         |
| `clear_bought_items() returns integer`                                                                                                                                                              | Any member             | Sets `cleared_at` on this flat's bought items. Returns how many.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `shopping_to_expense(p_item_ids uuid[], p_amount_pence bigint, p_description text, p_category text, p_occurred_on date, p_paid_by uuid, p_profile_ids uuid[], p_share_pence bigint[]) returns uuid` | Any member             | Locks the named items (`for update`), checks they are all in the caller's flat, all bought, none already in an expense (`already_in_expense`), at least 1 and at most 30. Calls `private.ledger_write_expense` (which validates amount, description, category, date, payer, shares add up and everyone is in the flat) and `private.ledger_notify_added`, then sets `expense_id` on the items. All in one transaction: any failure leaves no expense and no change to the items. |

`shopping_to_expense` is the only place shopping and the ledger meet. It takes exactly the arguments `add_expense` takes, plus the item ids. The app computes the split with the ledger's existing `splitExpense` and `deriveInitialSplit`; the database checks it again. If the expense is later corrected in Money (void and replace), the item keeps pointing at the original expense; the expense page already shows its history. A later improvement could follow the `replaces_id` chain; it is not needed.

## Notifications

None of its own in this version. The expense it creates sends the ledger's existing `expense_added`, with the ledger's existing generic push text.

## Scheduled work

One daily purge, `shopping-retention`, at `22 3 * * *` UTC: deletes items that were cleared more than 90 days ago, and bought items never cleared after 90 days. Items behind an expense are safe to delete because the expense does not depend on them. Idempotent by nature, and recorded in `job_runs` (key = the UTC date). Same shape as `private.run_notification_retention`.

## Screens and routes

| Route                | What                                                                                                                                                         | Bundle budget |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `/more/shopping`     | The list: add box, open items (tick), bought items, "Clear bought", "Turn into an expense" appears when something bought is not yet in an expense; 200 KB    | 200           |
| `/more/shopping/buy` | The add-expense form with items chosen. Item ids go in the address (ids only, no names or amounts). Reuses the ledger's expense form component for the split | 200           |

Both are server pages behind `RequireFlat` with small client islands for the add box and ticks. The expense form is the ledger's, not a copy.

## Home page

A one-line item in the home page's "Coming up" or "Waiting on you" style: "4 things on the shopping list" linking to `/more/shopping`; hidden when the list is empty. Reader: `getShoppingSummary()` in this feature's folder. The wiring into `dashboard/page.tsx` is a separate tiny PR (see "How each appears on Home").

## Tests

- **pgTAP** `supabase/tests/database/shopping.test.sql` and `shopping-expense.test.sql`:
  - table exists, RLS on, `anon` has no privileges, `authenticated` can only `select`; only the listed functions are executable by `authenticated`, none by `anon`;
  - cross-flat denial: a member of flat B sees none of flat A's items; flat B's member calling `set_shopping_bought` on flat A's item gets "not found";
  - add trims, rejects empty and over-long, returns the existing item for a repeat name, refuses the 101st (`list_full`);
  - adder and admin may remove, another member may not; an item behind an expense cannot be removed or un-ticked;
  - `clear_bought_items` only touches the caller's flat;
  - `shopping_to_expense`: creates one expense whose shares add up; items get `expense_id`; the people involved get one `expense_added` notification; a second call with the same items fails with `already_in_expense` and creates nothing; an unbought item fails; shares that do not add up fail and leave the items unchanged (rollback proved); a payer outside the flat fails; the ledger tables themselves still cannot be written by `authenticated`;
  - retention deletes only old cleared rows and is recorded once in `job_runs` however often it runs.
- **Vitest** (`src/features/shopping`): name and note schema, duplicate-name display, the "Shopping: milk, bin bags" description builder (cut to 80 characters with a "+N more" suffix), default split (equal among current members, remainder pence handled by `splitExpense`), error-code messages, list ordering and sections, empty states, and that the buy page refuses ids it was not given.
- **End-to-end** `e2e/shopping.spec.ts` (desktop-chrome, two people): A adds two items, B sees them, B ticks both and turns them into an expense of £6.00 equal split, A sees an `expense_added` in the inbox and £3.00 owed, and the items show "Added to expenses". Another flat sees nothing.

## Files

```
supabase/migrations/20261161000000_shopping.sql             table, RLS, add / bought / remove / clear functions
supabase/migrations/20261162000000_shopping_expense.sql     shopping_to_expense
supabase/migrations/20261163000000_shopping_retention.sql   purge function and cron job
supabase/tests/database/shopping.test.sql
supabase/tests/database/shopping-expense.test.sql
src/features/shopping/{schemas,actions,errors,items,summary,expense-description,constants}.ts
src/features/shopping/{shopping-list,add-item-form,buy-form}.tsx   (+ .test.ts(x) beside each)
src/app/(app)/more/shopping/page.tsx
src/app/(app)/more/shopping/buy/page.tsx
e2e/shopping.spec.ts
```

---

# B. Bin days (Edinburgh and anywhere else)

## What it does (plain words)

An admin lists the flat's bins once, for example "Grey bin", "Blue box", "Food waste", each with a colour and a **repeating pattern**: "every week" or "every 2, 3 or 4 weeks", plus **one real collection date** to count from (the date on the council calendar). The app works out every future collection date from that.

Everyone sees **Next bin days**: the next few collections in date order ("Tuesday 3 Nov: Grey bin"), with today and tomorrow marked.

When the council moves a collection (bank holidays, strikes, bad weather), an admin adds an **exception** to one date: skip it, or move it to another date. The calendar and reminders follow.

**The evening before a collection, everyone gets one nudge**: "Bins go out tonight" with the bins listed in the inbox. A person can turn it off, or snooze it, in the normal notification settings.

**Nothing is fetched from the council.** The admin types the pattern in. We do not scrape council websites (settled decision). The app assumes nothing about what Edinburgh's current bin scheme is: names and colours are whatever the admin types, and a handful of common colours are offered only as a convenience.

The rota's "Bins" chore (who takes the bags out) is a separate thing and stays that way. This tool answers "which bin and when"; the rota answers "whose turn". They are not linked in this version.

## Data model

```sql
create table public.bin_streams (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  name          text not null check (char_length(name) between 1 and 40),
  colour        text not null default 'other'
                  check (colour in ('grey','blue','green','brown','black','red','purple','other')),
  -- A real collection date for this bin; every later one is anchor + n * every_weeks weeks.
  anchor_on     date not null,
  every_weeks   smallint not null default 1 check (every_weeks between 1 and 4),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint bin_streams_id_household unique (id, household_id)
);
create index bin_streams_flat on public.bin_streams (household_id) where archived_at is null;

create table public.bin_exceptions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  stream_id     uuid not null,
  -- The date the pattern says it would have been collected.
  original_on   date not null,
  kind          text not null check (kind in ('skip','move')),
  moved_to      date,
  note          text check (note is null or char_length(note) between 1 and 60),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  foreign key (stream_id, household_id) references public.bin_streams (id, household_id),
  check ((kind = 'move') = (moved_to is not null)),
  check (moved_to is null or (moved_to <> original_on and abs(moved_to - original_on) <= 14)),
  unique (stream_id, original_on)
);
create index bin_exceptions_flat on public.bin_exceptions (household_id, original_on);
```

Both tables: RLS on; `select` for flat members; no direct writes.

The date maths lives in **one pure TypeScript function** (`collectionsBetween(streams, exceptions, from, to)`) and a SQL mirror (`private.bin_collections_on(p_household, p_date)`) used by the reminder. A shared file of test vectors (the pattern `src/features/recurring/parity-vectors.ts` already uses) runs the same cases through both, so the app and the reminder can never disagree.

## Functions

| Function                                                                                                       | Who   | Checks                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `save_bin_stream(p_id uuid, p_name text, p_colour text, p_anchor_on date, p_every_weeks int) returns uuid`     | Admin | Null `p_id` adds, otherwise edits a stream in the caller's flat. Anchor must be within two years of today. Cap 20 streams (`too_many_bins`). Changing the pattern keeps exceptions only where they still land on a collection date; the rest are removed (and the admin is told how many). |
| `archive_bin_stream(p_id uuid)`                                                                                | Admin | Sets `archived_at`. History is not needed, so there is no undo; add it again if wanted.                                                                                                                                                                                                    |
| `set_bin_exception(p_stream uuid, p_original_on date, p_kind text, p_moved_to date, p_note text) returns uuid` | Admin | The date must really be a collection date of that stream (otherwise `not_a_collection_day`); a move lands within 14 days; replaces any earlier exception for the same date.                                                                                                                |
| `clear_bin_exception(p_id uuid)`                                                                               | Admin | Removes it; the pattern applies again.                                                                                                                                                                                                                                                     |

Members can only read.

## Notifications

| Type           | In app | Push | Snoozable | Fixed push text                                                           |
| -------------- | ------ | ---- | --------- | ------------------------------------------------------------------------- |
| `bin_reminder` | yes    | yes  | yes       | "Bin night" / "A bin collection is tomorrow. Open FlatMate to see which." |

The inbox row says, for example, "Bins out tonight: Grey bin, Food waste" (link `/more/bins`). The lock screen shows only the fixed text. Defaults can be changed per person in the existing preferences screen.

## Scheduled work

One job, `bins-reminders`, hourly at `27 * * * *`. Why hourly and not once a day: "6pm London" is 17:00 UTC in summer and 18:00 UTC in winter, so the job runs every hour and acts only when the **London hour is 18 to 22**. Running again at 19:27, 20:27 and so on also means a missed run still catches up the same evening, and the `dedupe_key` stops anyone being told twice.

```
private.run_bins_reminders():
  job_runs row: job_name 'bins-reminders', idempotency_key to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24')
  private.bins_remind(now()):
    for each open flat with at least one active stream:
      tomorrow := london_date(p_now) + 1; continue unless London hour between 18 and 22
      streams collecting tomorrow := private.bin_collections_on(flat, tomorrow)  -- exceptions applied
      continue if none
      for each active member: private.notify(member, flat, 'bin_reminder', title, body, '/more/bins',
                                              'bin:' || flat || ':' || tomorrow)
```

One message per person per collection day, listing every bin that day. Skipped collections send nothing. A moved collection sends on the evening before its new date. Flats with no bin pattern are not touched.

## Screens and routes

| Route               | What                                                                                                                                                                                           | Bundle budget |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `/more/bins`        | Next bin days (next 6 weeks, by date), today and tomorrow marked with a word, not just colour. Admins see "Set up bins". Empty state for members: "No bin days yet. Ask an admin to add them." | 200           |
| `/more/bins/manage` | Admin only: the list of bins, add or edit one (name, colour, repeat, "a date it was collected"), and add or clear an exception on a coming date                                                | 200           |

Colour is always shown with the bin's name; it never carries the meaning alone.

## Home page

In the existing "Coming up" idea: "Tonight: Grey bin out" (only on the evening before, or "Tomorrow: ..." in the morning). Hidden otherwise. Reader `getNextBinDays(n)` in this feature's folder.

## Tests

- **pgTAP** `bins.test.sql` and `bins-reminders.test.sql`:
  - tables exist with RLS; `anon` nothing; `authenticated` select only; function grants as above;
  - cross-flat denial for streams and exceptions; a member (not admin) calling any writer gets `not_allowed`;
  - constraints: bad `every_weeks`, a `move` without a date, a move 20 days away, a duplicate exception for one date, an exception pointing at another flat's stream;
  - `set_bin_exception` refuses a date that is not a collection day;
  - `bin_collections_on` for weekly, fortnightly and 3-weekly patterns across both clock changes, with a skip and a move;
  - reminder: at 18:27 London on the evening before, each member gets exactly one `bin_reminder`; running twice, or again at 19:27, adds none; at 12:00 nothing; a skipped collection sends nothing; a moved one sends on the right evening; a member who turned the type off gets nothing; a person who left gets nothing; push is queued for devices only when push is on; the push worker's text is the fixed text (`claim_push_outbox`); the job writes one `job_runs` row per hour.
- **Vitest** (`src/features/bins`): `collectionsBetween` against the shared vectors (weekly, 2/3/4 weeks, anchor in the past and future, clock changes, month and year ends), exceptions, form schema, "today/tomorrow" wording, empty and member-only views, error messages.
- **End-to-end** `e2e/bins.spec.ts` (desktop-chrome): admin adds "Grey bin, every week" and "Blue box, every 2 weeks"; a member sees the next dates; admin skips one date and it disappears from the member's list; a member cannot reach `/more/bins/manage` content.

## Files

```
supabase/migrations/20261169000000_bins.sql            tables, RLS, admin functions, bin_collections_on
supabase/migrations/20261170000000_bins_reminders.sql  bin_reminder type and push text, bins_remind, run_bins_reminders, cron job
supabase/tests/database/bins.test.sql
supabase/tests/database/bins-reminders.test.sql
src/features/bins/{collections,schemas,actions,errors,bins,parity-vectors,summary}.ts
src/features/bins/{bin-days,bin-form,exception-form}.tsx  (+ tests)
src/app/(app)/more/bins/page.tsx
src/app/(app)/more/bins/manage/page.tsx
e2e/bins.spec.ts
```

---

# C. Meter readings

## What it does (plain words)

A log of the flat's gas, electricity and water readings. An admin adds each meter once ("Electricity", "Gas", "Water", or a second electricity meter with a label). Anyone then types in a reading with its date. Each meter's page shows its readings, newest first, and **what was used between one reading and the next**: "Used 214 kWh in 31 days, about 7 a day."

It shows **no money**: no cost, no tariff, no bill. A reading is not an expense and does not touch the ledger or the recurring bills. (If the flat wants to pay the gas bill, that stays in Money.)

A mistaken reading is **cancelled and re-entered**, not edited, so the history stays honest. If a reading is lower than the one before it, the app asks "Was the meter replaced or did it roll over?" and records that explicitly; otherwise it refuses, because a lower number is almost always a typo.

### Photos: decided, none

Meter readings take **no photo**, in this version or by default later. Reasons: the project has no file storage, and adding it means a storage bucket, an upload policy, a privacy-notice change, retention and deletion rules; a number takes five seconds to type; and a photo of a meter can show the meter's account or serial identifiers and the surrounding hallway. If the owner approves photos for the fix-it log (D) and storage is built there, meters can revisit it as its own small change.

## Data model

```sql
create table public.meters (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  kind          text not null check (kind in ('electricity','gas','water')),
  label         text check (label is null or char_length(label) between 1 and 30),
  unit          text not null check (unit in ('kWh','m3')),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint meters_id_household unique (id, household_id)
);
create index meters_flat on public.meters (household_id) where archived_at is null;

create table public.meter_readings (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  meter_id      uuid not null,
  read_on       date not null,
  value         numeric(12,3) not null check (value >= 0),
  -- True for a new or rolled-over meter: usage is not worked out across this reading.
  is_reset      boolean not null default false,
  note          text check (note is null or char_length(note) between 1 and 100),
  recorded_by   uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references public.profiles (id),
  foreign key (meter_id, household_id) references public.meters (id, household_id),
  check ((voided_at is null) = (voided_by is null))
);
create unique index meter_readings_one_a_day on public.meter_readings (meter_id, read_on) where voided_at is null;
create index meter_readings_meter on public.meter_readings (meter_id, read_on desc);
```

Both: RLS on, `select` for flat members, no direct writes. Readings are append-only: an update trigger refuses any change except setting `voided_at/voided_by` once (the ledger's `ledger_refuse_change` pattern).

Usage between readings is a **pure TypeScript function** (`usageBetween(readings)`) with no database view. It uses non-cancelled readings in date order, skips the gap across an `is_reset` reading, and returns for each gap: dates, days, amount used, amount per day.

## Functions

| Function                                                                                                            | Who                    | Checks                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save_meter(p_id uuid, p_kind text, p_label text, p_unit text) returns uuid`                                        | Admin                  | Null `p_id` adds. Electricity is `kWh`; gas and water may be `kWh` or `m3` (gas meters differ). Cap 10 meters.                                                                                                                                                                           |
| `archive_meter(p_id uuid)`                                                                                          | Admin                  | Sets `archived_at`; readings stay readable.                                                                                                                                                                                                                                              |
| `record_meter_reading(p_meter uuid, p_read_on date, p_value numeric, p_note text, p_is_reset boolean) returns uuid` | Any member             | Date not in the future and within the last year; value between 0 and 9,999,999.999; one live reading per meter per day (`already_recorded`); not lower than the previous reading by date, nor higher than a later one, unless `p_is_reset` (`lower_than_previous`, `higher_than_later`). |
| `void_meter_reading(p_id uuid)`                                                                                     | Recorder, or any admin | Marks it cancelled. Cancelling does not delete.                                                                                                                                                                                                                                          |

## Notifications

None in this version. `meter_` is reserved. (A "time to read the meter" reminder is a reasonable later addition; it would follow the bin job's pattern and is deliberately not built now, to keep this tool a quiet log.) There is therefore no push text at all, and no amount of money anywhere in the tool.

## Screens and routes

| Route               | What                                                                                                                                | Bundle budget |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `/more/meters`      | One card per meter: latest reading, date, and last usage line; "Add a reading" per meter. Admins see "Add a meter".                 | 200           |
| `/more/meters/[id]` | One meter: add reading form, readings newest first with usage between each, who and when, "Cancel" on your own (or any, for admins) | 200           |
| `/more/meters/new`  | Admin only: add a meter (kind, optional label, unit)                                                                                | 200           |

The note field's placeholder says "Please don't put account numbers here."

## Home page

None. Meters are monthly and quiet; the home page stays uncluttered. (If the owner wants a "reading due" line later, it follows the reminder idea above.)

## Tests

- **pgTAP** `meters.test.sql`:
  - tables with RLS; `anon` nothing; `authenticated` select only; function grants;
  - cross-flat denial (readings and meters), and recording against another flat's meter is "not found";
  - member cannot add or archive a meter; any member can record; only recorder or admin can cancel;
  - date in the future, over a year old, negative value, second reading the same day: all refused; a lower value refused unless reset; inserting between two readings keeps order; a reading cannot be edited, only cancelled; a cancelled reading frees its day;
  - unit rules (electricity cannot be `m3`).
- **Vitest** (`src/features/meters`): `usageBetween` (normal, one reading, reset, cancelled in the middle, same-day edge, daylight-saving dates, decimals), wording ("Used 214 kWh in 31 days, about 7 a day"), form schema, error messages.
- **End-to-end** `e2e/meters.spec.ts`: admin adds Electricity, a member records 1,000 on the 1st and 1,214 on the 1st of next month and sees "Used 214 kWh"; a lower number is refused with the reset question; cancelling a reading removes it from usage.

## Files

```
supabase/migrations/20261177000000_meters.sql           tables, RLS, append-only trigger, admin functions
supabase/migrations/20261178000000_meters_readings.sql  record_meter_reading, void_meter_reading
supabase/tests/database/meters.test.sql
src/features/meters/{usage,schemas,actions,errors,meters,constants}.ts
src/features/meters/{meter-card,reading-form,reading-list,meter-form}.tsx  (+ tests)
src/app/(app)/more/meters/page.tsx
src/app/(app)/more/meters/[id]/page.tsx
src/app/(app)/more/meters/new/page.tsx
e2e/meters.spec.ts
```

---

# D. Fix-it log

## What it does (plain words)

When something in the flat is broken, anyone adds a **report**: a short title ("Bathroom extractor fan not working"), optional details, optional room. Everyone sees a list: open ones first, then in progress, then fixed.

Each report has a status: **Open**, **In progress**, **Fixed**. It also has an optional **"Chasing the landlord"** person. Anyone can tap "I'll chase this" if nobody has; an admin can set or change who. Everyone can add short notes ("Emailed the agent on Monday, no reply"). Every change is written to a timeline under the report, with who and when, and the timeline is never rewritten.

If a report has sat open for 7 days with no news, the person chasing it is nudged (or, if nobody is chasing it, the admins). The nudge repeats weekly until someone adds a note or changes the status.

If the person chasing leaves the flat, the chaser is cleared automatically, a line says so on the timeline, and the admins are told.

### Photos: needs an owner/orchestrator decision

A photo of the problem is genuinely useful to send to a landlord. **It needs file storage, which this project does not have today.** Adding it means, at least:

- a private Supabase Storage bucket (for example `fix-photos`) created on the hosted project, with its own policies: a member may read or add an object only under their own flat's folder (`<household_id>/<report_id>/<file>`), checked with `authz.is_household_member`;
- limits (for example 3 MB, JPEG, PNG or WebP), resizing on the phone before upload, and stripping location data from the image;
- short-lived signed links for display, never public URLs;
- a privacy-page change (a photo is personal data if it shows a person or a room), retention, and deletion when a report is removed, a person deletes their account, or a flat closes;
- a check of the app's content-security policy for images.

That is a real piece of infrastructure the orchestrator must apply on the hosted project and the owner must agree to. **This spec ships the fix-it log with no photos** and reserves migration slot `20261192000000` and a separate PR for photos if approved. The log is fully useful without them (a title, notes and a status). See Open questions.

## Data model

```sql
create table public.fix_reports (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id),
  title           text not null check (char_length(title) between 1 and 80),
  details         text check (details is null or char_length(details) between 1 and 500),
  location        text check (location is null or char_length(location) between 1 and 40),   -- "Bathroom"
  status          text not null default 'open' check (status in ('open','in_progress','fixed')),
  reported_by     uuid not null references public.profiles (id),
  chaser_id       uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  fixed_at        timestamptz,
  last_activity_at timestamptz not null default now(),
  hidden_at       timestamptz,                                     -- admin removes a report that should not be there
  check ((status = 'fixed') = (fixed_at is not null)),
  constraint fix_reports_id_household unique (id, household_id)
);
create index fix_reports_flat on public.fix_reports (household_id, status, created_at desc) where hidden_at is null;
create index fix_reports_stale on public.fix_reports (last_activity_at) where status <> 'fixed' and hidden_at is null;

create table public.fix_updates (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  report_id     uuid not null,
  kind          text not null check (kind in ('note','status','chaser','system')),
  body          text not null check (char_length(body) between 1 and 300),
  author_id     uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  foreign key (report_id, household_id) references public.fix_reports (id, household_id)
);
create index fix_updates_report on public.fix_updates (report_id, created_at);
```

Both: RLS on, `select` for flat members (reports also require `hidden_at is null`), no direct writes. `fix_updates` is append-only (an update or delete trigger refuses, as `rota_refuse_change` does).

## Functions

| Function                                                                 | Who                                          | Checks                                                                                                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `report_fix(p_title text, p_details text, p_location text) returns uuid` | Any member                                   | Length checks; cap 50 non-fixed reports per flat (`too_many_open`). Tells the flat (`fix_reported`).                                                                                 |
| `add_fix_note(p_report uuid, p_body text) returns uuid`                  | Any member                                   | Report in the caller's flat and not hidden. Refreshes `last_activity_at`.                                                                                                            |
| `set_fix_status(p_report uuid, p_status text, p_note text) returns void` | Reporter, chaser, or admin                   | Sets the status, writes a timeline line, sets or clears `fixed_at`. Reopening a fixed report is allowed. Tells the reporter and chaser (except the person acting) with `fix_status`. |
| `take_fix_chase(p_report uuid) returns void`                             | Any member, only if nobody is chasing        | Sets `chaser_id` to the caller; timeline line.                                                                                                                                       |
| `set_fix_chaser(p_report uuid, p_profile uuid) returns void`             | The current chaser (hand over), or any admin | Target must be an active member, or null to clear. Timeline line.                                                                                                                    |
| `hide_fix_report(p_report uuid) returns void`                            | Admin                                        | Sets `hidden_at`. Not deleted at once; removed later by the purge below.                                                                                                             |

A trigger on `memberships.left_at` (the rota's pattern) clears `chaser_id` where the leaver was chasing, writes a `system` timeline line, and tells the admins with a `fix_status` row. It cannot make leaving fail.

## Notifications

| Type           | In app | Push | Snoozable | Fixed push text                                                                  |
| -------------- | ------ | ---- | --------- | -------------------------------------------------------------------------------- |
| `fix_reported` | yes    | no   | no        | "New fix-it report" / "A flatmate reported a problem. Open FlatMate to see it."  |
| `fix_status`   | yes    | yes  | no        | "Fix-it update" / "A problem you follow has an update. Open FlatMate to see it." |
| `fix_stale`    | yes    | yes  | yes       | "Fix-it reminder" / "A problem is still waiting. Open FlatMate to see it."       |

The inbox row for `fix_reported` says "Sam reported a problem" and links to the report; the title text of the problem itself is not put in the push. Dedupe keys: `fix_reported:<report>`, `fix_status:<update id>`, `fix_stale:<report>:<week number>`.

## Scheduled work

One daily job, `fix-stale`, at `32 9 * * *` UTC (job name `fix-stale`, key = the London date). `private.fix_remind(p_now)`: for each non-hidden, non-fixed report whose `last_activity_at` is at least 7 days old, tell the chaser if they are still a member, otherwise every admin, at most once per 7 days per report (the dedupe key carries the week number since creation). A separate small purge, `fix-retention`, folded into the same job, hard-deletes hidden reports and their updates after 30 days and fixed reports after 2 years.

## Screens and routes

| Route              | What                                                                                                                                                | Bundle budget |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `/more/fixes`      | List grouped Open, In progress, Fixed (collapsed), each row: title, room, status word, "Chasing: Sam" or "Nobody chasing", age. "Report a problem". | 200           |
| `/more/fixes/new`  | Title, details, room                                                                                                                                | 200           |
| `/more/fixes/[id]` | The report, its timeline, add a note, change status, "I'll chase this" / hand over, admin "Remove report"                                           | 200           |

Status is always a word, never colour alone.

## Home page

For admins and for the person chasing: "2 problems still open" linking to `/more/fixes`; members with nothing to do see nothing. Reader `getFixSummary()` in this feature's folder.

## Tests

- **pgTAP** `fixes.test.sql` and `fixes-reminders.test.sql`:
  - tables with RLS; `anon` nothing; `authenticated` select only; function grants;
  - cross-flat denial for reports and updates; hidden reports are invisible to members;
  - updates cannot be changed or deleted;
  - status rules: reporter, chaser and admin may change status, another member may not; `fixed_at` set and cleared correctly; reopening works;
  - chase rules: a member can take it only when free; hand-over by the chaser; admin can assign; the target must be a current member;
  - leaving: the chaser leaves, the chase is cleared, a system line is written, admins are told, and leaving still succeeds;
  - reminder: a 7-day-old open report nudges its chaser (or the admins when none), a recent note resets the clock, a fixed or hidden one sends nothing, repeating the run or the same week adds nothing, and the next week sends again; push text is the fixed text; the job writes one `job_runs` row per day;
  - caps (`too_many_open`).
- **Vitest** (`src/features/fixes`): schema, status transitions and who may do them (a pure `permissions.ts` that only decides which buttons to show), grouping and ordering, timeline rendering, "Nobody chasing" wording, error messages.
- **End-to-end** `e2e/fixes.spec.ts` (desktop-chrome, two people): A reports a problem, B sees it and takes the chase, B sets it in progress, A marks it fixed, both see the timeline in order; a person from another flat cannot open the report.

## Files

```
supabase/migrations/20261185000000_fixes.sql             tables, RLS, append-only trigger, report and note functions
supabase/migrations/20261186000000_fixes_status.sql      status and chaser functions, types and push text, leaver trigger
supabase/migrations/20261187000000_fixes_reminders.sql   fix_remind, daily job, retention
supabase/migrations/20261192000000_fixes_photos.sql      RESERVED, only if the owner approves photos
supabase/tests/database/fixes.test.sql
supabase/tests/database/fixes-reminders.test.sql
src/features/fixes/{schemas,actions,errors,fixes,permissions,summary,constants}.ts
src/features/fixes/{fix-list,fix-form,fix-timeline,status-controls}.tsx  (+ tests)
src/app/(app)/more/fixes/page.tsx
src/app/(app)/more/fixes/new/page.tsx
src/app/(app)/more/fixes/[id]/page.tsx
e2e/fixes.spec.ts
```

---

# E. Noticeboard

## What it does (plain words)

A place for short notes to the flat: "Landlord visiting Thursday 10am", "Boiler engineer between 8 and 12", "Please take shoes off in the hall". Anyone posts up to 280 characters. A normal post **expires by itself**: the poster chooses 1 day, 3 days, 1 week (the default) or 1 month, and then it is gone from the board.

An **admin can pin** a post (up to three at a time). A pinned post stays at the top and does not expire until an admin unpins it. This is also how the flat keeps its house rules (see below).

The author can delete their own post. An admin can delete any post. Deleted posts disappear at once and are wiped for good after 30 days.

There are no comments, reactions or replies; it is a board, not a chat.

## House rules and activity feed

Both appear in `REQUIREMENTS.md` 4.8. Recommendation:

- **House rules: fold into the noticeboard.** A house rule is a pinned post with no expiry, written by an admin. The page shows pinned posts under the heading "Pinned and house rules". This costs no extra tables or screens, and rules get the same admin-only control as pins. If the flat later wants numbered rules with sign-off, that is a separate spec.
- **Activity feed: out of scope.** The inbox already lists what happened to you, and the home page's "Recent in the flat" shows your latest five. A flat-wide feed would need a new event log across all modules, which is more than extras, and it brings new privacy questions (it would repeat private-ish events such as who paid what). Not recommended now.

## Data model

```sql
create table public.board_posts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  author_id     uuid not null references public.profiles (id),
  body          text not null check (char_length(body) between 1 and 280),
  created_at    timestamptz not null default now(),
  -- Pinned posts do not expire.
  pinned_at     timestamptz,
  pinned_by     uuid references public.profiles (id),
  expires_at    timestamptz,
  deleted_at    timestamptz,
  deleted_by    uuid references public.profiles (id),
  check ((pinned_at is null) = (pinned_by is null)),
  check ((deleted_at is null) = (deleted_by is null)),
  -- Nothing stays up for ever unless an admin pinned it.
  check (pinned_at is not null or expires_at is not null)
);
create index board_posts_flat on public.board_posts (household_id, pinned_at, created_at desc) where deleted_at is null;
create index board_posts_purge on public.board_posts (expires_at) where pinned_at is null;
```

Row-level security: on; `select` for flat members only for rows that are live. The policy itself hides deleted and expired posts, so even a buggy screen cannot show them:

```sql
create policy board_posts_select_live on public.board_posts
  for select to authenticated
  using ((select authz.is_household_member(household_id))
         and deleted_at is null
         and (pinned_at is not null or expires_at > now()));
```

## Functions

| Function                                                                        | Who                                | Checks                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post_to_board(p_body text, p_expires_in_days int, p_pin boolean) returns uuid` | Any member; pinning needs an admin | Expiry must be 1, 3, 7 or 30 days (ignored when pinning). `p_pin` by a non-admin is `not_allowed`. Max 5 posts per person per London day (`posting_too_fast`). Tells the flat (`board_posted`). |
| `pin_board_post(p_post uuid, p_pinned boolean) returns void`                    | Admin                              | At most 3 pinned (`too_many_pinned`). Unpinning gives the post a 7-day expiry rather than leaving it up for ever.                                                                               |
| `delete_board_post(p_post uuid) returns void`                                   | The author, or any admin           | Soft delete; another flat's id is "not found".                                                                                                                                                  |

## Notifications

| Type           | In app | Push | Snoozable | Fixed push text                                             |
| -------------- | ------ | ---- | --------- | ----------------------------------------------------------- |
| `board_posted` | yes    | no   | no        | "New note" / "A flatmate posted a note on the noticeboard." |

The inbox row says "Sam posted on the noticeboard" with an empty body and links to `/more/board`; the post's words are not copied into the notification. Dedupe key `board:<post id>`; nobody is told about their own post.

## Scheduled work

No reminder. One purge, `board-retention`, daily at `37 3 * * *` UTC: hard-deletes posts that were deleted, or expired, more than 30 days ago. Recorded in `job_runs` by UTC date.

## Screens and routes

| Route         | What                                                                                                                                                                                                                  | Bundle budget |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `/more/board` | "Pinned and house rules" on top, then recent posts, newest first, each with author, age and "disappears Thursday"; a post box with an expiry choice; delete on your own (and on all for admins); pin/unpin for admins | 200           |

## Home page

The top pinned post (first 80 characters, link to the board), shown as a small "Pinned" line. Hidden if there is none. Reader `getPinnedPost()` in this feature's folder.

## Tests

- **pgTAP** `board.test.sql`:
  - table with RLS; `anon` nothing; `authenticated` select only; function grants;
  - cross-flat denial; an expired post and a deleted post are invisible to members through the policy itself (proved by moving the clock with an `expires_at` in the past);
  - constraint: an unpinned post with no expiry is refused;
  - a member cannot pin; an admin can; the fourth pin is refused; unpinning sets an expiry; delete by author and by admin works, by another member is refused;
  - 6th post in a day refused;
  - one `board_posted` per other member, none for the author, none for former members, push is not queued by default, and the notification body does not contain the post text;
  - retention removes only old deleted/expired rows and records one `job_runs` row.
- **Vitest** (`src/features/board`): schema, expiry choices and "disappears on" wording, ordering (pinned first), permissions helper, empty state, error messages.
- **End-to-end** `e2e/board.spec.ts`: a member posts, another sees it and an inbox note; the poster deletes it; an admin pins another and a member cannot see a pin button; pinned stays after a simulated expiry date.

## Files

```
supabase/migrations/20261193000000_board.sql            table, RLS policy, functions, board_posted type and push text
supabase/migrations/20261194000000_board_retention.sql  purge function and cron job
supabase/tests/database/board.test.sql
src/features/board/{schemas,actions,errors,posts,permissions,summary,constants}.ts
src/features/board/{post-list,post-form}.tsx  (+ tests)
src/app/(app)/more/board/page.tsx
e2e/board.spec.ts
```

---

# Cross-cutting

## Migration ranges (only 20261161..20261200)

Verified against `supabase/migrations`: the latest existing file is `20261126000000_rota_away.sql`; home reserves `20261131..40`; events reserves `20261141..60`. Extras uses `20261161..20261200`, eight numbers each. Files are named like `20261161000000_shopping.sql`.

| Tool             | Range              | Planned files (a range number not used stays free)                                                          |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| A shopping       | 20261161..20261168 | `…161_shopping`, `…162_shopping_expense`, `…163_shopping_retention`                                         |
| B bin days       | 20261169..20261176 | `…169_bins`, `…170_bins_reminders`                                                                          |
| C meter readings | 20261177..20261184 | `…177_meters`, `…178_meters_readings`                                                                       |
| D fix-it log     | 20261185..20261192 | `…185_fixes`, `…186_fixes_status`, `…187_fixes_reminders`, `…192_fixes_photos` (reserved, only if approved) |
| E noticeboard    | 20261193..20261200 | `…193_board`, `…194_board_retention`                                                                        |

Because the tools are independent, a higher-numbered migration may be applied to the hosted project before a lower-numbered one (for example, bins merging before shopping). That is safe: nothing in one range refers to another. The orchestrator applies each in merge order and repairs the recorded version in `schema_migrations`, as `PARALLEL-WORK.md` already describes. Each migration's header comment says it is independent.

## Leaving and account deletion

What happens, and what is needed from the orchestrator:

| Event                             | A shopping                                                                             | B bins   | C meters                                               | D fix-it                                                                                   | E noticeboard                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Someone **leaves or is removed**  | Nothing. Their items stay.                                                             | Nothing. | Nothing. Their readings stay (they describe the flat). | Chaser cleared by a trigger on `memberships.left_at`, admins told. Reports they made stay. | Their posts stay until they expire. An admin can delete them. |
| Someone **deletes their account** | Their unbought items are deleted; items behind an expense remain.                      | Nothing. | Readings stay, shown as "Deleted user".                | Reports and notes stay, shown as "Deleted user"; chaser cleared (same trigger).            | Their posts are deleted.                                      |
| A **flat closes**                 | Nothing needed: all reads are guarded by membership, and a closed flat has no members. | Same.    | Same.                                                  | Same.                                                                                      | Same.                                                         |

**No hook into `end_memberships_for_account` or `private.can_leave` is needed**, because none of the five holds money owed or an obligation that should block leaving. Two small database triggers do the work instead, in the sub-feature's own migration, the way `rota_note_member_left` does: one on `memberships` (`after update of left_at`) for the fix-it chaser, and one on `profiles` (`after update of deleted_at`, fired when `anonymise_profile` sets it) for the deletions in the table above. Neither edits an existing function and neither can make leaving or deleting fail.

**If the orchestrator would rather keep deletion logic inside `anonymise_profile`** (the profile trigger is a new kind of thing on an identity table), that is a separate small request owned by the orchestrator, as `PARALLEL-WORK.md` says: add two lines to `public.anonymise_profile` deleting the person's unbought shopping items and noticeboard posts, and no change to `private.can_leave`. The extras PRs would then drop their profile trigger. Until the orchestrator answers, the plan above is the default and works without them.

How a former flatmate's name is shown on old rows (for example a meter reading by someone who left): the same way Money shows people who left. The builder checks how `getMembers()` and the ledger readers treat a profile that no longer shares a flat with the viewer, and reuses it. This is the one reading detail not verified while writing this spec.

## Security and privacy

- **Who sees what.** Everyone in the flat sees everything in all five tools. Nobody outside the flat sees anything. This is enforced by row-level security on every table (`authz.is_household_member`), plus the "not found, never not allowed" answer for another flat's ids.
- **Admin-only actions** are enforced in the functions, not just hidden in the screen: bin patterns and exceptions, meter set-up, pinning, hiding a fix-it report, deleting other people's posts and items, assigning a chaser.
- **No service key** is used by any screen. Jobs run as database functions.
- **Push text is fixed and generic** (X5). A test per type checks the stored push text contains no digit sequences that look like money and none of the content.
- **Inputs** are validated twice: with zod in the app for friendly messages, and again in the function and by table constraints. All text is rendered as plain text by React (no raw HTML).
- **Rate limits and caps** (X12) are enforced in the functions.
- **Minimal data.** Shopping and board rows are purged on a schedule; fix-it hidden items too. Meter readings and fix-it history are kept for the life of the flat because the flat uses them as a record. No photos are stored.
- **Privacy page rows to add** (each in its own sub-feature's PR, with the matching `columnsOf` assertion in `privacy-matches-data.test.tsx`):
  - A: "Shopping list: item names and notes, who added and who bought them, when, and a link to any expense made from them. Visible to your flat. Unbought items you added are deleted if you delete your account. Items are removed 90 days after they are cleared."
  - B: "Bin days: the names, colours and repeat pattern of your flat's bins, and any exceptions an admin adds. Visible to your flat. A reminder appears in your inbox the evening before a collection; it can be turned off."
  - C: "Meter readings: the meters, each reading (a number and a date), an optional note, and who recorded it. Visible to your flat. Readings can show when a home is occupied, so they are visible only to your flat. Do not put account numbers in the note."
  - D: "Fix-it log: problems your flat reports (title, details, room), who reported them, who is chasing, and a timeline of notes and changes. Visible to your flat. We do not store photos."
  - E: "Noticeboard: short posts your flatmates write, who posted them, when they expire. Visible to your flat. Posts you wrote are deleted if you delete your account; others disappear when they expire."
- **Account export / UK GDPR.** Each tool's rows that name a person (`added_by`, `recorded_by`, `reported_by`, `author_id`) are included in the data-export work when it is built; no tool stores anything that is not already in the privacy list.

## Navigation

- **Bottom nav: no change.** Five items already exist (Home, Rota, Money, Events, More), and the nav test counts them. Extras are not daily-enough, individually, to displace one.
- **More: one entry per tool,** added by that tool's own PR, as a link row in `src/app/(app)/more/page.tsx` in the style already used (Your flat, Notifications, Account): "Shopping list", "Bin days", "Noticeboard", "Fix-it log", "Meter readings". The page already says "Shopping list, meter readings, bin days, house notes and settings", so the wording matches.
- **Possible later promotion.** If the shopping list turns out to be opened daily, it could be offered a bottom-nav slot or a Home shortcut; that is an owner decision after real use, not part of this spec.

## How each appears on Home

Short and read-only, one line each, and none is required for a tool to be useful. `docs/SPEC-home.md` rules apply: each is its own `HomeBlock` that fails alone, links out, and never shows an amount.

| Tool          | Home line                                                                                 | Hidden when                          |
| ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| A shopping    | "4 things on the shopping list"                                                           | List empty                           |
| B bins        | "Tonight: Grey bin and Food waste" (evening before) / "Tomorrow: Grey bin" in the morning | No collection tomorrow               |
| C meters      | none                                                                                      | always                               |
| D fix-it      | "2 problems still open" (for admins, and for the person chasing)                          | Nothing open, or not relevant to you |
| E noticeboard | The top pinned post, first 80 characters                                                  | No pinned post                       |

Each tool exports a small reader and a small server component from its own folder (`getShoppingSummary`, `getNextBinDays`, `getFixSummary`, `getPinnedPost`). **Wiring them into `src/app/(app)/dashboard/page.tsx` is deliberately separate**: one small PR per tool (an import and one `HomeBlock` line), after the home page has shipped, so shipping a tool alone never depends on the home page and the home page is never edited by two tools at once. This spec does not edit the home page.

## Shared files (small, append-only edits)

| File                                                                    | Edit                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/app/(app)/more/page.tsx`                                           | One link row per tool                                                                                   |
| `src/features/notifications/types.ts` and `notification_types` rows     | Append the tool's own types (`bin_reminder`; `fix_reported`, `fix_status`, `fix_stale`; `board_posted`) |
| `src/lib/db/types.ts`                                                   | Regenerated (`pnpm db:types`), never edited by hand and never conflict-resolved by hand                 |
| `scripts/bundle-budgets.json`                                           | Add the tool's own routes, each at `200` (below). No existing budget is raised.                         |
| `src/app/(public)/privacy/page.tsx` and `privacy-matches-data.test.tsx` | The tool's own rows and column assertions                                                               |
| `docs/DEPLOY.md`                                                        | Append a "Shopping list" (etc.) section; never edit another's                                           |
| `src/app/(app)/dashboard/page.tsx`                                      | **Not touched by this spec.** The separate Home wiring PRs only.                                        |

Whoever merges second rebases and regenerates `types.ts`.

## Routes and bundle budgets

Every new route is added to `scripts/bundle-budgets.json` at **200 KB** first-load JS, in the same PR as the route. No existing budget is raised; if a page cannot fit in 200 KB, the page is changed, not the budget.

| Tool | Routes (each `200`)                                     |
| ---- | ------------------------------------------------------- |
| A    | `/more/shopping`, `/more/shopping/buy`                  |
| B    | `/more/bins`, `/more/bins/manage`                       |
| C    | `/more/meters`, `/more/meters/[id]`, `/more/meters/new` |
| D    | `/more/fixes`, `/more/fixes/new`, `/more/fixes/[id]`    |
| E    | `/more/board`                                           |

Eleven new routes. Pages are server components; client code is limited to small forms and tick buttons. The shopping `buy` page reuses the ledger's expense form and must not add a second copy of the split code; if that form pushes the route near 200 KB it is loaded lazily the way `template-form-lazy.tsx` does in recurring.

## Tech and structure

No new dependencies. Layout per tool: `src/features/<name>/` with `schemas.ts` (zod), `actions.ts` (`"use server"`), `errors.ts` (database error codes to plain messages, like `ledger/errors.ts`), a reader file (`items.ts`, `bins.ts`, `meters.ts`, `fixes.ts`, `posts.ts`) that reads through row-level security, pure logic in its own file with tests, and components. Pages live in `src/app/(app)/more/<route>/` behind `RequireFlat`. Next.js 16 conventions apply (see the table above): the builder reads the guide in `node_modules/next/dist/docs/` for `params` as a `Promise`, server actions and `revalidatePath` before writing any page or action, rather than relying on memory.

## Slices (PR set per tool)

Each tool is three PRs, tests first, merged when CI is green. A tool's PR set never waits for another tool's.

| PR  | Contents                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | Migration(s) and pgTAP, then `pnpm db:types`. Nothing visible yet. The orchestrator applies the migration to the hosted project before merge. |
| X2  | Pure logic with Vitest (written first), readers, actions, screens, More entry, bundle budgets, notification types. Tool becomes live.         |
| X3  | End-to-end test, privacy rows, `docs/DEPLOY.md` section, owner phone checklist. (Home wiring is a separate follow-up PR.)                     |

## Commands

`pnpm check` (lint, typecheck, format, unit, build, bundle budgets), `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`, `pnpm test:e2e`. Same as the other modules.

## Testing strategy

- **pgTAP is the main safety net.** Every table: exists, RLS on, `anon` has nothing, `authenticated` can only `select`. Every function: callable by `authenticated`, not `anon`. Every tool: a cross-flat denial test, a "member cannot do admin things" test, and a test per named error. Jobs: run twice and prove no duplicates; move `p_now` through a clock change.
- **Vitest first** for pure logic (bin dates, usage between readings, descriptions, permissions helpers, wording) and for each component's states (loading, empty, error, populated).
- **End-to-end** one file per tool, desktop-chrome only because it needs two people in the shared local database (as `ledger.spec.ts` does).
- **Gates that stay green:** lint, typecheck, unit, build, bundle budgets (new routes listed), the privacy-matches-data test, Lighthouse on the home page (not changed here).
- **Manual (owner, once per tool, on a real phone):** 360px layout has no sideways scroll; push for `bin_reminder` shows only the fixed text; nothing shows an amount on the lock screen.

## Boundaries

- **Always:** one tool per PR set; own tables, files, range and job; the caller derived from `auth.uid()` inside every function; named errors; generic push text; dedupe keys and `job_runs` on every job; tests first; reuse the ledger's writer for money.
- **Ask first:** photos for the fix-it log (needs storage); adding any tool to the bottom nav; changing `end_memberships_for_account`, `private.can_leave` or `anonymise_profile` (the orchestrator's); any change to ledger or recurring files; a new dependency; raising a bundle budget; editing the home page.
- **Never:** write `expenses`, `expense_shares` or any ledger table directly; scrape a council website; put an amount, a meter value, a post's words or a problem description in a push; let a browser role write a table; share anything across flats; edit another tool's files; merge a tool that depends on another tool being live.

## Success criteria

- A flat can have only the shopping list live (or only any one other tool), with no empty or broken screens for the rest.
- An item bought on the list becomes a correct ledger expense in two taps plus typing the total, with the same shares, notifications and history as one added by hand, and a failed attempt leaves the list and the books unchanged.
- The bin reminder arrives once, the evening before, at 18:00 London all year, including the weeks either side of the clock changes; a skipped or moved collection is respected; running the job twice sends nothing twice.
- Meter usage between readings is right to the unit, a cancelled reading never counts, and no money appears anywhere in the tool.
- A fix-it report shows its status and who is chasing; a leaver's chase is cleared and the admins told; a stale report is nudged weekly and not more.
- Noticeboard posts expire by themselves, pinned posts do not, and neither a deleted nor an expired post can be read even by a buggy screen.
- Every table passes the RLS checks; another flat's data is invisible in every test; every new route is at or under 200 KB.
- No push text in any tool contains an amount, a meter value, a post or a problem description.

## Risks

| Risk                                                                           | What we do                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shopping-to-expense drifts from the ledger's rules over time                   | It calls the ledger's own private writer, and a pgTAP test proves the same validation errors; a ledger change that breaks it fails a shopping test                      |
| The ledger writer is `private`, so a refactor of its signature breaks shopping | The call is in one function; its test fails loudly; the PR that changes the writer updates it (named in `PARALLEL-WORK.md` style "shared thing")                        |
| Bin pattern typed wrongly, so reminders are for the wrong day                  | The form shows the next five dates as the admin types; the first reminder is explained; an exception fixes a one-off; "a date it was collected" is a real calendar date |
| Hand-entered bin data goes stale when the council changes the scheme           | Admins can edit or archive at any time; no automatic data to go wrong; we say plainly the app does not check the council                                                |
| Summer-time bugs (reminder an hour off)                                        | The job acts on the London hour, not a fixed UTC time; tests step through both clock changes                                                                            |
| Notification noise (five new types)                                            | Only `bin_reminder` and `fix_status`/`fix_stale` push by default; everything is switchable per person in the existing preferences screen                                |
| The More page becomes a long list                                              | Five rows plus three existing ones is eight; if it grows, group them under a heading in a later change                                                                  |
| Shared files conflict between parallel tool PRs                                | Append-only edits (above), one tool per PR set, whoever merges second rebases and regenerates `types.ts`                                                                |
| Fix-it photos are asked for repeatedly                                         | The decision is explicit and has a reserved slot; photos are a separate PR with their own review                                                                        |
| Free text could contain personal details                                       | Length limits, flat-only visibility, deletion on account deletion for posts and unbought items, and a note on the meter field                                           |
| A trigger on `profiles` is unfamiliar                                          | Documented above; the fallback is a two-line orchestrator request into `anonymise_profile`                                                                              |
| Two tools add cron jobs at the same minute                                     | Minutes are allocated here and listed against the ones already taken                                                                                                    |

## Owner decisions (all defaults accepted)

Each has a recommended default. If you say nothing, the default is used.

1. **Which tool should we build first?** Recommended: the shopping list first, then bin days, the noticeboard, the fix-it log, and meter readings last. Each can go live on its own, so you can reorder freely.
2. **Should the fix-it log allow photos?** Photos need file storage, which the app does not have yet, plus a privacy-notice update and some one-off setup on the hosted project. Recommended: no photos for now (title, notes and status only); we can add photos later as their own piece of work if you want them.
3. **Should anyone be able to keep a private item on the shopping list?** Recommended: no, one shared list for the whole flat. Private items add rules about who sees what and cause confusion at the till.
4. **Who may delete noticeboard posts, and who may pin them?** Recommended: the person who wrote a post can delete it, and any admin can delete any post; only admins can pin (up to three).
5. **When should the bin reminder arrive, and by what channel?** Recommended: 6pm the evening before, to everyone, in the inbox and as a phone notification that says only "A bin collection is tomorrow", with each person able to turn it off or snooze it. The time is the same for all flats.
6. **What about "house rules" and the "activity feed" from the original wishlist?** Recommended: house rules become pinned noticeboard posts with no expiry, set by admins; the activity feed is left out because your inbox and the home page's "Recent" already show what is happening.
