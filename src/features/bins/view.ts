import {
  addDays,
  collectionsBetween,
  dayNumber,
  type BinException,
  type BinStream,
  type Collection,
} from "./collections";

export const LOOK_AHEAD_DAYS = 42;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Tomorrow" or "Tuesday 10 Nov": a word, never colour, marks the near days. */
export function dayWord(date: string, today: string): string {
  const difference = dayNumber(date) - dayNumber(today);
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export interface DayGroup {
  date: string;
  items: Collection[];
}

export function groupByDate(collections: Collection[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of collections) {
    const last = groups.at(-1);
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}

/** The next six weeks of collections, today included. */
export function nextCollections(
  streams: BinStream[],
  exceptions: BinException[],
  today: string,
): Collection[] {
  return collectionsBetween(streams, exceptions, today, addDays(today, LOOK_AHEAD_DAYS));
}
