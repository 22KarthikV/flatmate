# Spec: Away periods for the rota

Status: approved by owner. Builds on SPEC-rota.md (availability, scheduler, leaver rebuild).

## Goal

A flatmate on holiday still belongs to the flat and still owes rent and bills. Only chores skip them.

## Decisions (owner)

- Flatmates can see the dates someone is away.
- No admin alert for long periods. An away period is never treated as a move-out, however long.
- Money is unaffected: rent, bills and the ledger ignore away periods.

## Behaviour

1. **Set**: on the availability screen, "I'm away from [date] to [date]" with an optional note (max 100 characters). Members set their own. Admins can set one for any member.
2. **Effect on availability**: every day in the range counts as unavailable for every week it touches, with no weekly entry needed. It replaces "assumed available if unanswered" for those days. A member can mark a single day available again (back early), and can end or shorten the period at any time.
3. **Fairness**: away days do not count against the person's share. They come back with no owed-chores pile. The fairness view shows "away" for those days instead of a shortfall.
4. **Late changes**: if a week is already generated, the same rules as a leaver apply: chores due within 24 hours stay locked, the rest are rebuilt automatically, and an admin can undo the rebuild for 24 hours.
5. **Visibility**: all members see the person's away dates on the rota and availability screens. The note is visible to members too.
6. **Wording**: the screen says "Away from chores. Rent and bills still apply."
7. **Rules**: end date on or after start date; can start in the past only back to the current week; no overlap with the same person's other away periods (they merge or are rejected with a plain message); if everyone is away on a day, the scheduler falls back to its existing "nobody available" handling.

## Data

- Table `away_periods` (household_id, profile_id, starts_on, ends_on, note, created_by, ended_at). RLS: members of the flat read; the person or an admin writes, via functions only.
- Functions: `set_away`, `end_away`; the scheduler input (`rota_generation_input`) merges away days into availability.
- Leaving the flat ends any open away period.

## Not in scope

Pausing rent or bills, notifications to admins for long periods, reasons or categories.

## Tests

pgTAP: isolation between flats, own-or-admin writes, overlap rules, scheduler input includes away days. Vitest: scheduler never assigns on away days, fairness excludes away days. E2E: member sets away, sees dates, another member sees dates, rota skips them, rent unchanged.

## Migration range

20261126..20261130 (rota range), after the leaver rebuild (Task 10) lands.
