// Pure: who an assignment can be offered to, and what could be taken in return (SPEC-rota T12). The
// database makes the same checks again; this keeps the screen from offering what would be refused.

import type { AssignmentView } from "./week-model";
import { dayLabel } from "./week-model";

export interface SwapPerson {
  profileId: string;
  displayName: string;
}

export interface ExchangeOption {
  assignmentId: string;
  label: string;
}

export interface SwapOption {
  profileId: string;
  displayName: string;
  /** Their chores I could take in return, when I am around on their day. */
  exchanges: ExchangeOption[];
}

/**
 * `away` holds "profileId:date" for each day someone is away. `weekAssignments` are the current
 * assignments of the same week. Finished chores and chores nobody holds are never offered.
 */
export function buildSwapOptions(input: {
  assignment: AssignmentView;
  viewerId: string;
  people: readonly SwapPerson[];
  away: ReadonlySet<string>;
  weekAssignments: readonly AssignmentView[];
  today: string;
}): SwapOption[] {
  const { assignment, viewerId, people, away, weekAssignments, today } = input;
  return people
    .filter(
      (person) =>
        person.profileId !== viewerId && !away.has(`${person.profileId}:${assignment.dueOn}`),
    )
    .map((person) => ({
      profileId: person.profileId,
      displayName: person.displayName,
      exchanges: weekAssignments
        .filter(
          (other) =>
            other.assigneeId === person.profileId &&
            other.completedAt === null &&
            other.id !== assignment.id &&
            !away.has(`${viewerId}:${other.dueOn}`),
        )
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.choreName.localeCompare(b.choreName))
        .map((other) => ({
          assignmentId: other.id,
          label: `${other.choreName}, ${dayLabel(other.dueOn, today)}`,
        })),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
