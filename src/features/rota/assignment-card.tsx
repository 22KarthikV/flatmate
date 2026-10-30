import Link from "next/link";

import { cn } from "@/lib/cn";

import { STATUS_TEXT, dayLabel, progress, statusOf, type AssignmentView } from "./week-model";

/** One chore in a week: its day, effort, why it is theirs and how far along it is. Links to the detail. */
export function AssignmentCard({
  assignment,
  today,
  showPerson = false,
}: {
  assignment: AssignmentView;
  today: string;
  /** Show whose it is, for the "everyone" lists. */
  showPerson?: boolean;
}) {
  const status = statusOf(assignment, today);
  const { done, total } = progress(assignment);

  return (
    <li className="border-line border-b">
      <Link
        href={`/rota/assignments/${assignment.id}`}
        className="flex min-h-11 flex-col gap-1 py-4"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-2xl">{assignment.choreName}</span>
          <span
            className={cn(
              "label-caps",
              status === "overdue"
                ? "text-negative"
                : status === "done"
                  ? "text-positive"
                  : "text-muted",
            )}
          >
            {STATUS_TEXT[status]}
          </span>
        </span>
        <span className="text-muted text-sm">
          {showPerson && assignment.assigneeName ? `${assignment.assigneeName}, ` : ""}
          {dayLabel(assignment.dueOn, today)}, effort {assignment.effort} of 5
          {total > 0 ? `, ${done} of ${total} steps` : ""}
        </span>
        <span className="max-w-md text-sm">{assignment.explanation}</span>
      </Link>
    </li>
  );
}
