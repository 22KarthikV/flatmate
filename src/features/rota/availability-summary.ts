// Pure: turns the availability rows for one week into what the screen shows (SPEC-rota T5).

import { shortDate, weekDates, weekdayName } from "./week";

export interface AvailabilityRow {
  profileId: string;
  onDate: string;
  available: boolean;
  assumed: boolean;
}

export interface DayAnswer {
  date: string;
  /** "Sunday" */
  weekday: string;
  /** "8 Nov" */
  short: string;
  available: boolean;
}

/** One person's seven days. A day with no row counts as around, as the rota treats it. */
export function daysFor(weekStart: string, rows: readonly AvailabilityRow[]): DayAnswer[] {
  const byDate = new Map(rows.map((row) => [row.onDate, row.available]));
  return weekDates(weekStart).map((date) => ({
    date,
    weekday: weekdayName(date),
    short: shortDate(date),
    available: byDate.get(date) ?? true,
  }));
}

export type AnswerStatus = "answered" | "assumed" | "waiting";

/** Whether someone has answered, was filled in as around, or has not answered yet. */
export function statusFor(rows: readonly AvailabilityRow[]): AnswerStatus {
  if (rows.length === 0) return "waiting";
  return rows.every((row) => row.assumed) ? "assumed" : "answered";
}

export interface PersonStatus {
  profileId: string;
  displayName: string;
  status: AnswerStatus;
  /** Days they are away, for the list. */
  awayDays: string[];
}

export function summarise(
  weekStart: string,
  people: readonly { profileId: string; displayName: string }[],
  rows: readonly AvailabilityRow[],
): PersonStatus[] {
  return people.map((person) => {
    const mine = rows.filter((row) => row.profileId === person.profileId);
    return {
      profileId: person.profileId,
      displayName: person.displayName,
      status: statusFor(mine),
      awayDays: daysFor(weekStart, mine)
        .filter((day) => !day.available)
        .map((day) => day.weekday),
    };
  });
}
