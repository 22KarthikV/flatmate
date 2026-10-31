"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addOption } from "./actions";
import type { EventFormState } from "./constants";

const initialState: EventFormState = { status: "idle" };

/** The organiser offers one more date while voting is open. Others keep their answers. */
export function AddDateForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(addOption, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="New date" name="start" type="datetime-local" required />
        <Input label="Ends (optional)" name="end" type="datetime-local" />
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-negative">
          {state.message}
        </p>
      ) : null}
      {state.status === "saved" ? <p role="status">{state.message}</p> : null}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add the date"}
        </Button>
      </div>
    </form>
  );
}
