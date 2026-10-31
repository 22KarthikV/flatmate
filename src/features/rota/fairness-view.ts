// Pure: turns past assignments into the fairness page (SPEC-rota T14, FR-RT-9). Everything shown is
// computed from the stored rows, so it always matches them: nothing here is a score or a ranking,
// only effort handed out, effort finished, and chores left undone, stated honestly.

import { addDays } from "./week";

export const PERIODS = [
  { id: "4", label: "Last 4 weeks", weeks: 4 },
  { id: "12", label: "Last 12 weeks", weeks: 12 },
  { id: "26", label: "Last 6 months", weeks: 26 },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export function parsePeriod(value: unknown): (typeof PERIODS)[number] {
  return PERIODS.find((period) => period.id === value) ?? PERIODS[0];
}

/** First day of a period that ends today. */
export function periodStart(today: string, weeks: number): string {
  return addDays(today, -weeks * 7 + 1);
}

export interface PastAssignment {
  assigneeId: string | null;
  choreName: string;
  effort: number;
  dueOn: string;
  completed: boolean;
}

export interface ChoreTally {
  choreName: string;
  given: number;
  done: number;
}

export interface PersonFairness {
  profileId: string;
  displayName: string;
  /** Effort points of chores that came due in the period. */
  givenEffort: number;
  /** Effort points of those that were finished. */
  doneEffort: number;
  givenCount: number;
  doneCount: number;
  /** Came due before today and not finished. They stay with the person. */
  overdueCount: number;
  byChore: ChoreTally[];
  owedChores: string[];
  /** Days in the period the person was away. They do not count against anyone's share. */
  awayDays: number;
}

export interface AwaySpan {
  profileId: string;
  startsOn: string;
  endsOn: string;
}

/** Days of [start, end] that fall inside any of the spans. */
export function awayDaysWithin(spans: readonly AwaySpan[], start: string, end: string): number {
  const days = new Set<string>();
  for (const span of spans) {
    for (
      let day = span.startsOn > start ? span.startsOn : start;
      day <= end && day <= span.endsOn;
      day = addDays(day, 1)
    ) {
      days.add(day);
    }
  }
  return days.size;
}

/**
 * One entry per current member. Only chores that have already come due (on or before today) and
 * fall inside the period count, so the future does not make anyone look idle.
 */
export function summariseFairness(input: {
  people: readonly { profileId: string; displayName: string }[];
  assignments: readonly PastAssignment[];
  owed: readonly { profileId: string; choreName: string }[];
  away?: readonly AwaySpan[];
  start: string;
  today: string;
}): PersonFairness[] {
  const { people, assignments, owed, start, today } = input;
  const away = input.away ?? [];
  const inPeriod = assignments.filter((a) => a.dueOn >= start && a.dueOn <= today);

  return people.map((person) => {
    const mine = inPeriod.filter((a) => a.assigneeId === person.profileId);
    const tallies = new Map<string, ChoreTally>();
    for (const a of mine) {
      const tally = tallies.get(a.choreName) ?? { choreName: a.choreName, given: 0, done: 0 };
      tally.given += 1;
      if (a.completed) tally.done += 1;
      tallies.set(a.choreName, tally);
    }
    return {
      profileId: person.profileId,
      displayName: person.displayName,
      givenEffort: mine.reduce((sum, a) => sum + a.effort, 0),
      doneEffort: mine.filter((a) => a.completed).reduce((sum, a) => sum + a.effort, 0),
      givenCount: mine.length,
      doneCount: mine.filter((a) => a.completed).length,
      overdueCount: mine.filter((a) => !a.completed && a.dueOn < today).length,
      byChore: [...tallies.values()].sort((x, y) => x.choreName.localeCompare(y.choreName)),
      awayDays: awayDaysWithin(
        away.filter((span) => span.profileId === person.profileId),
        start,
        today,
      ),
      owedChores: owed
        .filter((o) => o.profileId === person.profileId)
        .map((o) => o.choreName)
        .sort(),
    };
  });
}
