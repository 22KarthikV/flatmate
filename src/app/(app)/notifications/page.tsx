import { Suspense } from "react";

import { getInbox, getUnreadCount } from "@/features/notifications/inbox";
import { InboxList } from "@/features/notifications/inbox-list";

export const metadata = { title: "Notifications | FlatMate" };

async function InboxContent() {
  const [items, unread] = await Promise.all([getInbox(), getUnreadCount()]);
  return <InboxList items={items} unread={unread} now={new Date()} />;
}

export default function NotificationsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Inbox</p>
        <h1 className="font-display text-5xl sm:text-6xl">Notifications</h1>
      </header>
      <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
        <InboxContent />
      </Suspense>
    </div>
  );
}
