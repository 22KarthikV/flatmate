"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { saveAvailability } from "./actions";
import type { DayAnswer } from "./availability-summary";
import type { AvailabilityFormState } from "./constants";

const initialState: AvailabilityFormState = { status: "idle" };

/**
 * Seven toggles for the coming week, ticked when you are around. Posts the dates that are ticked;
 * the server action turns them into seven answers and the database checks the deadline.
 */
export function AvailabilityForm({
  weekStart,
  days,
  open,
}: {
  weekStart: string;
  days: DayAnswer[];
  /** False once the deadline has passed: the days are shown but cannot be changed. */
  open: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveAvailability, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="weekStart" value={weekStart} />
      <fieldset className="flex flex-col" disabled={!open}>
        <legend className="label-caps text-muted mb-2">I am around on</legend>
        <ul className="flex flex-col">
          {days.map((day) => (
            <li key={day.date} className="border-line border-b">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name="day"
                  value={day.date}
                  defaultChecked={day.available}
                  className="size-5"
                />
                <span>
                  {day.weekday} <span className="text-muted">{day.short}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {state.status === "error" ? (
        <p role="alert" className="text-negative">
          {state.message}
        </p>
      ) : null}
      {state.status === "saved" ? (
        <p role="status" className="text-muted">
          Saved. You can change this until the deadline.
        </p>
      ) : null}

      {open ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save my days"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
