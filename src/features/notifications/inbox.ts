import "server-only";

import { cache } from "react";

import { getRequestSession } from "@/features/identity/session-claims";

export interface InboxItem {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  readAt: string | null;
}

const INBOX_LIMIT = 50;

/** The signed-in person's notifications, newest first. Row-level security limits it to their own. */
export async function getInbox(): Promise<InboxItem[]> {
  const { supabase, claims } = await getRequestSession();
  if (!claims?.sub) return [];

  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, href, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(INBOX_LIMIT);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

/** Unread notifications that are not snoozed. One cheap count, shared by the request. */
export const getUnreadCount = cache(async (): Promise<number> => {
  const { supabase, claims } = await getRequestSession();
  if (!claims?.sub) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`);

  return count ?? 0;
});
