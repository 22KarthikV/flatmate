import { Button } from "@/components/ui/button";

import {
  completeAssignment,
  reopenAssignment,
  signOffAssignment,
  tickItem,
  untickItem,
} from "./actions";
import { progress, type AssignmentView } from "./week-model";

/**
 * The steps of one assignment, with ticking for the assignee or an admin. These are plain forms
 * posting to server actions; the database decides who may tick and the page refreshes afterwards.
 * A chore is done when every step is ticked.
 */
export function Checklist({
  assignment,
  canTick,
  canSignOff,
}: {
  assignment: AssignmentView;
  /** The assignee or an admin, on a current (not replaced) assignment. */
  canTick: boolean;
  /** Another flatmate, on a finished chore that asks for sign-off. */
  canSignOff: boolean;
}) {
  const { done, total } = progress(assignment);
  const finished = assignment.completedAt !== null;

  return (
    <div className="flex flex-col gap-4">
      {total > 0 ? (
        <>
          <p className="label-caps text-muted" aria-live="polite">
            {done} of {total} steps done
          </p>
          <ol className="flex flex-col">
            {assignment.items.map((item) => (
              <li key={item.id} className="border-line border-b">
                {canTick ? (
                  <form action={item.doneAt ? untickItem : tickItem}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <button
                      type="submit"
                      aria-pressed={item.doneAt !== null}
                      className="flex min-h-11 w-full items-center gap-3 py-2 text-left"
                    >
                      <span
                        aria-hidden="true"
                        className="border-ink flex size-6 shrink-0 items-center justify-center border"
                      >
                        {item.doneAt ? "✓" : ""}
                      </span>
                      <span className={item.doneAt ? "text-muted line-through" : undefined}>
                        {item.text}
                      </span>
                    </button>
                  </form>
                ) : (
                  <p className="flex min-h-11 items-center gap-3 py-2">
                    <span
                      aria-hidden="true"
                      className="border-ink flex size-6 shrink-0 items-center justify-center border"
                    >
                      {item.doneAt ? "✓" : ""}
                    </span>
                    <span className={item.doneAt ? "text-muted line-through" : undefined}>
                      {item.text}
                      <span className="sr-only">{item.doneAt ? " (done)" : " (not done)"}</span>
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-muted">This chore has no steps.</p>
      )}

      {finished ? (
        <p role="status" className="text-positive">
          Done
          {assignment.needsSignoff
            ? assignment.signedOffBy
              ? ", signed off by a flatmate."
              : ", waiting for a flatmate to sign it off."
            : "."}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {canTick && !finished && total === 0 ? (
          <form action={completeAssignment}>
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <Button type="submit">Mark done</Button>
          </form>
        ) : null}
        {canTick && finished ? (
          <form action={reopenAssignment}>
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <Button type="submit" variant="secondary">
              Reopen
            </Button>
          </form>
        ) : null}
        {canSignOff ? (
          <form action={signOffAssignment}>
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <Button type="submit">Sign it off</Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
