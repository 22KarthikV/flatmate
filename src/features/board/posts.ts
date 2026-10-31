import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { BoardPost } from "./view";

/** The flat's live posts. The row-level policy already hides deleted and expired ones. */
export async function getPosts(): Promise<BoardPost[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("board_posts")
    .select(
      "id, body, author_id, created_at, pinned_at, expires_at, author:profiles!board_posts_author_id_fkey(display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    authorId: row.author_id,
    authorName: row.author?.display_name ?? "Someone",
    createdAt: row.created_at,
    pinned: row.pinned_at !== null,
    expiresAt: row.expires_at,
  }));
}
