"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addReading } from "./actions";
import { NOTE_MAX, type MeterFormState } from "./constants";
import { unitLabel } from "./usage";

const initialState: MeterFormState = { status: "idle" };

/**
 * A date, the number on the meter and an optional note. If the number is lower than the last
 * reading the form asks whether the meter was replaced or rolled over, and records a reset only
 * on a yes.
 */
export function ReadingForm({
  meterId,
  unit,
  today,
}: {
  meterId: string;
  unit: string;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(addReading, initialState);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "saved") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="meterId" value={meterId} />
      <Input
        label="Date of the reading"
        name="readOn"
        type="date"
        defaultValue={today}
        max={today}
        required
      />
      <Input
        label={`Reading (${unitLabel(unit)})`}
        name="value"
        inputMode="decimal"
        autoComplete="off"
        placeholder="1214.5"
        required
      />
      <Input
        label="Note (optional)"
        name="note"
        maxLength={NOTE_MAX}
        autoComplete="off"
        placeholder="Please don't put account numbers here."
      />
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Add reading"}
        </Button>
        {state.status === "error" ? (
          <p role="alert" className="text-negative text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
      {state.status === "error" && state.askReset ? (
        <div className="border-line flex flex-col gap-3 border p-4">
          <p>Was the meter replaced or did it roll over?</p>
          <button
            type="submit"
            name="reset"
            value="yes"
            disabled={pending}
            className="bg-ink text-paper label-caps inline-flex min-h-11 w-fit items-center px-5"
          >
            Yes, record it as a reset
          </button>
          <p className="text-muted text-sm">
            If not, it is probably a typo. Check the number and try again.
          </p>
        </div>
      ) : null}
    </form>
  );
}
