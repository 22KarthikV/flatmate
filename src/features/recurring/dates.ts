/**
 * Calendar rules for repeating rent and bills (SPEC-recurring R8, R10, R11, R15). Dates are plain
 * "YYYY-MM-DD" strings in the flat's own calendar (Europe/London), never timestamps, so the answer
 * does not depend on the device's time zone. The database repeats these rules in SQL (it runs with
 * nobody present); pgTAP holds both to the same cases.
 */

/** "2026-11-06". */
export type IsoDate = string;

/**
 * What decides when a month appears and when reminders go:
 * rent and fixed bills are created 7 days ahead, variable bills 14 (the payer needs time to read
 * the letter and enter the amount).
 */
export type RecurringShape = "rent" | "fixed" | "variable";

export const DUE_DAY_MIN = 1;
export const DUE_DAY_MAX = 28;
export const ALL_MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const GENERATE_DAYS_AHEAD: Record<RecurringShape, number> = {
  rent: 7,
  fixed: 7,
  variable: 14,
};

const pad = (n: number) => String(n).padStart(2, "0");

function parse(date: IsoDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Whole days since 1970-01-01, by UTC arithmetic (no daylight saving to go wrong). */
function dayNumber(date: IsoDate): number {
  const { year, month, day } = parse(date);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const moved = new Date((dayNumber(date) + days) * 86_400_000);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** Days from `from` to `to`: positive when `to` is later. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from);
}

/** The first of the month a date falls in: the "period" of a month's rent or bill. */
export function periodOf(date: IsoDate): IsoDate {
  const { year, month } = parse(date);
  return `${year}-${pad(month)}-01`;
}

export function addMonths(period: IsoDate, months: number): IsoDate {
  const { year, month } = parse(period);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;
}

/** The month number (1 to 12) of a date or period. */
export function monthOf(date: IsoDate): number {
  return parse(date).month;
}

/** Today in the flats' calendar: what "today" means to a person in London. */
export function londonDate(now: Date): IsoDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Due days run 1 to 28 so every month has one (R10). */
export function isValidDueDay(dueDay: number): boolean {
  return Number.isInteger(dueDay) && dueDay >= DUE_DAY_MIN && dueDay <= DUE_DAY_MAX;
}

/** The due date of the month that starts at `period`. */
export function dueDateFor(period: IsoDate, dueDay: number): IsoDate {
  if (!isValidDueDay(dueDay)) throw new Error(`Due day must be 1 to 28, got ${dueDay}`);
  return `${periodOf(period).slice(0, 8)}${pad(dueDay)}`;
}

/** True when the month a period (or date) falls in is one of the template's active months. */
export function isActiveMonth(period: IsoDate, activeMonths: readonly number[]): boolean {
  return activeMonths.includes(monthOf(period));
}

/** The day a month is created: 7 or 14 days before it is due. */
export function generateOn(dueDate: IsoDate, shape: RecurringShape): IsoDate {
  return addDays(dueDate, -GENERATE_DAYS_AHEAD[shape]);
}

/**
 * The months that should exist on `today` and may not yet: active, already inside their creation
 * window, and not yet past due. A month whose due date has gone is never created (R8: no
 * backfill), so a rent due on the 7th that is set up on the 30th starts with the next 7th. A day
 * the job missed is caught up as long as the month is still due. Oldest first.
 */
export function periodsToGenerate(input: {
  today: IsoDate;
  dueDay: number;
  shape: RecurringShape;
  activeMonths: readonly number[];
}): IsoDate[] {
  const thisMonth = periodOf(input.today);
  // The window is at most 14 days, so only this month or the next can be inside it.
  return [thisMonth, addMonths(thisMonth, 1)].filter((period) => {
    if (!isActiveMonth(period, input.activeMonths)) return false;
    const dueDate = dueDateFor(period, input.dueDay);
    return dueDate >= input.today && generateOn(dueDate, input.shape) <= input.today;
  });
}

/** Who is reminded: someone who owes rent, or the payer of a variable bill that has no amount yet. */
export type ReminderKind = "rent" | "variable";

/** Days before the due date (0 is the day itself) on which a reminder goes, then daily after (R15). */
export const REMINDER_DAYS_BEFORE: Record<ReminderKind, readonly number[]> = {
  rent: [7, 3, 2, 1, 0],
  variable: [14, 7, 3, 1, 0],
};

export function isReminderDay(input: {
  today: IsoDate;
  dueDate: IsoDate;
  kind: ReminderKind;
}): boolean {
  const daysBefore = daysBetween(input.today, input.dueDate);
  return daysBefore < 0 || REMINDER_DAYS_BEFORE[input.kind].includes(daysBefore);
}

/** Every reminder day from the first to `lastDay`, for tests and for showing "next reminder". */
export function reminderDates(dueDate: IsoDate, kind: ReminderKind, lastDay: IsoDate): IsoDate[] {
  const dates = REMINDER_DAYS_BEFORE[kind].map((before) => addDays(dueDate, -before)).sort();
  for (let day = addDays(dueDate, 1); day <= lastDay; day = addDays(day, 1)) dates.push(day);
  return dates.filter((date) => date <= lastDay);
}
