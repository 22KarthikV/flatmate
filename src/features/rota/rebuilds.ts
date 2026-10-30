import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

export interface RecentRebuild {
  id: string;
  leaverName: string;
  moved: number;
  unassigned: number;
  /** When an admin can no longer undo it. */
  undoUntil: string;
}

/** Rebuilds applied in the last 24 hours that an admin can still undo (row-level security limits them to the flat). */
export async function getUndoableRebuilds(): Promise<RecentRebuild[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("rota_rebuilds")
    .select(
      "id, unassigned, undo_until, leaver:profiles!rota_rebuilds_left_profile_fkey(display_name), moves:rota_rebuild_moves(count)",
    )
    .eq("status", "applied")
    .gt("undo_until", new Date().toISOString())
    .order("applied_at", { ascending: false });

  return (data ?? []).flatMap((row) =>
    row.undo_until
      ? [
          {
            id: row.id,
            leaverName: row.leaver?.display_name ?? "Someone",
            moved: row.moves?.[0]?.count ?? 0,
            unassigned: row.unassigned,
            undoUntil: row.undo_until,
          },
        ]
      : [],
  );
}
