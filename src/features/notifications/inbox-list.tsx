import { Card, CardLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";

import { markAllRead, openNotification } from "./actions";
import { formatTime, groupByDay } from "./format";
import type { InboxItem } from "./inbox";

interface InboxListProps {
  items: InboxItem[];
  unread: number;
  /** Passed in so the grouping is the same on every render. */
  now: Date;
}

export function InboxList({ items, unread, now }: InboxListProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardLabel>All quiet</CardLabel>
        <p className="mt-3 text-lg">Nothing here yet.</p>
        <p className="text-muted mt-2 max-w-md text-sm">
          When something happens in your flat, such as a flatmate joining, it will show up here.
        </p>
      </Card>
    );
  }

  const groups = groupByDay(items, now);

  return (
    <div className="flex flex-col gap-8">
      {unread > 0 ? (
        <form action={markAllRead}>
          <button type="submit" className="label-caps min-h-11 underline underline-offset-4">
            Mark all read
          </button>
        </form>
      ) : null}
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`day-${group.key}`}>
          <h2 id={`day-${group.key}`} className="label-caps text-muted">
            {group.label}
          </h2>
          <ul className="border-line mt-3 border-t">
            {group.items.map((item) => (
              <li key={item.id} className="border-line border-b">
                <form action={openNotification}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className={cn(
                      "flex min-h-14 w-full items-start gap-3 py-3 text-left",
                      item.readAt ? "text-muted" : "text-ink",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block", !item.readAt && "font-medium")}>
                        {item.title}
                      </span>
                      {item.body ? <span className="mt-1 block text-sm">{item.body}</span> : null}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 text-sm">
                      <span>{formatTime(item.createdAt)}</span>
                      {item.readAt ? null : (
                        <span className="label-caps text-ink text-[0.625rem]">Unread</span>
                      )}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
