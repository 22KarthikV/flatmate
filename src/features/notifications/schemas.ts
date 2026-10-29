const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A notification id from a form, or null when it is not a uuid. */
export function parseNotificationId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** True for a path inside this app. Anything else (other sites, protocol-relative) is refused. */
export function isSafeInternalPath(value: string): boolean {
  return /^\/([^/\\]|$)/.test(value);
}

export const SNOOZE_CHOICES = ["hour", "evening", "tomorrow"] as const;
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number];

export const SNOOZE_LABELS: Record<SnoozeChoice, string> = {
  hour: "In an hour",
  evening: "This evening",
  tomorrow: "Tomorrow morning",
};

export function parseSnoozeChoice(value: unknown): SnoozeChoice | null {
  return SNOOZE_CHOICES.find((choice) => choice === value) ?? null;
}

const EVENING_HOUR = 18;
const MORNING_HOUR = 8;
/** "This evening" is not offered when it is less than this far away. */
const MIN_EVENING_LEAD_MS = 15 * 60_000;

const londonDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function londonOffsetMs(at: Date): number {
  const name = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -minutes : minutes) * 60_000;
}

/** The instant at which London's wall clock reads this date and hour (handles summer time). */
function londonWallClock(year: number, month: number, day: number, hour: number): Date {
  const wall = Date.UTC(year, month - 1, day, hour);
  const first = wall - londonOffsetMs(new Date(wall));
  return new Date(wall - londonOffsetMs(new Date(first)));
}

/** When a snooze ends. "Evening" is 18:00 and "tomorrow" is 08:00, both London time. */
export function snoozeUntil(choice: SnoozeChoice, now: Date): Date {
  if (choice === "hour") return new Date(now.getTime() + 60 * 60_000);
  const [year, month, day] = londonDate.format(now).split("-").map(Number);
  return choice === "evening"
    ? londonWallClock(year, month, day, EVENING_HOUR)
    : londonWallClock(year, month, day + 1, MORNING_HOUR);
}

/** The choices that make sense right now: "this evening" disappears once it is nearly evening. */
export function availableSnoozeChoices(now: Date): SnoozeChoice[] {
  return SNOOZE_CHOICES.filter(
    (choice) =>
      choice !== "evening" ||
      snoozeUntil("evening", now).getTime() - now.getTime() >= MIN_EVENING_LEAD_MS,
  );
}

export interface PreferenceInput {
  type: string;
  inApp: boolean;
  push: boolean;
}

/** A preference form: a known type and two checkboxes (absent means off). Null if the type is bad. */
export function parsePreferenceForm(
  formData: FormData,
  isKnownType: (value: unknown) => boolean,
): PreferenceInput | null {
  const type = formData.get("type");
  if (typeof type !== "string" || !isKnownType(type)) return null;
  return { type, inApp: formData.get("in_app") === "on", push: formData.get("push") === "on" };
}
