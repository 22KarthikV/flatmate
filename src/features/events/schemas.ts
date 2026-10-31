// Kept free of server-only imports. The form and the server action read an event the same way; the
// database checks it again, so this is for clear messages, not for trust.

import { londonWallTime } from "@/features/rota/week";

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 500;
export const LOCATION_MAX = 100;
export const REASON_MAX = 100;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 8;
export const OPEN_EVENTS_MAX = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id from a URL or a form, or null when it is not a uuid. */
export function parseEventId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export type VoteAnswer = "yes" | "maybe" | "no";

export function parseAnswer(value: unknown): VoteAnswer | null | undefined {
  if (value === "yes" || value === "maybe" || value === "no") return value;
  if (value === "" || value === "clear") return null;
  return undefined;
}

/** What the form holds, as text. Dates and times are London wall-clock, as a phone shows them. */
export interface RawEvent {
  title: string;
  description: string;
  location: string;
  dates: { start: string; end: string }[];
  /** `YYYY-MM-DDTHH:mm`, London time. */
  deadline: string;
}

export interface EventInput {
  title: string;
  description: string;
  location: string | null;
  options: { startsAt: string; endsAt: string | null }[];
  deadline: string;
}

export type ParsedEvent = { ok: true; value: EventInput } | { ok: false; message: string };

const LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/** A `datetime-local` value read as London time, or null when it is not one. */
export function londonLocalToInstant(value: string): Date | null {
  const match = LOCAL.exec(value.trim());
  if (!match) return null;
  const [, date, hour, minute] = match;
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59 || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  return londonWallTime(date!, h, m);
}

function fail(message: string): ParsedEvent {
  return { ok: false, message };
}

export function parseTextFields(
  raw: Pick<RawEvent, "title" | "description" | "location">,
):
  | { ok: true; value: { title: string; description: string; location: string | null } }
  | { ok: false; message: string } {
  const title = raw.title.trim();
  const description = raw.description.trim();
  const location = raw.location.trim();
  if (title.length === 0) return { ok: false, message: "Give the event a title." };
  if (title.length > TITLE_MAX) {
    return { ok: false, message: `Use ${TITLE_MAX} characters or fewer for the title.` };
  }
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      message: `Use ${DESCRIPTION_MAX} characters or fewer for the description.`,
    };
  }
  if (location.length > LOCATION_MAX) {
    return { ok: false, message: `Use ${LOCATION_MAX} characters or fewer for the place.` };
  }
  return { ok: true, value: { title, description, location: location || null } };
}

/** One date's start and optional end, as instants. Null with a message when it is not usable. */
export function parseOption(
  start: string,
  end: string,
  now: Date,
): { ok: true; startsAt: Date; endsAt: Date | null } | { ok: false; message: string } {
  const startsAt = londonLocalToInstant(start);
  if (!startsAt) return { ok: false, message: "Choose a date and time for every option." };
  if (startsAt <= now) return { ok: false, message: "Every date must be in the future." };
  if (end.trim() === "") return { ok: true, startsAt, endsAt: null };
  const endsAt = londonLocalToInstant(end);
  if (!endsAt) return { ok: false, message: "That end time is not a date and time." };
  if (endsAt <= startsAt) return { ok: false, message: "An end time must come after its start." };
  return { ok: true, startsAt, endsAt };
}

/** The default close for voting: three days out, or a day before the first date if that is sooner. */
export function defaultDeadline(now: Date, earliest: Date | null): Date {
  const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  if (!earliest) return threeDays;
  const dayBefore = new Date(earliest.getTime() - 24 * 60 * 60 * 1000);
  const chosen = dayBefore < threeDays ? dayBefore : threeDays;
  return chosen > now ? chosen : new Date(now.getTime() + 60 * 60 * 1000);
}

export function parseEventForm(raw: RawEvent, now: Date): ParsedEvent {
  const text = parseTextFields(raw);
  if (!text.ok) return fail(text.message);

  const filled = raw.dates.filter((date) => date.start.trim() !== "");
  if (filled.length < OPTIONS_MIN) return fail("Offer at least two dates.");
  if (filled.length > OPTIONS_MAX) return fail(`Offer up to ${OPTIONS_MAX} dates.`);

  const options: { startsAt: Date; endsAt: Date | null }[] = [];
  for (const date of filled) {
    const parsed = parseOption(date.start, date.end, now);
    if (!parsed.ok) return fail(parsed.message);
    options.push({ startsAt: parsed.startsAt, endsAt: parsed.endsAt });
  }
  const times = options.map((option) => option.startsAt.getTime());
  if (new Set(times).size !== times.length) return fail("Each date needs a different time.");

  const deadline = londonLocalToInstant(raw.deadline);
  if (!deadline) return fail("Choose when voting closes.");
  if (deadline <= now) return fail("Voting must close in the future.");
  const earliest = Math.min(...times);
  if (deadline.getTime() >= earliest) return fail("Voting must close before the first date.");

  return {
    ok: true,
    value: {
      ...text.value,
      options: options.map((option) => ({
        startsAt: option.startsAt.toISOString(),
        endsAt: option.endsAt ? option.endsAt.toISOString() : null,
      })),
      deadline: deadline.toISOString(),
    },
  };
}

export function rawEventFromFormData(formData: FormData): RawEvent {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const starts = formData.getAll("start").map((value) => (typeof value === "string" ? value : ""));
  const ends = formData.getAll("end").map((value) => (typeof value === "string" ? value : ""));
  return {
    title: text("title"),
    description: text("description"),
    location: text("location"),
    dates: starts.map((start, index) => ({ start, end: ends[index] ?? "" })),
    deadline: text("deadline"),
  };
}
