// Fairness arithmetic for the rota (SPEC-rota T3, T14, T17). Pure.
//
// "Carried load" is effort done minus fair share so far, where a share is worked out from everything
// that was handed out but only chores that were actually done (or excused) count as done. It is derived from past assignments every
// time, never stored, so it cannot drift. A fair share is each week's total effort divided by the
// people who were in the flat that week, so someone who joined later is not buried and someone who
// left takes nothing with them.

export interface PastWeek {
  /** Everyone in the rota that week. */
  members: readonly string[];
  /** `done` is false for a chore left undone or covered by a later one; missing means done. */
  assignments: readonly { assignee: string | null; effort: number; done?: boolean }[];
  /** Days (0 to 7) each person was away that week. Away days do not count against anyone's share. */
  away?: Readonly<Record<string, number>>;
}

/** Each person's share of a week's effort, weighted by the days they were around. */
export function weekShares(week: PastWeek, total: number): Record<string, number> {
  const weights = week.members.map((id) => Math.max(0, 7 - (week.away?.[id] ?? 0)));
  const sum = weights.reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    week.members.map((id, i) => [id, sum === 0 ? 0 : (total * weights[i]!) / sum]),
  );
}

/** Rounds away floating-point noise so sums in a different order compare equal. */
export function steady(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Effort done minus fair share, per current member, over the given weeks. Someone who was in none of
 * those weeks (a joiner) starts at the flat's average, so they are neither buried nor spared (T17).
 */
export function carriedLoads(
  members: readonly string[],
  history: readonly PastWeek[],
): Record<string, number> {
  const load: Record<string, number> = Object.fromEntries(members.map((id) => [id, 0]));
  for (const week of history) {
    if (week.members.length === 0) continue;
    const assigned = week.assignments.filter((a) => a.assignee !== null);
    const total = assigned.reduce((sum, a) => sum + a.effort, 0);
    const shares = weekShares(week, total);
    for (const id of members) {
      if (!week.members.includes(id)) continue;
      const share = shares[id] ?? 0;
      const done = assigned
        .filter((a) => a.assignee === id && a.done !== false)
        .reduce((sum, a) => sum + a.effort, 0);
      load[id] = steady(load[id]! + done - share);
    }
  }
  const joiners = members.filter((id) => !history.some((w) => w.members.includes(id)));
  const settled = members.filter((id) => !joiners.includes(id));
  if (joiners.length > 0 && settled.length > 0) {
    const average = steady(settled.reduce((sum, id) => sum + load[id]!, 0) / settled.length);
    for (const id of joiners) load[id] = average;
  }
  return load;
}

/** The most a person can be put ahead of the rest in one week to make up for chores they left undone. */
export const CATCH_UP_PER_WEEK = 1;

/**
 * Carried loads as the scheduler should rank them. Someone who left chores undone is owed work, but
 * is only moved up by CATCH_UP_PER_WEEK at a time: their load is never treated as lower than the
 * others' median less that, so the debt is paid back over weeks and nobody is buried in one.
 */
export function catchUpLimited(
  members: readonly string[],
  carried: Readonly<Record<string, number>>,
): Record<string, number> {
  const load = (id: string) => carried[id] ?? 0;
  const limited: Record<string, number> = {};
  for (const id of members) {
    const others = members
      .filter((other) => other !== id)
      .map(load)
      .sort((a, b) => a - b);
    if (others.length === 0) {
      limited[id] = load(id);
      continue;
    }
    const mid = Math.floor(others.length / 2);
    const median = others.length % 2 === 1 ? others[mid]! : (others[mid - 1]! + others[mid]!) / 2;
    limited[id] = steady(Math.max(load(id), median - CATCH_UP_PER_WEEK));
  }
  return limited;
}

/** Total effort given to each person. People with nothing appear at zero. */
export function effortByPerson(
  members: readonly string[],
  assignments: readonly { assignee: string | null; effort: number }[],
): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(members.map((id) => [id, 0]));
  for (const a of assignments) {
    if (a.assignee !== null && a.assignee in totals) totals[a.assignee]! += a.effort;
  }
  return totals;
}

/** The latest date each person did each chore, from past assignments. */
export function lastDoneFrom(
  assignments: readonly { assignee: string | null; choreId: string; dueOn: string }[],
): Record<string, Record<string, string>> {
  const last: Record<string, Record<string, string>> = {};
  for (const a of assignments) {
    if (a.assignee === null) continue;
    const mine = (last[a.assignee] ??= {});
    if (mine[a.choreId] === undefined || mine[a.choreId]! < a.dueOn) mine[a.choreId] = a.dueOn;
  }
  return last;
}

export interface OwedChange {
  profileId: string;
  choreId: string;
  delta: 1 | -1;
}

/** Applies owed-turn changes to a state, never letting a count leave 0 to 1. */
export function applyOwedChanges(
  owed: Record<string, Record<string, number>>,
  changes: readonly OwedChange[],
): Record<string, Record<string, number>> {
  const next: Record<string, Record<string, number>> = {};
  for (const [id, chores] of Object.entries(owed)) next[id] = { ...chores };
  for (const change of changes) {
    const mine = (next[change.profileId] ??= {});
    mine[change.choreId] = Math.min(1, Math.max(0, (mine[change.choreId] ?? 0) + change.delta));
  }
  return next;
}

/** Largest minus smallest total, the gap the fairness bound talks about. */
export function effortGap(totals: Record<string, number>): number {
  const values = Object.values(totals);
  return values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
}
