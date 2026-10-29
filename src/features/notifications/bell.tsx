import { BellLink } from "./bell-link";
import { getUnreadCount } from "./inbox";

/** The bell with this person's unread count. Reads the session, so render it inside Suspense. */
export async function NotificationBell() {
  return <BellLink unread={await getUnreadCount()} />;
}
