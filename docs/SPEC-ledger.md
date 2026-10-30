# Spec: ledger

Status: **approved by the owner** (2026-10-30, on the default decisions below). Depends on: `household` and `notifications` (both complete). Unlocks: `recurring` (rent and bills are built on top of this).

## Objective

Let flatmates keep track of who owes whom, without moving any money through the app (D10). Anyone adds a shared expense ("kitchen roll, £8.40, I paid, split between us"), everyone affected is told, a Money screen shows who owes whom in the fewest payments, and a person records "I paid Sam £12" which Sam confirms. The app never touches real money; it keeps an honest, tamper-evident record.

Capabilities from the requirements: FR-LG-1 to FR-LG-7. FR-LG-8 (receipt photo) is deferred, see L12. The acceptance rule is a database fact: **for any flat, the sum of all balances is exactly zero.**

### User stories

- As a member, I add an expense: amount, what it was for, a category, the date, who paid, and who it is for.
- As a member, I split an expense equally, by exact amounts, by percentages, or put it on one person (for example something bought for a flatmate).
- As a member, I am told when an expense involves me: "Karthik added kitchen roll. Your share is £4.20" in my inbox, and a push that says only that there is something new.
- As a member, I see what I owe, what I am owed, and the shortest list of payments that would settle the flat.
- As a member, I record that I paid someone; they confirm, and only then does the balance change. Until then it shows as pending and the receiver is reminded.
- As the person who added an expense, or as an admin, I can correct or cancel it. The old version stays visible as history; balances recalculate.
- As a member, I get a gentle nudge if I have owed money for a while, at an interval I can live with.
- As a member leaving the flat, I can leave once I owe nothing and am owed nothing, or an admin can settle what is left on my behalf.
- As the developer, I can prove that balances always sum to zero, that shares always sum to the expense, and that nobody outside the flat can see any of it.

## Decisions to confirm

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Money is integer pence** (D11) in `bigint`. One expense is between 1p and £10,000 (1,000,000 pence); a settlement likewise. All arithmetic is integer; there are no floats anywhere, including percentages (stored as hundredths of a percent, so 33.33% is 3333 of 10000).                                                                                                                                                                                                            |
| L2  | **Append-only.** `expenses`, `expense_shares` and `settlements` are never updated or deleted by the app. The one allowed change is to mark a row void (once). An edit is "void the old expense and add a new one that points back to it" (`replaces_id`), so the history shows what changed and when. Nothing is lost, and balances ignore voided rows.                                                                                                                                  |
| L3  | **Balances are derived, not stored.** A flat has about 5 people and a few thousand rows a year, so a database function sums the live rows in well under a millisecond. The requirements' cached `member_balances` table is **left out for now** and added only if measurement ever demands it (it would be a pure optimisation, with a test that it equals the derived value).                                                                                                           |
| L4  | **Splits are computed once, in one place.** A pure function in code turns a split request into per-person shares in pence: equal, exact, percentages, or one person. Leftover pence from rounding are given out **one at a time, largest remainder first, ties broken by profile id**, so the answer is the same every time and the shares always sum exactly. The database re-checks that shares sum to the amount.                                                                     |
| L5  | **Who can be in an expense:** the payer and everyone it is for must be active members. A member who later leaves keeps their rows and shows by name (or "Deleted user" after account deletion). Payer and sharers can be anyone in the flat, not just the person adding it (you can record that Sam paid).                                                                                                                                                                               |
| L6  | **Simplified debts:** from each person's net balance, creditors and debtors are matched greedily, largest against largest, which gives at most (people minus one) payments. It is a pure function with property tests (the payments clear every balance, none is negative, and the count never exceeds people minus one). These are _suggestions_; nothing forces people to pay that way.                                                                                                |
| L7  | **Settle-up:** the payer records "I paid Sam £12"; it is **pending** and changes nobody's balance. The receiver **confirms** (the balance moves) or **declines** (it is marked declined, with no balance change). The payer can cancel while it is pending. A pending settlement older than 2 days reminds the receiver once a day, up to 3 times.                                                                                                                                       |
| L8  | **Notifications and privacy of amounts.** The inbox row carries the full text with amounts. The **push text for money types is generic** ("Karthik added an expense", "You have a payment to confirm"), so an amount never appears on a lock screen (N9 from notifications). The fixed text lives on the notification type in the database and `claim_push_outbox` hands it to the worker, so the worker itself does not change. It is covered by tests and does not affect other types. |
| L9  | **Types added:** `expense_added` (in-app and push), `expense_changed` (in-app), `expense_voided` (in-app), `settlement_pending` (in-app and push), `settlement_confirmed` (in-app and push), `settlement_declined` (in-app and push), `payment_nudge` (in-app, snoozable). Defaults can be changed per person in the existing preferences screen.                                                                                                                                        |
| L10 | **Nudges (FR-LG-7):** a daily job reminds people who owe more than £1 and have owed for at least N days. N is a flat setting an admin chooses: off, 3, 7 (default) or 14 days. At most one nudge per person per period (dedupe key), and snoozing works.                                                                                                                                                                                                                                 |
| L11 | **Leaving and account deletion** (the `private.can_leave` hook that household reserved for this module): a person can leave, or delete their account, only when their balance is zero and they have no pending settlement. If someone is **removed** by an admin, or has gone, with money still open, an admin can **confirm a settlement on their behalf** to close it. There is no automatic write-off.                                                                                |
| L12 | **Receipt photos (FR-LG-8) are deferred.** They need file storage, an upload size and type policy, and a privacy-notice update, none of which exist yet, and they are not needed for the five-person flat to start tracking money. They are a later extra, like email in notifications.                                                                                                                                                                                                  |
| L13 | **Offline writes are out of scope.** The service worker deliberately caches no pages (privacy), so offline reading and queued writes would be a platform change of their own. The Money screen needs a connection, like the rest of the app today.                                                                                                                                                                                                                                       |
| L14 | **Live updates come free.** A new expense or settlement writes a notification in the same transaction, and the existing live bell already refreshes the screen when one arrives, so balances update without a new Realtime channel.                                                                                                                                                                                                                                                      |

## Assumptions (correct me)

1. One currency, GBP, shown as `£12.50`. Amounts are typed in pounds and pence; entering more than two decimal places is rejected, not rounded.
2. "Who it is for" defaults to everyone in the flat; the adder can untick people.
3. The expense date defaults to today (Europe/London) and cannot be more than 30 days in the future or older than 5 years.
4. Categories are a fixed short list: Groceries, Household, Bills, Takeaway, Transport, Fun, Other. Admins cannot add their own in this module.
5. Descriptions are plain text, up to 80 characters.
6. Rent and bills that repeat each month are the next module (`recurring`); here they can already be entered by hand as ordinary expenses.
7. A flat of one person can add expenses (it just owes nobody); balances are all zero.
8. Amounts in the inbox are visible to the same people who can see the expense on the Money screen, which is every member of that flat.

## Tech and structure

No new dependencies.

```
src/features/ledger/
  money.ts                formatPence, parsePounds (typed text to pence), limits
  splits.ts               splitExpense: equal / exact / percent / one-person to shares
  simplify.ts             simplifyDebts: net balances to the fewest payments
  schemas.ts              zod: add / edit expense, settlement, category, nudge setting
  actions.ts              server actions: addExpense, editExpense, voidExpense,
                          recordSettlement, confirmSettlement, declineSettlement,
                          cancelSettlement, saveNudgeSetting
  expenses.ts             server: list, detail (with history), cached per request
  balances.ts             server: balances, suggested payments, pending settlements
  expense-form.tsx        the add / edit form (client; split modes, live "shares" preview)
  balances-card.tsx       who owes whom, suggested payments, "Record a payment"
  expense-list.tsx        history, grouped by month, voided shown struck through
  settle-form.tsx         record a payment, pending and confirm / decline rows
src/app/(app)/money/page.tsx                     balances, pending, recent expenses
src/app/(app)/money/add/page.tsx                 add an expense
src/app/(app)/money/expenses/[id]/page.tsx       one expense with its shares and history
src/app/(app)/money/settle/page.tsx              record a payment
supabase/migrations/*_ledger.sql                 tables, RLS, balances function, types
supabase/migrations/*_ledger_expenses.sql        add / edit / void functions and their notifications
supabase/migrations/*_ledger_settlements.sql     settlement functions and their notifications
supabase/migrations/*_ledger_leaving.sql         can_leave hook, admin settle-on-behalf
supabase/migrations/*_ledger_nudges.sql          nudge setting and daily job
supabase/tests/database/ledger-*.test.sql
(claim_push_outbox, in the expenses migration, prefers a type's fixed push text; deliver-push is unchanged)
```

### Data model

```sql
-- Categories are a check constraint (L4 of assumptions); amounts are bigint pence.
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id),
  paid_by       uuid not null references public.profiles(id),
  created_by    uuid not null references public.profiles(id),
  amount_pence  bigint not null check (amount_pence between 1 and 1000000),
  description   text not null check (char_length(description) between 1 and 80),
  category      text not null check (category in ('groceries','household','bills','takeaway','transport','fun','other')),
  occurred_on   date not null,
  replaces_id   uuid references public.expenses(id),   -- set when this is an edit
  voided_at     timestamptz,                            -- the one allowed change, once
  voided_by     uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index on public.expenses (household_id, occurred_on desc);

create table public.expense_shares (
  expense_id    uuid not null references public.expenses(id),
  profile_id    uuid not null references public.profiles(id),
  share_pence   bigint not null check (share_pence >= 0),
  primary key (expense_id, profile_id)
);
-- A deferred constraint trigger proves sum(share_pence) = expenses.amount_pence per expense.

create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id),
  from_profile  uuid not null references public.profiles(id),   -- the payer
  to_profile    uuid not null references public.profiles(id),   -- the receiver
  amount_pence  bigint not null check (amount_pence between 1 and 1000000),
  status        text not null default 'pending'
                  check (status in ('pending','confirmed','declined','cancelled')),
  confirmed_by  uuid references public.profiles(id),            -- receiver, or an admin on their behalf
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  check (from_profile <> to_profile)
);
create index on public.settlements (household_id, status, created_at desc);

-- households gets: nudge_after_days smallint (null = off, default 7)
```

Row-level security: members of the flat can `select` its rows; nobody writes directly (no write policies), every write is a `security definer` function that derives the caller from `auth.uid()` and checks membership and role. `anon` sees nothing. `public.household_balances(household_id)` returns one net balance per person (paid, minus shares owed, plus confirmed settlements) and is callable only by members of that flat.

### Routes

| Route                  | Who          | Behaviour                                                                                                   |
| ---------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `/money`               | flat members | Your position, suggested payments, pending settlements to confirm, recent expenses, "Add expense".          |
| `/money/add`           | flat members | The add form: amount, description, category, date, who paid, who it is for, split mode with a live preview. |
| `/money/expenses/[id]` | flat members | One expense: who paid, each share, its edit history. Edit and void for its creator or an admin.             |
| `/money/settle`        | flat members | Record "I paid Sam £12", prefilled from a suggested payment.                                                |

### Notification text (examples)

| Type                   | Goes to                                 | Inbox text                                        | Push text (generic)                |
| ---------------------- | --------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| `expense_added`        | everyone with a share, except the adder | "Karthik added Kitchen roll. Your share is £4.20" | "Karthik added an expense"         |
| `settlement_pending`   | the receiver                            | "Sam says they paid you £12.00. Confirm?"         | "You have a payment to confirm"    |
| `settlement_confirmed` | the payer                               | "Karthik confirmed your £12.00 payment"           | "Your payment was confirmed"       |
| `payment_nudge`        | each person who owes                    | "You owe £23.50 across the flat"                  | "A gentle reminder about the flat" |

## Commands

Same as before: `pnpm check`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`, `pnpm test:e2e`. Hosted: apply each migration through the Supabase migration tool first, then merge. `deliver-push` does not change.

## Testing strategy

- **Pure logic (Vitest, test first):**
  - `splits`: equal, exact, percent and one-person; the leftover pence rule is deterministic and independent of input order; **property tests** over random amounts and people prove shares always sum to the amount and differ by at most 1p in an equal split; invalid input (negative, over limit, percentages not adding to 100, exact amounts not adding up) is rejected with a clear message.
  - `simplify`: property tests prove the suggested payments clear every balance exactly, no payment is non-positive, and there are at most (people minus one).
  - `money`: parse and format round-trip; "4.2" is £4.20; "4.205" is rejected.
- **Database (pgTAP, first for each migration):**
  - Isolation: a member of flat A reads zero rows from flat B and cannot write there; `anon` gets nothing; the browser role cannot insert, update or delete any ledger table directly.
  - Integrity: shares must sum to the amount (a crooked insert fails); payer and sharers must be active members; amounts outside the limits fail.
  - **The zero-sum rule:** after a random-looking run of adds, edits, voids and settlements the sum of `household_balances` is exactly 0, and voided rows do not count.
  - Append-only: an update other than void, or any delete, is rejected.
  - Permissions: only the creator or an admin may edit or void; only the receiver may confirm or decline; only the payer may cancel; an admin may confirm on behalf of a person who has left.
  - Notifications: each action writes exactly the rows in the table to the right people, once, with no self-notification, and the push text is generic.
  - `can_leave`: false with a non-zero balance or a pending settlement, true when clear.
- **Unit (components and actions):** expense form (split modes, live preview, validation messages); balances card; settle form; server actions map database errors to messages.
- **End-to-end (Playwright, desktop-chrome, two people in the shared local database):** A adds an expense split equally with B; B's inbox shows it and B's Money screen shows what they owe; B records a payment; A confirms; balances go to zero; A edits an expense and the history shows both versions; A voids one and balances recalculate; a leaving person with a balance is told why they cannot leave yet.
- **Manual (real phones):** add an expense on one phone and see it arrive on the other; confirm a payment from the push; check that a push on the lock screen shows no amount.
- **Performance:** `/money` stays within its bundle budget without raising any existing one (new routes get their own budgets); the form code is split from the page; balances are a single query.

## Boundaries

- **Always:** integer pence; write only through functions that derive the caller from `auth.uid()`; check every person named in an expense belongs to the flat; keep RLS on every new table; give every notification a dedupe key; regenerate types; show amounts only inside the app.
- **Ask first:** receipt photos or any file storage; a cached balance table; automatic write-offs; currencies other than GBP; letting admins edit other people's settlements; changing what a push contains.
- **Never:** use floating point for money; update or delete a financial row; let the browser write to a ledger table; put an amount in a push; let a settlement change a balance before the receiver (or an admin on their behalf) confirms it; let one flat's totals include another's.

## Success criteria

1. A member adds an expense in all four split modes and every affected flatmate sees it in their inbox and on Money without reloading.
2. For every flat and at every moment, the sum of balances is exactly zero, proven by pgTAP after a mixed run of adds, edits, voids and settlements.
3. Shares always sum exactly to the expense; leftover pence are given out the same way every time.
4. Suggested payments clear every balance in at most (people minus one) payments.
5. A settlement changes balances only after confirmation; declined and cancelled ones never do; the receiver is reminded about unconfirmed ones.
6. Editing or voiding keeps the old version visible; no ledger row is ever deleted or rewritten.
7. A person with an open balance or a pending settlement cannot leave or delete their account; an admin can close a removed person's balance.
8. No amount appears in any push payload.
9. pgTAP proves cross-flat isolation and that `anon` and the browser role cannot write ledger tables.
10. `pnpm check`, `pnpm db:test` and `pnpm test:e2e` pass in CI; bundle budgets hold and none is raised.

## Risks

| Risk                                               | Mitigation                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A rounding bug makes shares not add up             | One split function, property tests, and a database constraint that rejects any crooked set.                             |
| Balances drift from the rows                       | Balances are never stored (L3): they are always the sum of the rows, so they cannot drift.                              |
| Someone edits history to change who owes what      | Append-only tables, void-and-replace edits, no write policies, and a test that updates and deletes fail.                |
| An amount leaks onto a lock screen                 | Generic push text per money type (L8) and a test that no payload contains a currency amount.                            |
| Households disagree and leave with unsettled debts | Leaving is blocked until clear (L11); admins can close a removed person's balance on their behalf; no hidden write-off. |
| The Money form is heavy on a phone                 | Split mode UI is a small client component, loaded only on `/money/add`; budgets checked in CI.                          |
| Two people record the same payment                 | A settlement is one row with a status; confirming twice is a no-op; the receiver sees pending ones before paying again. |
| Scope creep into rent and bills                    | Recurring generation is the `recurring` module; the ledger only provides expenses and settlements for it to call.       |
| The `can_leave` hook is forgotten                  | It is Task 7 on its own, with a test that leaving with a balance fails.                                                 |

## Open questions (with proposed defaults)

1. Receipt photos: deferred (L12). OK?
2. Nudge interval default 7 days, admin-changeable between off, 3, 7 and 14 days (L10). OK?
3. Leaving with an open balance is blocked, with admin "settle on their behalf" for removed people, and no automatic write-off (L11). OK?
4. The fixed category list: Groceries, Household, Bills, Takeaway, Transport, Fun, Other. Anything to add or drop?
5. Push text for money is generic, so no amount shows on a lock screen (L8). OK, or do you want amounts in pushes?
