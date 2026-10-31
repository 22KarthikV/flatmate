// Pure wording and ordering for the board. London days, so summer time cannot shift a label.

export interface BoardPost {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  pinned: boolean;
  expiresAt: string | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function londonDay(iso: string): { key: number; weekday: number; date: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const utc = Date.UTC(get("year"), get("month") - 1, get("day"));
  return {
    key: Math.round(utc / 86_400_000),
    weekday: new Date(utc).getUTCDay(),
    date: get("day"),
    month: get("month") - 1,
  };
}

/** Pinned posts first, then the rest newest first. */
export function orderPosts(posts: BoardPost[]): { pinned: BoardPost[]; recent: BoardPost[] } {
  const newestFirst = (a: BoardPost, b: BoardPost) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  return {
    pinned: posts.filter((p) => p.pinned).sort(newestFirst),
    recent: posts.filter((p) => !p.pinned).sort(newestFirst),
  };
}

/** "disappears today", "disappears Thursday" (within a week), "disappears 20 Nov", or "stays up". */
export function disappearsLabel(expiresAt: string | null, now: string): string {
  if (!expiresAt) return "stays up";
  const when = londonDay(expiresAt);
  const difference = when.key - londonDay(now).key;
  if (difference <= 0) return "disappears today";
  if (difference < 7) return `disappears ${WEEKDAYS[when.weekday]}`;
  return `disappears ${when.date} ${MONTHS[when.month]}`;
}

/** "just now", "3 hours ago", "yesterday", "2 days ago". */
export function ageText(createdAt: string, now: string): string {
  const minutes = Math.floor((Date.parse(now) - Date.parse(createdAt)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = londonDay(now).key - londonDay(createdAt).key;
  if (days <= 1) return "yesterday";
  return `${days} days ago`;
}
