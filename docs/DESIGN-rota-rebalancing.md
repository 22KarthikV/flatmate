# Design: rebalancing when a flatmate leaves

Status: design agreed in principle (owner, 2026-10-28); built and specified in detail in the `rota`, `recurring` and `ledger` module specs. Triggered by `identity` (account deleted) and `household` (member removed or leaves).

## Goal

When someone stops being part of the flat, nobody should have to fix anything by hand. Everything forward-looking is rebuilt for the people who remain, and the work is shared **fairly by effort**, not just by count.

## Rules

1. **History is kept, the future is rebuilt.** Past assignments, expenses and settlements are append-only and stay. Only items from the leaving date onward change.
2. **Effort-weighted fairness.** Each chore has an effort score (for example bins = 1, kitchen = 3, bathroom = 4, living room + hallway = 3, set by the admin with sensible defaults). A fair share is measured in effort points, not tasks.
3. **Strict rotation survives.** Nobody becomes permanently responsible for a chore. Within equal load, the person who did that chore longest ago takes it.
4. **Availability still wins.** A task moves only to a day the person is available; if nobody is available, it stays unassigned and the admin is told (never silently dropped).
5. **The leaver's debt or credit is not redistributed by this algorithm.** Money is handled by the ledger (settle up, or the admin writes it off); the rota only deals with work.

## Algorithm (rota)

Inputs: remaining members `M`, upcoming unassigned or leaver-assigned tasks `T` (each with `effort`, `chore`, `day window`), each member's `carriedLoad` (effort done minus fair share so far this cycle, from `rotation_state`), availability by day, `lastDone[member][chore]`.

1. **Collect** every task from the leaving date forward that was assigned to the leaver. Tasks of the others stay where they are (minimal disruption), unless step 4 finds a clearly unfair gap.
2. **Order** the collected tasks by effort, highest first (longest-processing-time rule, which gives near-optimal balance for this kind of problem).
3. **Assign greedily.** For each task, among members available in its window, pick the one with the lowest `carriedLoad + effort already assigned in this pass`. Break ties by the oldest `lastDone[member][chore]`, then by a stable seeded order so reruns give the same result.
4. **Rebalance check.** Compute each remaining member's total future effort. If the gap between the highest and lowest exceeds a threshold (one average task), swap or move the smallest set of tasks that closes the gap, preferring tasks not yet started and not within the next 24 hours.
5. **Equal split of the rest.** Recurring shares (rent, bills, council tax) are recalculated for the remaining members from the next period onward, equally. Already-generated instances stay as they were.
6. **Record** the result as a new `rota_weeks` revision (idempotent key `(household_id, week_start, revision)`), write notifications to affected members through the outbox, and keep the explanation ("moved because Sam left") for the activity log.

Complexity is `O(T log T + T·M)`, trivial for five people and a few hundred tasks, and it runs per household so it scales horizontally.

## Properties to test first (TDD)

- Total effort before and after is conserved (nothing lost or duplicated).
- With equal availability, the max-min effort gap is at most the largest single task.
- No task is assigned to someone unavailable that day.
- Running it twice gives the same result (idempotent).
- The leaver never appears in any future assignment or share.
- A leaver with zero upcoming tasks changes nothing for the others.
- A solo remaining member receives everything; zero remaining members yields no assignments and no error.

## Open points for the module specs

- Whether effort scores are editable per household, and the defaults.
- How long before a task starts it is considered "locked" and not moved by the rebalance check.
- Whether the admin can preview the new rota before it is applied (proposed: applied automatically, with a one-tap undo for 24 hours).
