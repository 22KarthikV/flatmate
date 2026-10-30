# Spec: the home page

Status: approved by owner. Depends on: `household`, `notifications`, `ledger` and `recurring` (built) and `rota` (built; away periods in `SPEC-rota-away.md` land separately). It adds no new module. It only reads what the others already hold.

## Objective

Open FlatMate and know in five seconds what needs you today. The page answers "what do I have to do, what do I owe, what is coming?" without making anyone visit four sections. It never does the work itself: every item is a short line that links to the screen where the work happens.

Today the page (`src/app/(app)/dashboard/page.tsx`) shows the setup checklist, the flat's name and a "Coming soon" placeholder. This spec replaces the placeholder.

### User stories

- As a member, I see anything waiting on me at the top: availability not answered, a payment to confirm, a bill amount to enter, a swap asked of me.
- As a member, I see my chores this week, overdue first, and open one in a tap.
- As a member, I see my own rent for this month and whether it is paid. I never see anyone else's.
- As a member, I see whether I owe or am owed money overall, and with whom.
- As a member, I see which bills fall due soon, and a short list of what just happened in the flat.
- As an admin, I also see what only admins can fix.
- As a brand-new member of a brand-new flat, I see a friendly start, not a screen of empty boxes.

## Decisions already made (do not reopen)

- **Rent is private.** A member sees only their own rent, read through `my_rent()`. No block ever shows another person's rent amount or paid status. The collector and admins keep the confirm queue they already have.
- **No amounts in push text.** Nothing here changes notifications.
- **Away periods** are for the rota only. Money ignores them. An away member sees "Away from chores. Rent and bills still apply." in their chores block.
- **The rota is availability-driven** with a Saturday 18:00 London deadline (`availabilityDeadline` in `src/features/rota/week.ts`).

## What the member sees, top to bottom

Order is by urgency. A block with nothing to show is hidden, except chores and money, which show a calm "all clear" line so the page never looks broken.

1. **Waiting on you** (hidden when empty). One link per line, most urgent first, at most 4, then "and 2 more" linking to the notifications page:
   - "Say which days you're around next week. Closes Saturday 18:00" (window open and I have not answered).
   - "Sam says they paid you. Please confirm" (a payment waiting for my decision).
   - "Enter this month's Gas amount, due 12 Nov" (I am the payer of a variable bill with no amount yet).
   - "Riyon asked to swap Bins with you" (a pending swap addressed to me).
2. **Your chores this week.** Overdue, then due today, then upcoming, then done (collapsed to a count). Each row: chore, day, progress ("2 of 5 steps"). If this week's rota is not generated yet, say "The rota for this week isn't ready yet" rather than showing nothing.
3. **Your rent.** This month's amount, due date, who to pay, and status (unpaid, waiting for confirmation, paid). Hidden if the flat has no rent set up.
4. **What you owe / are owed.** One line ("You owe £12.40 in total", "You're owed £30.00", "All square") plus up to three people it is with. Links to Money.
5. **Coming up.** Bills due in the next 14 days and the next rota deadline, as a short dated list. A bill shows its name and due date, and an amount only if it is the viewer's own share, by the same rule as the Money screens.
6. **Recent in the flat.** My last five notifications, newest first, linking to the full inbox.

The setup checklist stays on top while it has unfinished steps and disappears when done (existing behaviour). The "Your flat" card shrinks to a line in the page header, since the page is now the daily view.

### Empty and new-flat states

- **No flat yet:** the existing create-a-flat and open-invite cards, unchanged.
- **New flat, one member:** checklist, then one card "Invite your flatmates to get started" with the invite action. Chores, rent, balances and coming-up are hidden, not shown empty.
- **No chores or no rent set up:** that block becomes one line for admins ("Add your chores", linking to the chore manager) and is hidden for members.
- **Nothing owed, nothing due:** the page says "Nothing needs you right now."

### Admin-only extras

A small "For admins" section, only for admins and owners, below "Waiting on you":

- Rent payments waiting for confirmation (count, link).
- A chore nobody could do this week (the existing "unassigned" status).
- People invited who have not joined (count, link to the flat page).

Members never see this section and its data is not fetched for them.

## Where each block reads from

Everything below exists today, so the aim is no migration.

| Block                       | Reads                                                                                                           | Notes                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Header, role, checklist     | `getMembership()`, `getMembers()`, `buildChecklist()`                                                           | Already used by the page; `getMembership` is request-cached.             |
| Availability prompt         | `getWeekAvailability(weekStart)` (`rota/availability.ts`); `windowState`, `upcomingWeekStart` (`rota/week.ts`)  | Only when the window is open and I have no answers for that week.        |
| Payments to confirm (money) | `getPendingSettlements(viewerId, isAdmin)` (`ledger/settlements.ts`)                                            | Reads `settlements` through row-level security.                          |
| Rent payments to confirm    | `getPendingRentPayments()` (`recurring/rent.ts`)                                                                | Database already limits it to the collector and admins.                  |
| Bill amount to enter        | `getBillMonths()` (`recurring/months.ts`), filtered to `awaiting_amount` where I am the payer                   | Reads `recurring_instances` and templates. Entering stays on its screen. |
| Swaps for me                | `getPendingSwaps()` (`rota/swaps.ts`), filtered to me as recipient                                              | Reads `swap_requests`.                                                   |
| My chores                   | `getWeeks([currentWeekStart])` (`rota/weeks.ts`), then `arrangeForViewer` and `statusOf` (`rota/week-model.ts`) | One query; keep only my rows.                                            |
| Away line                   | the away reader from `SPEC-rota-away.md` (`away_periods`)                                                       | Hidden until that lands. Not needed for a first version.                 |
| My rent                     | `getMyRent()` (`recurring/rent.ts`), which calls `my_rent()`                                                    | Returns only the caller's own rows.                                      |
| Owe / owed                  | `getBalancesView(householdId, viewerId)` (`ledger/balances.ts`), which calls `household_balances(uuid)`         | Gives the signed-in person's summary and counterparts.                   |
| Coming up                   | `getBillMonths()` due dates plus `availabilityDeadline`                                                         | No new query.                                                            |
| Recent                      | `getInbox()` (`notifications/inbox.ts`), first 5                                                                | Own notifications only.                                                  |
| Admin extras                | `getPendingRentPayments()`, the week from `getWeeks`, `getMembers()`                                            | Admin only.                                                              |

**Gaps (none blocking).**

1. Some readers fetch more than Home needs (the inbox reads 50 rows, bill months up to 300). If measurement shows it is slow, add one small read function `home_summary()` returning only the caller's counts and next due dates, in a migration in 20261131..20261140. Recommended: do not add it up front.
2. "Bills due in 14 days" has no dedicated query; it is derived from `getBillMonths`. Fine at a flat's volume.
3. The away reader belongs to `SPEC-rota-away.md`, not this spec.

## Privacy rules

- Every read runs as the signed-in person, through row-level security or a function that checks the caller. Nothing uses the service key.
- Rent amounts come only from `my_rent()`. Other people's rent status is never loaded for members. The admin queue uses the existing admin-only reader.
- The balances line shows what I owe or am owed and to whom, exactly as Money does today.
- The page shows only the viewer's own availability and away dates.
- "Recent" shows notification text already written for the inbox. No new text with amounts is created, and no push text changes.
- The page title and tab never contain an amount or a name other than the flat's.
- No new data is stored, so the privacy page's data list does not change. A test confirms it.

## Loading and error behaviour

Each block loads on its own inside its own `Suspense` boundary and its own error boundary, so quick blocks appear first and a failed one never breaks the rest.

- **Loading:** a fixed-height placeholder per block (no layout jump), hidden from screen readers.
- **Error:** one calm line, "Couldn't load this. Try again", with a link that reloads the page. The error is logged as `home.<block>_failed`.
- **Never** show a raw error. **Never** show "£0.00 owed" or "All square" when the truth is "could not load": the ledger reader returns null on failure and the block must treat null as an error.
- **Signed out or no flat:** handled before any block runs, as today.
- **Offline:** no change from the existing service worker rules.

## Budgets and performance

These existing limits must still hold, and none is raised by this work:

- `scripts/bundle-budgets.json`: `/dashboard` at 200 KB first-load JS. The page and blocks are server components, so almost no new client JavaScript. The only client code allowed is the retry link and, if used, a small tick button. Forms and sheets (swap, amount entry) are linked to, never imported.
- Lighthouse (`lighthouserc.app.json`, `/dashboard`, three runs): performance at least 0.90 (error), accessibility at least 0.95 (error), best practices and SEO at least 0.90 (warn).
- No new images or fonts. Blocks read in parallel, not one after another.

## Accessibility and 360px phone layout

- One column everywhere in the existing `max-w-3xl` container with `px-4` gutters. No sideways scroll at 360px.
- Each block is a `section` with a visible heading; the page keeps one `h1`.
- Every line in "Waiting on you" and "Your chores" is one link or button, at least 44px tall, with the full sentence as its label.
- Status is never colour alone: overdue, today and done each carry a word.
- Amounts are plain text with a currency symbol. Reduced motion is respected (no entrance animation needed).
- Existing design tokens keep contrast and focus rings; the Lighthouse 0.95 accessibility gate must stay green.

## Tech and structure

Server component page. Each block is an async server component inside a small `HomeBlock` that supplies the `Suspense`, error boundary and placeholder. Decision logic lives in plain functions with tests. The page imports readers from other modules and does not edit them; a needed small change to a reader goes in that module's file and is named in the PR body.

### Files

| File                                                 | Change                                           |
| ---------------------------------------------------- | ------------------------------------------------ |
| `src/app/(app)/dashboard/page.tsx`                   | Replace the placeholder with the blocks          |
| `src/features/home/home-block.tsx`                   | Suspense, error boundary and placeholder wrapper |
| `src/features/home/waiting-on-you.tsx`, `waiting.ts` | Block and the pure ordering and capping logic    |
| `src/features/home/my-chores.tsx`                    | Chores block                                     |
| `src/features/home/my-rent.tsx`                      | Rent block                                       |
| `src/features/home/money-summary.tsx`                | Owe/owed block                                   |
| `src/features/home/coming-up.tsx`, `coming-up.ts`    | Upcoming bills and rota deadline                 |
| `src/features/home/recent.tsx`                       | Last five notifications                          |
| `src/features/home/admin-extras.tsx`                 | Admin-only section                               |
| `src/features/home/*.test.ts(x)`                     | Vitest for each                                  |
| `e2e/home.spec.ts`                                   | One end-to-end test                              |

No change to `nav.tsx`, notification types, `src/lib/db/types.ts`, `bundle-budgets.json` or `DEPLOY.md`.

## Migration

None. If `home_summary()` is ever added, it uses the range 20261131..20261140 and the pgTAP test below.

## Tests

- **Vitest (written first):**
  - waiting list: urgency order, capped at 4 with an "and N more" count, empty when nothing waits; the availability prompt appears only when the window is open and unanswered;
  - chores: overdue, then today, then upcoming; only my rows; done collapsed to a count; "rota not ready" before generation;
  - money line: owes, owed, square; a null from the ledger shows the error line, never "all square";
  - rent: only the viewer's own row reaches the component; no rent set up renders nothing;
  - coming up: the 14-day edges, sorted by date;
  - each block shows its error line when its reader throws, while the others still render;
  - the page title contains no amount.
- **pgTAP:** none without a migration. If `home_summary()` is added: a member sees only their own counts, another flat's data is invisible, `anon` is denied, and no other member's rent is returned.
- **End-to-end (one, desktop-chrome):** a new one-person flat sees the invite card. With a second member, a rota and a bill in place, member A sees the availability line, their chore, their own rent and an owe line; member B sees their own rent and not A's; an admin sees "For admins" and a member does not; the page still loads when one block's data fails.
- **Manual:** a real phone at 360px, nothing scrolls sideways, the first waiting line is visible without scrolling.
- **Gates that stay green:** lint, typecheck, unit, build, bundle budgets, Lighthouse on `/dashboard`.

## Boundaries

- **Always:** one block failing never breaks the page; private values come only from functions that check the caller; text is plain and short.
- **Ask first:** adding a migration; raising a bundle budget; adding data to the privacy page.
- **Never:** show another member's rent; put an amount in a title, tab or push text; fetch admin data for a member; put forms on the home page.

## Success criteria

- A new member sees their next action within five seconds, one tap from done.
- Viewing the page only reads; it changes nothing.
- Killing any one read leaves the other blocks showing.
- `/dashboard` stays under 200 KB with Lighthouse 0.90 performance and 0.95 accessibility.
- A member's page contains no other member's rent amount (proved by test).

## Risks

| Risk                                      | What we do                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Too many reads make the page slow         | Parallel blocks with placeholders; add `home_summary()` only if measured slow                              |
| "Waiting on you" duplicates the inbox     | It shows what is true now, not what was sent; a handled item disappears even if its notification is unread |
| A reader changes shape under the page     | Each block has its own test and its own error line                                                         |
| The page turns into a second Money screen | Lines link out; no forms on Home                                                                           |

## Owner decisions (all defaults accepted)

1. **Should Home show a "recent in the flat" list?** It repeats the notifications. Recommended default: yes, five items, hidden if empty.
2. **Should a member see the whole flat's chores on Home, or only their own?** Recommended default: only their own, with a link to the full rota.
3. **Should admins see "payments waiting to confirm" on Home as well as in Money?** Recommended default: yes, in the admin section.
4. **How far ahead should "Coming up" look?** Recommended default: 14 days.
5. **Should Home say something extra when all your chores are done?** Recommended default: no, just "Nothing needs you right now."
