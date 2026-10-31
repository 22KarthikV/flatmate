// Dates and times for events, always in London time (SPEC-events S9). No server-only imports.

const ZONE = "Europe/London";

function parts(date: Date): Record<string, string> {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(formatted.map((part) => [part.type, part.value]));
}

/** "Fri 6 Nov, 19:30". */
export function eventWhen(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** "Fri 6 Nov, 19:30 to 22:00", or the end's own date when it is another day. */
export function eventRange(startIso: string, endIso: string | null): string {
  if (!endIso) return eventWhen(startIso);
  const s = parts(new Date(startIso));
  const e = parts(new Date(endIso));
  const sameDay = s.day === e.day && s.month === e.month && s.year === e.year;
  return sameDay
    ? `${eventWhen(startIso)} to ${e.hour}:${e.minute}`
    : `${eventWhen(startIso)} to ${eventWhen(endIso)}`;
}

/** "Wed 4 Nov" for a deadline's day. */
export function eventDay(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "Voting closes in 2 days", "in 5 hours", "in under an hour", or "Voting has closed". */
export function closesText(deadlineIso: string, now: Date): string {
  const ms = new Date(deadlineIso).getTime() - now.getTime();
  if (ms <= 0) return "Voting has closed";
  const hours = ms / 3_600_000;
  if (hours < 1) return "Voting closes in under an hour";
  if (hours < 24) {
    const whole = Math.floor(hours);
    return `Voting closes in ${whole} ${whole === 1 ? "hour" : "hours"}`;
  }
  const days = Math.floor(hours / 24);
  return `Voting closes in ${days} ${days === 1 ? "day" : "days"}`;
}

/** `YYYY-MM-DDTHH:mm` in London, the value a datetime-local input holds. */
export function toLocalInput(date: Date): string {
  const p = parts(date);
  const month = String(
    new Date(`${p.day} ${p.month} ${p.year} 12:00 UTC`).getUTCMonth() + 1,
  ).padStart(2, "0");
  return `${p.year}-${month}-${p.day!.padStart(2, "0")}T${p.hour}:${p.minute}`;
}
