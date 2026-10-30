// Pure date helpers for the rota (SPEC-rota T2, T5). Weeks run Sunday to Saturday. A day is a
// yyyy-mm-dd string, a London calendar date: it is never a timestamp at midnight, so the clocks
// changing cannot move a chore to the wrong day. Only the availability deadline is an instant, and
// it is worked out from London wall-clock time.

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const TIME_ZONE = "Europe/London";
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(date: string): number {
  const match = DATE.exec(date);
  if (!match) throw new Error(`Not a date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function dayOfWeek(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function isSunday(date: string): boolean {
  return dayOfWeek(date) === 0;
}

/** The Sunday on or before a date: the week's identity (SPEC-rota T2). */
export function weekStartOf(date: string): string {
  return addDays(date, -dayOfWeek(date));
}

/** The seven dates of a week, Sunday first. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "8 Nov", for labels. */
export function shortDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[dayOfWeek(date)]!;
}

export interface LondonParts {
  date: string;
  hour: number;
  minute: number;
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** What the clock and calendar in London read at an instant. */
export function londonParts(instant: Date): LondonParts {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function londonDate(instant: Date): string {
  return londonParts(instant).date;
}

/** The instant at which London's wall clock reads `hour:minute` on `date`. */
export function londonWallTime(date: string, hour: number, minute = 0): Date {
  const base = toUtc(date) + (hour * 60 + minute) * 60_000;
  // London is UTC+0 or UTC+1, so one of these two instants reads the wanted time.
  for (const offsetMinutes of [0, 60]) {
    const instant = new Date(base - offsetMinutes * 60_000);
    const read = londonParts(instant);
    if (read.date === date && read.hour === hour && read.minute === minute) return instant;
  }
  // A time that does not exist (the hour the clocks go forward): the first instant after it.
  return new Date(base - 60 * 60_000);
}

/** The deadline is the Saturday before the week starts, at 6pm in London (SPEC-rota T5). */
export const DEADLINE_HOUR = 18;

/** When the window for a week's availability closes. */
export function availabilityDeadline(weekStart: string): Date {
  return londonWallTime(addDays(weekStart, -1), DEADLINE_HOUR);
}

/** When the window opens: midnight at the start of the Sunday a week ahead. */
export function availabilityOpensAt(weekStart: string): Date {
  return londonWallTime(addDays(weekStart, -7), 0);
}

export type WindowState = "not_open" | "open" | "closed";

export function windowState(now: Date, weekStart: string): WindowState {
  if (now < availabilityOpensAt(weekStart)) return "not_open";
  if (now < availabilityDeadline(weekStart)) return "open";
  return "closed";
}

/** The week people are being asked about: the one that starts on the next Sunday. */
export function upcomingWeekStart(now: Date): string {
  return addDays(weekStartOf(londonDate(now)), 7);
}

/** The week that contains the moment. */
export function currentWeekStart(now: Date): string {
  return weekStartOf(londonDate(now));
}

/** The two nudges: three days before the close, and the morning of the close, both 9am London. */
export function nudgeTimes(weekStart: string): { first: Date; last: Date } {
  return {
    first: londonWallTime(addDays(weekStart, -4), 9),
    last: londonWallTime(addDays(weekStart, -1), 9),
  };
}

/** The deadline in plain words, the one sentence every nudge and the screen use. */
export const DEADLINE_SENTENCE =
  "Answer by Saturday 6pm. If you do not, you will be treated as available every day this week and can be given any chore.";
