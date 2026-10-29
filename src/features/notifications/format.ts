// Kept free of imports so client components can use it.

const TIME_ZONE = "Europe/London";

/** The bell's badge: nothing at zero, the number up to nine, "9+" above. */
export function formatBadge(unread: number): string | null {
  if (!Number.isFinite(unread) || unread <= 0) return null;
  return unread > 9 ? "9+" : String(Math.floor(unread));
}

const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabel = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const timeOfDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** The London time of day, such as "14:05". */
export function formatTime(iso: string): string {
  return timeOfDay.format(new Date(iso));
}

function previousDay(key: string): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Groups items (already newest first) by London calendar day: Today, Yesterday, then dated. */
export function groupByDay<T extends { createdAt: string }>(items: T[], now: Date): DayGroup<T>[] {
  const today = dayKey.format(now);
  const yesterday = previousDay(today);
  const groups: DayGroup<T>[] = [];

  for (const item of items) {
    const key = dayKey.format(new Date(item.createdAt));
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      const label =
        key === today
          ? "Today"
          : key === yesterday
            ? "Yesterday"
            : dayLabel.format(new Date(`${key}T00:00:00Z`)).replace(",", "");
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
