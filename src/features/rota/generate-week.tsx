"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { generateWeekNow } from "./actions";
import type { GenerateFormState } from "./constants";
import { DEADLINE_SENTENCE, shortDate } from "./week";

const initialState: GenerateFormState = { status: "idle" };

/**
 * "Generate now" for owners and admins. The rota normally builds itself an hour after the deadline;
 * this is for the first week, or to rebuild one on purpose. Anyone who has not answered is treated
 * as around, so the screen says so.
 */
export function GenerateWeek({ weeks }: { weeks: { start: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(generateWeekNow, initialState);

  return (
    <Card>
      <CardLabel>Give out a week now</CardLabel>
      <p className="mt-3 max-w-md">
        The rota builds itself shortly after the answer deadline each week. Use this to give out the
        first week, or to rebuild one. A rebuild keeps the old one and tells everyone.
      </p>
      <p className="text-muted mt-2 max-w-md text-sm">
        {DEADLINE_SENTENCE} If you build the week before then, anyone who has not answered counts as
        around.
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <fieldset className="flex flex-col">
          <legend className="label-caps text-muted mb-1">Which week</legend>
          {weeks.map((week, index) => (
            <label key={week.start} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="weekStart"
                value={week.start}
                defaultChecked={index === 0}
                className="size-5"
              />
              <span>
                {week.label}, from {shortDate(week.start)}
              </span>
            </label>
          ))}
        </fieldset>
        {state.status === "error" ? (
          <p role="alert" className="text-negative">
            {state.message}
          </p>
        ) : null}
        {state.status === "saved" ? <p role="status">{state.message}</p> : null}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Building…" : "Give out the week"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
