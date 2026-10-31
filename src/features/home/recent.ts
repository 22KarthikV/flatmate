// Pure: the last few notifications, newest first.

export const RECENT_COUNT = 5;

export interface RecentItem {
  id: string;
  title: string;
  href: string;
  unread: boolean;
}

export function recentItems(
  inbox: readonly {
    id: string;
    title: string;
    href: string;
    createdAt: string;
    readAt: string | null;
  }[],
): RecentItem[] {
  return [...inbox]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_COUNT)
    .map((n) => ({ id: n.id, title: n.title, href: n.href, unread: n.readAt === null }));
}
