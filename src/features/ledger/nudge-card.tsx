"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

import { saveNudgeInterval } from "./actions";
import { NUDGE_CHOICES, nudgeValue, type NudgeState, type NudgeValue } from "./nudge";

const initialState: NudgeState = { status: "idle" };

/** For owners and admins: how long someone owes before they get a gentle reminder. */
export function NudgeCard({ current }: { current: number | null }) {
  const [state, formAction, pending] = useActionState(saveNudgeInterval, initialState);
  const [value, setValue] = useState<NudgeValue>(nudgeValue(current));

  return (
    <Card>
      <CardLabel>Money reminders</CardLabel>
      <p className="text-muted mt-3 max-w-md text-sm">
        FlatMate can send a gentle reminder to anyone who has owed more than £1 for a while. Each
        person can switch these off for themselves in their notification settings.
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="nudge-interval" className="label-caps text-muted">
            Remind people who owe money
          </label>
          <select
            id="nudge-interval"
            name="interval"
            value={value}
            onChange={(event) => setValue(event.target.value as NudgeValue)}
            className="border-ink min-h-11 w-full max-w-xs border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4"
          >
            {NUDGE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-11 flex-wrap items-center gap-4">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Saving" : "Save"}
          </Button>
          {state.status === "saved" ? (
            <p role="status" className="text-positive text-sm">
              Saved.
            </p>
          ) : null}
          {state.status === "error" ? (
            <p role="alert" className="text-negative text-sm">
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
