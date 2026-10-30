// Pure: shapes a week of assignments for the screens (SPEC-rota FR-RT-3, T14). No clock; the caller
// passes today's London date.

import { addDays, daysBetween, shortDate, weekdayName } from "./week";

export interface ItemView {
  id: string;
  position: number;
  text: string;
  doneAt: string | null;
  doneBy: string | null;
}

export interface AssignmentView {
  id: string;
  choreName: string;
  effort: number;
  assigneeId: string | null;
  assigneeName: string | null;
  dueOn: string;
  explanation: string;
  completedAt: string | null;
  needsSignoff: boolean;
  signedOffBy: string | null;
  reopenedAt: string | null;
  items: ItemView[];
}

export interface WeekView {
  id: string;
  weekStart: string;
  revision: number;
  reason: string;
  assignments: AssignmentView[];
}

export type Status = "done" | "overdue" | "today" | "upcoming" | "unassigned";

export function progress(assignment: Pick<AssignmentView, "items" | "completedAt">): {
  done: number;
  total: number;
} {
  const done = assignment.items.filter((item) => item.doneAt !== null).length;
  return { done, total: assignment.items.length };
}

/** Overdue chores stay with their assignee (SPEC-rota assumption 7); they are only labelled. */
export function statusOf(assignment: AssignmentView, today: string): Status {
  if (assignment.assigneeId === null) return "unassigned";
  if (assignment.completedAt !== null) return "done";
  if (assignment.dueOn < today) return "overdue";
  if (assignment.dueOn === today) return "today";
  return "upcoming";
}

export const STATUS_TEXT: Record<Status, string> = {
  done: "Done",
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Coming up",
  unassigned: "Nobody around",
};

/** "Today", "Tomorrow", or "Wednesday 11 Nov". */
export function dayLabel(dueOn: string, today: string): string {
  const diff = daysBetween(today, dueOn);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${weekdayName(dueOn)} ${shortDate(dueOn)}`;
}

function byDayThenName(a: AssignmentView, b: AssignmentView): number {
  return a.dueOn.localeCompare(b.dueOn) || a.choreName.localeCompare(b.choreName);
}

export interface PersonGroup {
  personId: string;
  name: string;
  assignments: AssignmentView[];
}

export interface ViewerWeek {
  mine: AssignmentView[];
  others: PersonGroup[];
  unassigned: AssignmentView[];
}

/** Mine first by day, then everyone else grouped by person, then anything nobody could take. */
export function arrangeForViewer(week: WeekView, viewerId: string): ViewerWeek {
  const mine = week.assignments.filter((a) => a.assigneeId === viewerId).sort(byDayThenName);
  const unassigned = week.assignments.filter((a) => a.assigneeId === null).sort(byDayThenName);
  const groups = new Map<string, PersonGroup>();
  for (const a of week.assignments) {
    if (a.assigneeId === null || a.assigneeId === viewerId) continue;
    const group = groups.get(a.assigneeId) ?? {
      personId: a.assigneeId,
      name: a.assigneeName ?? "Someone",
      assignments: [],
    };
    group.assignments.push(a);
    groups.set(a.assigneeId, group);
  }
  const others = [...groups.values()]
    .map((group) => ({ ...group, assignments: group.assignments.sort(byDayThenName) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { mine, others, unassigned };
}

/** "Week of 8 Nov", for headings. */
export function weekHeading(weekStart: string): string {
  return `Week of ${shortDate(weekStart)} to ${shortDate(addDays(weekStart, 6))}`;
}
