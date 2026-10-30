import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { PastAssignment } from "./fairness-view";

/**
 * The flat's assignments that came due from `start` to `today`, from current revisions only (a
 * replaced assignment is not double counted). Row-level security limits it to the caller's flat.
 */
export async function getPastAssignments(start: string, today: string): Promise<PastAssignment[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("chore_assignments")
    .select(
      "assignee, chore_name, effort, due_on, completed_at, week:rota_weeks!inner(superseded_at)",
    )
    .is("superseded_at", null)
    .is("week.superseded_at", null)
    .gte("due_on", start)
    .lte("due_on", today);

  return (data ?? []).map((row) => ({
    assigneeId: row.assignee,
    choreName: row.chore_name,
    effort: row.effort,
    dueOn: row.due_on,
    completed: row.completed_at !== null,
  }));
}

/** Who is next in line for which chore because they were passed over. */
export async function getOwedTurns(): Promise<{ profileId: string; choreName: string }[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("rotation_state")
    .select("profile_id, chore:chores(name)")
    .gt("owed_turns", 0);

  return (data ?? []).flatMap((row) =>
    row.chore ? [{ profileId: row.profile_id, choreName: row.chore.name }] : [],
  );
}
