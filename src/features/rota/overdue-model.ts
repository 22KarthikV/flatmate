// Pure: the unfinished chores from earlier weeks that someone can still sort out (a 4-week window).
// Fairness only credits what was done, so each one is finished, covered by a later turn of the same
// chore, or (by an admin) excused.

export const OVERDUE_WEEKS = 4;

export interface OverdueRow {
  id: string;
  choreId: string;
  choreName: string;
  effort: number;
  assigneeId: string;
  assigneeName: string;
  dueOn: string;
}

/** A current assignment from this week or later that an overdue chore could be covered by. */
export interface CoverCandidate {
  id: string;
  choreId: string;
  assigneeId: string;
  dueOn: string;
}

export interface OverdueItem extends OverdueRow {
  /** The later turn of the same chore that would cover it, if the same person has one. */
  coverBy: { id: string; dueOn: string } | null;
}

/** What the viewer can act on: their own, or everyone's for an admin. Oldest first. */
export function buildOverdue(
  rows: readonly OverdueRow[],
  candidates: readonly CoverCandidate[],
  viewerId: string,
  isAdmin: boolean,
): OverdueItem[] {
  return rows
    .filter((row) => isAdmin || row.assigneeId === viewerId)
    .map((row) => {
      const later = candidates
        .filter(
          (c) =>
            c.choreId === row.choreId && c.assigneeId === row.assigneeId && c.dueOn > row.dueOn,
        )
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id))[0];
      return { ...row, coverBy: later ? { id: later.id, dueOn: later.dueOn } : null };
    })
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.choreName.localeCompare(b.choreName));
}
