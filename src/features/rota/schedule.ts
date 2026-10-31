// The scheduler (SPEC-rota T1, T3, T6, T7): one pure function that turns who is around, what needs
// doing and the rotation so far into a week of assignments, each with its reason. It has no clock,
// no random and no database, and its answer never depends on the order its input arrives in, so the
// same inputs always give the same rota. The database stores what it returns and never decides
// anything itself.

import { explainAssignment, type Reason } from "./explain";
import { catchUpLimited, steady, type OwedChange } from "./fairness";
import { addDays, daysBetween, weekDates } from "./week";

export interface ScheduleChore {
  id: string;
  name: string;
  cadence: "weekly" | "every_n_days";
  /** 0 = Sunday. Weekly chores only. */
  preferredDow: number | null;
  /** Every-N-days chores only. */
  everyNDays: number | null;
  effort: number;
}

export interface ScheduleInput {
  /** The Sunday the week starts on. */
  weekStart: string;
  /** Profile ids of the people in the rota. */
  members: readonly string[];
  chores: readonly ScheduleChore[];
  /** `availability[person][date] === false` means away. Anything else counts as around. */
  availability: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
  /** Effort done minus fair share so far, per person (see fairness.ts). Missing means 0. */
  carriedLoad: Readonly<Record<string, number>>;
  /** The latest date each person did each chore. Missing means never. */
  lastDone: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Turns people were passed over for: `owed[person][chore] > 0`. */
  owed: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface ScheduledAssignment {
  choreId: string;
  choreName: string;
  effort: number;
  /** Null when nobody is around: admins are told, it is never dropped. */
  assignee: string | null;
  dueOn: string;
  reasons: Reason[];
  explanation: string;
}

export interface ScheduleResult {
  assignments: ScheduledAssignment[];
  unassigned: ScheduledAssignment[];
  owedChanges: OwedChange[];
}

interface Slot {
  chore: ScheduleChore;
  target: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every slot the week needs: weekly chores once on their day, others every N days from the start. */
function slotsFor(weekStart: string, chores: readonly ScheduleChore[]): Slot[] {
  const slots: Slot[] = [];
  for (const chore of chores) {
    if (chore.cadence === "weekly") {
      slots.push({ chore, target: addDays(weekStart, chore.preferredDow ?? 0) });
    } else {
      const step = Math.max(1, chore.everyNDays ?? 1);
      for (let offset = 0; offset < 7; offset += step) {
        slots.push({ chore, target: addDays(weekStart, offset) });
      }
    }
  }
  return slots.sort(
    (a, b) =>
      b.chore.effort - a.chore.effort ||
      compareText(a.chore.id, b.chore.id) ||
      compareText(a.target, b.target),
  );
}

export function buildWeek(input: ScheduleInput): ScheduleResult {
  const members = [...new Set(input.members)].sort(compareText);
  const dates = weekDates(input.weekStart);
  const around = (person: string, date: string) => input.availability[person]?.[date] !== false;

  // What this pass has handed out so far.
  const given: Record<string, number> = Object.fromEntries(members.map((id) => [id, 0]));
  const lastDone: Record<string, Record<string, string>> = {};
  for (const id of members) lastDone[id] = { ...(input.lastDone[id] ?? {}) };
  const carried = catchUpLimited(members, input.carriedLoad);
  const owedUsed = new Set<string>();
  const owedMarked = new Set<string>();

  const assignments: ScheduledAssignment[] = [];
  const owedChanges: OwedChange[] = [];

  for (const slot of slotsFor(input.weekStart, input.chores)) {
    const { chore, target } = slot;

    const hasPriority = (person: string) =>
      (input.owed[person]?.[chore.id] ?? 0) > 0 && !owedUsed.has(person);
    const load = (person: string) => steady((carried[person] ?? 0) + given[person]!);
    const compare = (a: string, b: string): number =>
      Number(hasPriority(b)) - Number(hasPriority(a)) ||
      load(a) - load(b) ||
      compareText(lastDone[a]![chore.id] ?? "", lastDone[b]![chore.id] ?? "") ||
      compareText(a, b);

    // Who can do it, and on which day. Normally the people around on its day. Someone who was
    // passed over for this chore before (it is owed to them) may also take it a day either side, so
    // being away on its usual day never shuts a person out of it for good. When nobody is around,
    // everyone with any day free, each on the day nearest to it (the earlier day wins a tie).
    const candidates = new Map<string, string>();
    for (const person of members) if (around(person, target)) candidates.set(person, target);
    for (const person of members) {
      if (candidates.has(person) || !hasPriority(person)) continue;
      const beside = [addDays(target, -1), addDays(target, 1)].filter(
        (date) => dates.includes(date) && around(person, date),
      );
      if (beside.length > 0) candidates.set(person, beside[0]!);
    }
    if (candidates.size === 0) {
      for (const person of members) {
        const free = dates.filter((date) => around(person, date));
        if (free.length === 0) continue;
        const nearest = [...free].sort(
          (a, b) =>
            Math.abs(daysBetween(target, a)) - Math.abs(daysBetween(target, b)) ||
            compareText(a, b),
        )[0]!;
        candidates.set(person, nearest);
      }
    }

    if (candidates.size === 0) {
      const reasons: Reason[] = [{ kind: "unassigned", chore: chore.name }];
      assignments.push({
        choreId: chore.id,
        choreName: chore.name,
        effort: chore.effort,
        assignee: null,
        dueOn: target,
        reasons,
        explanation: explainAssignment(reasons),
      });
      continue;
    }

    const ranked = [...members].sort(compare);
    const eligible = ranked.filter((person) => candidates.has(person));
    const chosen = eligible[0]!;
    const runnerUp = eligible[1];
    const dueOn = candidates.get(chosen)!;

    const reasons: Reason[] = [];
    if (members.length === 1) {
      reasons.push({ kind: "solo" });
    } else if (runnerUp === undefined) {
      reasons.push({ kind: "only_available", chore: chore.name });
    } else if (hasPriority(chosen) && !hasPriority(runnerUp)) {
      reasons.push({ kind: "owed", chore: chore.name });
    } else if (load(chosen) !== load(runnerUp)) {
      reasons.push({ kind: "lowest_load" });
    } else if ((lastDone[chosen]![chore.id] ?? "") !== (lastDone[runnerUp]![chore.id] ?? "")) {
      reasons.push({
        kind: "longest_since",
        chore: chore.name,
        never: lastDone[chosen]![chore.id] === undefined,
      });
    } else {
      reasons.push({ kind: "turn" });
    }
    if (dueOn !== target) reasons.push({ kind: "moved_day", from: target, to: dueOn });

    // Owed turns: someone who was next in line but could not be given the chore is owed it next
    // time (once per chore); someone given a chore they were owed has it paid off.
    const first = ranked[0]!;
    const passedOverKey = `${first}:${chore.id}`;
    if (
      first !== chosen &&
      !candidates.has(first) &&
      (input.owed[first]?.[chore.id] ?? 0) === 0 &&
      !owedMarked.has(passedOverKey)
    ) {
      owedMarked.add(passedOverKey);
      owedChanges.push({ profileId: first, choreId: chore.id, delta: 1 });
    }
    if (hasPriority(chosen)) {
      owedUsed.add(chosen);
      owedChanges.push({ profileId: chosen, choreId: chore.id, delta: -1 });
    }

    given[chosen]! += chore.effort;
    lastDone[chosen]![chore.id] = dueOn;
    assignments.push({
      choreId: chore.id,
      choreName: chore.name,
      effort: chore.effort,
      assignee: chosen,
      dueOn,
      reasons,
      explanation: explainAssignment(reasons),
    });
  }

  assignments.sort(
    (a, b) =>
      compareText(a.dueOn, b.dueOn) ||
      compareText(a.choreId, b.choreId) ||
      compareText(a.assignee ?? "", b.assignee ?? ""),
  );
  owedChanges.sort(
    (a, b) =>
      compareText(a.profileId, b.profileId) ||
      compareText(a.choreId, b.choreId) ||
      a.delta - b.delta,
  );
  return { assignments, unassigned: assignments.filter((a) => a.assignee === null), owedChanges };
}
