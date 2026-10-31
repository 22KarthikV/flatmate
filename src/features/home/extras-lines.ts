// Pure: the short lines for the home page's Events and Extras cards. Titles and counts only, never
// an amount.

import { eventWhen } from "@/features/events/format";

export interface HomeLine {
  key: string;
  text: string;
  href: string;
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export interface EventSummary {
  id: string;
  title: string;
  status: "voting" | "tiebreak" | "confirmed" | "cancelled";
  needsMyVote: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

/** "2 events to vote on" and "Next: Quiz night, Fri 6 Nov, 19:30". */
export function eventLines(events: readonly EventSummary[], now: Date): HomeLine[] {
  const lines: HomeLine[] = [];
  const toVote = events.filter((e) => e.status === "voting" && e.needsMyVote).length;
  if (toVote > 0) {
    lines.push({
      key: "events-vote",
      text: `${toVote} event${toVote === 1 ? "" : "s"} to vote on`,
      href: "/events",
    });
  }
  const next = events
    .filter(
      (e) => e.status === "confirmed" && e.startsAt && new Date(e.endsAt ?? e.startsAt) >= now,
    )
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))[0];
  if (next) {
    lines.push({
      key: "events-next",
      text: `Next: ${next.title}, ${eventWhen(next.startsAt!)}`,
      href: `/events/${next.id}`,
    });
  }
  return lines;
}

function londonHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value,
  );
}

export interface ExtrasInput {
  shoppingOpen: number;
  /** Names of the bins collected tomorrow. */
  binsTomorrow: readonly string[];
  /** Unfinished problems that are this person's to watch, or null when none. */
  fixCount: number | null;
  /** The top pinned post, already cut short, or null. */
  pinned: string | null;
}

export function extrasLines(input: ExtrasInput, now: Date): HomeLine[] {
  const lines: HomeLine[] = [];
  if (input.shoppingOpen > 0) {
    lines.push({
      key: "shopping",
      text: `${input.shoppingOpen} thing${input.shoppingOpen === 1 ? "" : "s"} on the shopping list`,
      href: "/more/shopping",
    });
  }
  if (input.binsTomorrow.length > 0) {
    const names = joinNames(input.binsTomorrow);
    lines.push({
      key: "bins",
      text: londonHour(now) >= 17 ? `Tonight: ${names} out` : `Tomorrow: ${names}`,
      href: "/more/bins",
    });
  }
  if (input.fixCount !== null && input.fixCount > 0) {
    lines.push({
      key: "fixes",
      text: `${input.fixCount} problem${input.fixCount === 1 ? "" : "s"} still open`,
      href: "/more/fixes",
    });
  }
  if (input.pinned) {
    lines.push({ key: "pinned", text: `Pinned: ${input.pinned}`, href: "/more/board" });
  }
  return lines;
}
