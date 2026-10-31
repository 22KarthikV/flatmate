import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";
import { logger } from "@/lib/logger";

import {
  buildOverdue,
  OVERDUE_WEEKS,
  type CoverCandidate,
  type OverdueItem,
  type OverdueRow,
} from "./overdue-model";
import { addDays } from "./week";

/**
 * Unfinished chores from the last few weeks that are still open (not finished, covered or excused),
 * for the viewer, or for everyone when the viewer is an admin. Row-level security limits it to the flat.
 */
export async function getOverdue(
  thisWeek: string,
  viewerId: string,
  isAdmin: boolean,
): Promise<OverdueItem[]> {
  const { supabase } = await getRequestSession();
  const [past, ahead] = await Promise.all([
    supabase
      .from("chore_assignments")
      .select(
        "id, chore_id, chore_name, effort, assignee, due_on, person:profiles!chore_assignments_assignee_fkey(display_name), week:rota_weeks!inner(superseded_at)",
      )
      .is("superseded_at", null)
      .is("completed_at", null)
      .is("covered_at", null)
      .is("excused_at", null)
      .not("assignee", "is", null)
      .is("week.superseded_at", null)
      .lt("due_on", thisWeek)
      .gte("due_on", addDays(thisWeek, -7 * OVERDUE_WEEKS)),
    supabase
      .from("chore_assignments")
      .select("id, chore_id, assignee, due_on")
      .is("superseded_at", null)
      .is("covered_at", null)
      .not("assignee", "is", null)
      .gte("due_on", thisWeek),
  ]);

  if (past.error || ahead.error)
    logger.error("rota.overdue_failed", { error: past.error ?? ahead.error });

  const rows: OverdueRow[] = (past.data ?? []).map((row) => ({
    id: row.id,
    choreId: row.chore_id,
    choreName: row.chore_name,
    effort: row.effort,
    assigneeId: row.assignee!,
    assigneeName: row.person?.display_name ?? "Someone",
    dueOn: row.due_on,
  }));
  const candidates: CoverCandidate[] = (ahead.data ?? []).map((row) => ({
    id: row.id,
    choreId: row.chore_id,
    assigneeId: row.assignee!,
    dueOn: row.due_on,
  }));
  return buildOverdue(rows, candidates, viewerId, isAdmin);
}
