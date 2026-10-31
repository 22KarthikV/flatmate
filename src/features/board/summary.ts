import "server-only";

import { getPosts } from "./posts";
import { orderPosts } from "./view";

/** The top pinned post, cut to 80 characters, for a Home line. The Home wiring is a separate change. */
export async function getPinnedPost(): Promise<{ id: string; text: string } | null> {
  const top = orderPosts(await getPosts()).pinned[0];
  if (!top) return null;
  return { id: top.id, text: top.body.length > 80 ? `${top.body.slice(0, 79)}…` : top.body };
}
