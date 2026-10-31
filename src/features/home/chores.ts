// Pure: the viewer's own chores for this week, in the order the spec gives.

import {
  arrangeForViewer,
  dayLabel,
  progress,
  statusOf,
  STATUS_TEXT,
  type Status,
  type WeekView,
} from "@/features/rota/week-model";

export interface ChoreRow {
  id: string;
  name: string;
  day: string;
  status: Status;
  statusText: string;
  /** "2 of 5 steps", or null when the chore has no checklist. */
  progress: string | null;
  href: string;
}

export type MyChores =
  | { kind: "not_ready" }
  | { kind: "add_chores" }
  | { kind: "hidden" }
  | { kind: "ready"; rows: ChoreRow[]; doneCount: number };

const RANK: Partial<Record<Status, number>> = { overdue: 0, today: 1, upcoming: 2 };

export function myChores(week: WeekView | null, viewerId: string, today: string): MyChores {
  if (!week) return { kind: "not_ready" };
  const mine = arrangeForViewer(week, viewerId).mine;
  const rows: ChoreRow[] = [];
  let doneCount = 0;
  for (const a of mine) {
    const status = statusOf(a, today);
    if (status === "done") {
      doneCount += 1;
      continue;
    }
    const { done, total } = progress(a);
    rows.push({
      id: a.id,
      name: a.choreName,
      day: dayLabel(a.dueOn, today),
      status,
      statusText: STATUS_TEXT[status],
      progress: total > 0 ? `${done} of ${total} steps` : null,
      href: `/rota/assignments/${a.id}`,
    });
  }
  // A stable sort keeps the day-then-name order from arrangeForViewer within each group.
  rows.sort((a, b) => (RANK[a.status] ?? 3) - (RANK[b.status] ?? 3));
  return { kind: "ready", rows, doneCount };
}
