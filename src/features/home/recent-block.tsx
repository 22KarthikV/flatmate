import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { getInbox } from "@/features/notifications/inbox";

import { HomeBlock } from "./home-block";
import { recentItems, type RecentItem } from "./recent";

async function loadRecent(): Promise<RecentItem[]> {
  return recentItems(await getInbox());
}

export function RecentList({ items }: { items: RecentItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card aria-labelledby="home-recent">
      <CardLabel id="home-recent">Recent in the flat</CardLabel>
      <ul className="mt-3 flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="border-line flex min-h-11 items-center gap-2 border-t py-3 underline-offset-4 first:border-t-0 hover:underline"
            >
              {item.unread ? <span className="label-caps">New</span> : null}
              <span>{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/notifications"
        className="label-caps text-muted mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
      >
        All notifications
      </Link>
    </Card>
  );
}

/** The last five notifications, newest first. Hidden when there are none. */
export function Recent() {
  return (
    <HomeBlock name="recent" load={loadRecent}>
      {(items) => <RecentList items={items} />}
    </HomeBlock>
  );
}
