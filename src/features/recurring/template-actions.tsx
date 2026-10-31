"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { endTemplate, pauseTemplate, resumeTemplate, skipMonth } from "./actions";
import type { RecurringFormState } from "./constants";
import { monthLabel } from "./format";

const initialState: RecurringFormState = { status: "idle" };

function ErrorLine({ state }: { state: RecurringFormState }) {
  return state.status === "error" ? (
    <p role="alert" className="text-negative text-sm">
      {state.message}
    </p>
  ) : null;
}

/** What an admin can do with a rent or bill: edit, pause or resume, skip a coming month, end it. */
export function TemplateActions({
  templateId,
  paused,
  ended,
  skippable,
}: {
  templateId: string;
  paused: boolean;
  ended: boolean;
  /** Upcoming months that have not been created yet, as yyyy-mm-dd periods. */
  skippable: string[];
}) {
  const [pauseState, pauseAction, pausing] = useActionState(pauseTemplate, initialState);
  const [resumeState, resumeAction, resuming] = useActionState(resumeTemplate, initialState);
  const [skipState, skipAction, skipping] = useActionState(skipMonth, initialState);
  const [endState, endAction, ending] = useActionState(endTemplate, initialState);
  const busy = pausing || resuming || skipping || ending;

  if (ended) return <p className="text-muted text-sm">This has ended. It is kept as history.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/money/recurring/${templateId}/edit`}
          className="label-caps bg-ink text-paper inline-flex min-h-11 items-center justify-center px-6 hover:opacity-85"
        >
          Edit
        </Link>
        {paused ? (
          <form action={resumeAction}>
            <input type="hidden" name="templateId" value={templateId} />
            <Button type="submit" variant="secondary" disabled={busy}>
              {resuming ? "Resuming" : "Resume"}
            </Button>
          </form>
        ) : (
          <form action={pauseAction}>
            <input type="hidden" name="templateId" value={templateId} />
            <Button type="submit" variant="secondary" disabled={busy}>
              {pausing ? "Pausing" : "Pause"}
            </Button>
          </form>
        )}
        <form action={endAction}>
          <input type="hidden" name="templateId" value={templateId} />
          <Button type="submit" variant="ghost" disabled={busy}>
            {ending ? "Ending" : "End it"}
          </Button>
        </form>
      </div>
      <p className="text-muted max-w-md text-sm">
        Ending stops new months. It also cancels coming months that nobody has paid; a month that is
        already due, or has a payment, stays.
      </p>
      <ErrorLine state={pauseState} />
      <ErrorLine state={resumeState} />
      <ErrorLine state={endState} />

      {skippable.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="label-caps text-muted">Skip a coming month</p>
          <div className="flex flex-wrap gap-3">
            {skippable.map((period) => (
              <form key={period} action={skipAction}>
                <input type="hidden" name="templateId" value={templateId} />
                <input type="hidden" name="period" value={period} />
                <Button type="submit" variant="secondary" disabled={busy}>
                  Skip {monthLabel(period)}
                </Button>
              </form>
            ))}
          </div>
          <ErrorLine state={skipState} />
        </div>
      ) : null}
    </div>
  );
}
