import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { AssignmentView, WeekView } from "./week-model";

const ASSIGNMENT_COLUMNS = `
  id, chore_name, effort, assignee, due_on, explanation, completed_at, needs_signoff,
  signed_off_by, reopened_at, superseded_at,
  person:profiles!chore_assignments_assignee_fkey(display_name),
  items:assignment_items(id, position, text, done_at, done_by)
`;

type Row = {
  id: string;
  chore_name: string;
  effort: number;
  assignee: string | null;
  due_on: string;
  explanation: string;
  completed_at: string | null;
  needs_signoff: boolean;
  signed_off_by: string | null;
  reopened_at: string | null;
  person: { display_name: string } | null;
  items: {
    id: string;
    position: number;
    text: string;
    done_at: string | null;
    done_by: string | null;
  }[];
};

export function toAssignmentView(row: Row): AssignmentView {
  return {
    id: row.id,
    choreName: row.chore_name,
    effort: row.effort,
    assigneeId: row.assignee,
    assigneeName: row.person?.display_name ?? null,
    dueOn: row.due_on,
    explanation: row.explanation,
    completedAt: row.completed_at,
    needsSignoff: row.needs_signoff,
    signedOffBy: row.signed_off_by,
    reopenedAt: row.reopened_at,
    items: [...row.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        text: item.text,
        doneAt: item.done_at,
        doneBy: item.done_by,
      })),
  };
}

/** The current rota for each of the given weeks, in one query. Weeks with no rota yet are left out. */
export async function getWeeks(weekStarts: string[]): Promise<WeekView[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("rota_weeks")
    .select(
      `id, week_start, revision, reason, assignments:chore_assignments(${ASSIGNMENT_COLUMNS})`,
    )
    .in("week_start", weekStarts)
    .is("superseded_at", null)
    .order("week_start");

  return (data ?? []).map((week) => ({
    id: week.id,
    weekStart: week.week_start,
    revision: week.revision,
    reason: week.reason,
    assignments: (week.assignments as unknown as (Row & { superseded_at: string | null })[])
      .filter((row) => row.superseded_at === null)
      .map(toAssignmentView),
  }));
}

export interface AssignmentDetail {
  assignment: AssignmentView;
  /** False when a rebuild or swap has replaced it: it can be read but not ticked. */
  current: boolean;
  weekStart: string;
}

/** One assignment with its checklist, or null when it is not in the caller's flat. */
export async function getAssignment(id: string): Promise<AssignmentDetail | null> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("chore_assignments")
    .select(`${ASSIGNMENT_COLUMNS}, week:rota_weeks!inner(week_start, superseded_at)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Row & {
    superseded_at: string | null;
    week: { week_start: string; superseded_at: string | null };
  };
  return {
    assignment: toAssignmentView(row),
    current: row.superseded_at === null && row.week.superseded_at === null,
    weekStart: row.week.week_start,
  };
}
