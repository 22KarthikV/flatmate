// The shared calendar's model (SPEC-events, "The shared calendar"). Pure and free of server-only
// imports. Privacy is the point of this file: the output types have no amount field at all, every
// item is built field by field (never spread from an input), rent arrives as a bare list of the
// viewer's own due dates, and chores are filtered to the viewer's own.

import { addDays, londonDate, londonParts, weekStartOf } from "@/features/rota/week";

export type CalendarKind = "event" | "chore" | "bill" | "rent" | "deadline";

/** The word shown with every item, so meaning never rests on colour alone. */
export const KIND_WORDS: Record<CalendarKind, string> = {
  event: "Event",
  chore: "Your chore",
  bill: "Bill due",
  rent: "Rent",
  deadline: "Rota",
};

const KIND_ORDER: Record<CalendarKind, number> = {
  deadline: 0,
  rent: 1,
  bill: 2,
  chore: 3,
  event: 4,
};

export interface CalendarEventInput {
  id: string;
  title: string;
  location: string | null;
  status: "voting" | "tiebreak" | "confirmed" | "cancelled";
  /** ISO instant, set once confirmed. */
  startsAt: string | null;
}

/** The viewer's chores only; the model drops any row that is not assigned to `viewerId`. */
export interface CalendarChoreInput {
  id: string;
  choreName: string;
  dueOn: string;
  assigneeId: string | null;
  completedAt: string | null;
}

/** A bill month. Only these fields are read; a bigger object passed in has the rest ignored. */
export interface CalendarBillInput {
  id: string;
  name: string;
  dueOn: string;
  status: string;
  voided: boolean;
}

export interface CalendarInput {
  /** yyyy-mm-dd London dates, both ends included. */
  range: { from: string; to: string };
  viewerId: string;
  events: readonly CalendarEventInput[];
  chores: readonly CalendarChoreInput[];
  bills: readonly CalendarBillInput[];
  /** The viewer's own rent due dates (yyyy-mm-dd). Dates only: no person, no amount, no status. */
  ownRentDueDates: readonly string[];
  /** ISO instants when rota availability closes. */
  rotaDeadlines: readonly string[];
}

export interface CalendarItem {
  key: string;
  kind: CalendarKind;
  /** The word label for the kind. */
  label: string;
  title: string;
  /** "19:30" in London, or null for items that belong to the whole day. */
  time: string | null;
  place: string | null;
  note: string | null;
  href: string;
}

export interface CalendarDay {
  /** yyyy-mm-dd, a London day. */
  date: string;
  items: CalendarItem[];
}

export interface DecidingEvent {
  id: string;
  title: string;
  href: string;
}

export interface CalendarModel {
  range: { from: string; to: string };
  days: CalendarDay[];
  deciding: DecidingEvent[];
  /** True when the range has nothing planned at all. */
  empty: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

function clock(instant: Date): string {
  const { hour, minute } = londonParts(instant);
  return `${pad(hour)}:${pad(minute)}`;
}

export function buildCalendar(input: CalendarInput): CalendarModel {
  const { from, to } = input.range;
  const inRange = (date: string) => date >= from && date <= to;
  const items = new Map<string, CalendarItem & { date: string }>();
  const add = (item: CalendarItem & { date: string }) => {
    if (inRange(item.date) && !items.has(item.key)) items.set(item.key, item);
  };

  for (const event of input.events) {
    if (event.status !== "confirmed" || !event.startsAt) continue;
    const start = new Date(event.startsAt);
    add({
      key: `event-${event.id}`,
      kind: "event",
      label: KIND_WORDS.event,
      title: event.title,
      date: londonDate(start),
      time: clock(start),
      place: event.location,
      note: null,
      href: `/events/${event.id}`,
    });
  }

  for (const chore of input.chores) {
    if (chore.assigneeId !== input.viewerId) continue;
    add({
      key: `chore-${chore.id}`,
      kind: "chore",
      label: KIND_WORDS.chore,
      title: chore.choreName,
      date: chore.dueOn,
      time: null,
      place: null,
      note: chore.completedAt ? "Done" : null,
      href: `/rota/assignments/${chore.id}`,
    });
  }

  for (const bill of input.bills) {
    if (bill.status === "skipped" || bill.voided) continue;
    add({
      key: `bill-${bill.id}`,
      kind: "bill",
      label: KIND_WORDS.bill,
      title: bill.name,
      date: bill.dueOn,
      time: null,
      place: null,
      note: null,
      href: "/money/recurring/months",
    });
  }

  for (const dueOn of input.ownRentDueDates) {
    add({
      key: `rent-${dueOn}`,
      kind: "rent",
      label: KIND_WORDS.rent,
      title: "Your rent is due",
      date: dueOn,
      time: null,
      place: null,
      note: null,
      href: "/money/rent",
    });
  }

  for (const iso of input.rotaDeadlines) {
    const at = new Date(iso);
    const date = londonDate(at);
    add({
      key: `deadline-${date}`,
      kind: "deadline",
      label: KIND_WORDS.deadline,
      title: "Rota availability closes",
      date,
      time: clock(at),
      place: null,
      note: null,
      href: "/rota/availability",
    });
  }

  const byDay = new Map<string, CalendarItem[]>();
  for (const { date, ...item } of items.values()) {
    byDay.set(date, [...(byDay.get(date) ?? []), item]);
  }
  const days: CalendarDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      items: list.sort(
        (a, b) =>
          (a.time ?? "").localeCompare(b.time ?? "") ||
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          a.key.localeCompare(b.key),
      ),
    }));

  const seen = new Set<string>();
  const deciding: DecidingEvent[] = [];
  for (const event of input.events) {
    if ((event.status !== "voting" && event.status !== "tiebreak") || seen.has(event.id)) continue;
    seen.add(event.id);
    deciding.push({ id: event.id, title: event.title, href: `/events/${event.id}` });
  }

  return { range: input.range, days, deciding, empty: days.length === 0 };
}

// --- Ranges and the ?month=YYYY-MM parameter -------------------------------------------------

export const DEFAULT_RANGE_DAYS = 8 * 7;

const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface Month {
  year: number;
  month: number;
}

/** Strict YYYY-MM. Anything else (including a year outside 2000 to 2100) is ignored. */
export function parseMonthParam(value: unknown): Month | null {
  if (typeof value !== "string") return null;
  const match = MONTH_PARAM.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return null;
  return { year, month: Number(match[2]) };
}

export function monthParam({ year, month }: Month): string {
  return `${year}-${pad(month)}`;
}

export function shiftMonth({ year, month }: Month, by: number): Month {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel({ year, month }: Month): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function monthOf(date: string): Month {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/** First to last day of a month. */
export function monthRange({ year, month }: Month): { from: string; to: string } {
  const from = `${year}-${pad(month)}-01`;
  const next = shiftMonth({ year, month }, 1);
  return { from, to: addDays(`${next.year}-${pad(next.month)}-01`, -1) };
}

/** Today and the next eight weeks. */
export function defaultRange(now: Date): { from: string; to: string } {
  const from = londonDate(now);
  return { from, to: addDays(from, DEFAULT_RANGE_DAYS - 1) };
}

export interface CalendarNav {
  title: string;
  earlier: { label: string; href: string };
  later: { label: string; href: string };
  /** Only on a month view: back to the next eight weeks. */
  reset: { label: string; href: string } | null;
}

const BASE = "/events/calendar";
const linkFor = (month: Month) => ({
  label: monthLabel(month),
  href: `${BASE}?month=${monthParam(month)}`,
});

/** The title and earlier or later links for the view being shown. */
export function calendarNav(now: Date, requested: Month | null): CalendarNav {
  if (requested) {
    return {
      title: monthLabel(requested),
      earlier: linkFor(shiftMonth(requested, -1)),
      later: linkFor(shiftMonth(requested, 1)),
      reset: { label: "Next 8 weeks", href: BASE },
    };
  }
  const range = defaultRange(now);
  return {
    title: "Next 8 weeks",
    earlier: linkFor(monthOf(range.from)),
    later: linkFor(shiftMonth(monthOf(range.to), 1)),
    reset: null,
  };
}

/** Sundays of the weeks that hold a day of the range, for reading the rota. */
export function weekStartsIn(range: { from: string; to: string }): string[] {
  const starts: string[] = [];
  for (let day = weekStartOf(range.from); day <= range.to; day = addDays(day, 7)) starts.push(day);
  return starts;
}
