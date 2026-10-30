// Rebalancing when someone leaves (SPEC-rota T15, T16 and docs/DESIGN-rota-rebalancing.md). Pure:
// no clock, no random, no database, and the answer never depends on the order the input arrives in.
//
// 1. Collect every upcoming chore the leaver held (even started or locked ones: they cannot do them).
// 2. Order them by effort, biggest first.
// 3. Give each to the available person with the lowest load, ties to whoever did that chore longest
//    ago, then by a stable order.
// 4. If the gap between the most and least loaded person is more than one average chore, move the
//    fewest, smallest chores that close it, never touching started or locked ones.
// Chores nobody can take stay unassigned and are reported. Money is not touched here.

import { explainAssignment } from "./explain";
import { steady } from "./fairness";

export interface RebalanceTask {
  id: string;
  choreId: string;
  choreName: string;
  effort: number;
  dueOn: string;
  /** The current holder: the leaver, someone staying, or null. */
  assignee: string | null;
  /** Someone has already ticked a step. Never moved by the evening-out step. */
  started: boolean;
  /** Starts within 24 hours or has started. Never moved by the evening-out step. */
  locked: boolean;
}

export interface RebalanceInput {
  leaver: string;
  leaverName: string;
  /** Why the person's chores are moving. Away means they stay in the flat; only these days are given out. */
  cause?: "left" | "away";
  /** Everyone staying (the leaver must not be in it). */
  remaining: readonly string[];
  /** Upcoming, unfinished chores of the flat from the leaving date on. */
  tasks: readonly RebalanceTask[];
  /** `availability[person][date] === false` means away. */
  availability: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
  /** Effort done minus fair share so far. Missing means 0. */
  carriedLoad: Readonly<Record<string, number>>;
  /** The latest date each person did each chore. */
  lastDone: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface RebalanceMove {
  taskId: string;
  from: string | null;
  to: string | null;
  /** The leaver's own chore, or one moved to even things out. */
  reason: "leaver" | "balance";
  explanation: string;
}

export interface RebalanceResult {
  moves: RebalanceMove[];
  /** The new holder of each chore that changed hands (null = nobody around). */
  assignments: { taskId: string; assignee: string | null }[];
  unassigned: string[];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function rebalanceAfterLeave(input: RebalanceInput): RebalanceResult {
  const away = input.cause === "away";
  const remaining = [...new Set(input.remaining)]
    .filter((id) => id !== input.leaver)
    .sort(compareText);
  const around = (person: string, date: string) => input.availability[person]?.[date] !== false;

  // Working copy of who holds what, in a stable order.
  const tasks = [...input.tasks].sort((a, b) => compareText(a.id, b.id));
  const holder = new Map<string, string | null>(tasks.map((t) => [t.id, t.assignee]));
  const moved = new Map<string, RebalanceMove>();

  const collected = tasks
    .filter((t) => t.assignee === input.leaver)
    .sort(
      (a, b) =>
        b.effort - a.effort ||
        compareText(a.choreId, b.choreId) ||
        compareText(a.dueOn, b.dueOn) ||
        compareText(a.id, b.id),
    );
  if (collected.length === 0) return { moves: [], assignments: [], unassigned: [] };

  const futureEffort = (person: string) =>
    tasks.filter((t) => holder.get(t.id) === person).reduce((sum, t) => sum + t.effort, 0);
  const lastDone = (person: string, choreId: string) => input.lastDone[person]?.[choreId] ?? "";

  // Steps 1 to 3: give the leaver's chores away.
  for (const t of collected) {
    const candidates = remaining.filter((person) => around(person, t.dueOn));
    if (candidates.length === 0) {
      holder.set(t.id, null);
      moved.set(t.id, {
        taskId: t.id,
        from: input.leaver,
        to: null,
        reason: "leaver",
        explanation: explainAssignment([{ kind: "unassigned", chore: t.choreName }]),
      });
      continue;
    }
    const load = (person: string) =>
      steady((input.carriedLoad[person] ?? 0) + futureEffort(person));
    const best = [...candidates].sort(
      (a, b) =>
        load(a) - load(b) ||
        compareText(lastDone(a, t.choreId), lastDone(b, t.choreId)) ||
        compareText(a, b),
    )[0]!;
    holder.set(t.id, best);
    moved.set(t.id, {
      taskId: t.id,
      from: input.leaver,
      to: best,
      reason: "leaver",
      explanation: away
        ? `Moved to you because ${input.leaverName} is away.`
        : explainAssignment([{ kind: "rebalanced", leaver: input.leaverName }]),
    });
  }

  // Step 4: if the gap is more than one average chore, move the fewest, smallest chores to close it.
  if (remaining.length >= 2) {
    const live = tasks.filter((t) => holder.get(t.id) !== null);
    const average = live.length === 0 ? 0 : live.reduce((s, t) => s + t.effort, 0) / live.length;

    for (let guard = 0; guard < tasks.length * remaining.length + 1; guard++) {
      const totals = remaining.map((person) => ({ person, total: futureEffort(person) }));
      const high = [...totals].sort(
        (a, b) => b.total - a.total || compareText(a.person, b.person),
      )[0]!;
      const gapFor = (low: { person: string; total: number }) => high.total - low.total;

      // The most-spare person who can actually take something off the busiest person.
      const lows = [...totals]
        .filter((entry) => entry.person !== high.person)
        .sort((a, b) => a.total - b.total || compareText(a.person, b.person));
      let best: { task: RebalanceTask; to: string } | null = null;
      for (const low of lows) {
        const gap = gapFor(low);
        if (gap <= average) break;
        const movable = tasks
          .filter(
            (t) =>
              holder.get(t.id) === high.person &&
              !t.started &&
              !t.locked &&
              t.effort < gap &&
              around(low.person, t.dueOn),
          )
          // The chore that leaves the two closest to level; smaller, then earlier, on a tie.
          .sort(
            (a, b) =>
              Math.abs(gap - 2 * a.effort) - Math.abs(gap - 2 * b.effort) ||
              a.effort - b.effort ||
              compareText(a.dueOn, b.dueOn) ||
              compareText(a.id, b.id),
          );
        if (movable.length > 0) {
          best = { task: movable[0]!, to: low.person };
          break;
        }
      }
      if (!best) break;

      holder.set(best.task.id, best.to);
      const earlier = moved.get(best.task.id);
      moved.set(
        best.task.id,
        earlier
          ? { ...earlier, to: best.to }
          : {
              taskId: best.task.id,
              from: high.person,
              to: best.to,
              reason: "balance",
              explanation: away
                ? `Moved to you to even out the work while ${input.leaverName} is away.`
                : `Moved to you to even out the work after ${input.leaverName} left.`,
            },
      );
    }
  }

  const moves = [...moved.values()].sort((a, b) => {
    const ta = tasks.find((t) => t.id === a.taskId)!;
    const tb = tasks.find((t) => t.id === b.taskId)!;
    return (
      Number(a.reason === "balance") - Number(b.reason === "balance") ||
      tb.effort - ta.effort ||
      compareText(ta.choreId, tb.choreId) ||
      compareText(ta.dueOn, tb.dueOn) ||
      compareText(ta.id, tb.id)
    );
  });
  // A chore that went to someone and then came back is not a move; a chore that ended up where it
  // started (only possible for balance moves) is dropped.
  const real = moves.filter((m) => holder.get(m.taskId) !== m.from);
  return {
    moves: real.map((m) => ({ ...m, to: holder.get(m.taskId) ?? null })),
    assignments: real.map((m) => ({ taskId: m.taskId, assignee: holder.get(m.taskId) ?? null })),
    unassigned: real.filter((m) => (holder.get(m.taskId) ?? null) === null).map((m) => m.taskId),
  };
}
