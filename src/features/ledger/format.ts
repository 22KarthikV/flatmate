// Kept free of server-only imports so client components can use it.

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

function parse(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A date-only value as "Fri 30 Oct 2026". It is a calendar day, so no timezone shifts it. */
export function formatDay(iso: string): string {
  const date = parse(iso);
  return date ? dayFormat.format(date).replace(",", "") : iso;
}

export interface MonthGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Groups items (already newest first) by the month of their expense date. */
export function groupByMonth<T extends { occurredOn: string }>(items: T[]): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const item of items) {
    const key = item.occurredOn.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push(item);
    } else {
      const date = parse(`${key}-01`);
      groups.push({ key, label: date ? monthFormat.format(date) : key, items: [item] });
    }
  }
  return groups;
}
