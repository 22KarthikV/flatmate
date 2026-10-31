"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { proposeEvent, updateEvent } from "./actions";
import type { EventFormState } from "./constants";
import { toLocalInput } from "./format";
import {
  DESCRIPTION_MAX,
  LOCATION_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
  TITLE_MAX,
  defaultDeadline,
  londonLocalToInstant,
} from "./schemas";

const initialState: EventFormState = { status: "idle" };

function Message({ state }: { state: EventFormState }) {
  if (state.status === "error") {
    return (
      <p role="alert" className="text-negative">
        {state.message}
      </p>
    );
  }
  if (state.status === "saved") return <p role="status">{state.message}</p>;
  return null;
}

const areaClass =
  "border-ink text-ink min-h-24 w-full border bg-transparent p-3 text-base focus-visible:outline-offset-4";

let rowCounter = 0;
const newRow = () => ({ key: rowCounter++ });

/** Proposes an event: a title, a few possible dates, and when voting closes (times are London time). */
export function ProposeEventForm({ nowIso }: { nowIso: string }) {
  const [state, formAction, pending] = useActionState(proposeEvent, initialState);
  const [rows, setRows] = useState([newRow(), newRow()]);
  const [deadline, setDeadline] = useState(() =>
    toLocalInput(defaultDeadline(new Date(nowIso), null)),
  );
  const touched = useRef(false);
  const starts = useRef<Record<number, string>>({});

  function suggestDeadline() {
    if (touched.current) return;
    const instants = Object.values(starts.current)
      .map((value) => londonLocalToInstant(value))
      .filter((instant): instant is Date => instant !== null);
    const earliest = instants.length
      ? new Date(Math.min(...instants.map((i) => i.getTime())))
      : null;
    setDeadline(toLocalInput(defaultDeadline(new Date(nowIso), earliest)));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Input
        label="What is it?"
        name="title"
        maxLength={TITLE_MAX}
        autoComplete="off"
        placeholder="Pizza night"
        required
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="event-description" className="label-caps text-muted">
          Details (optional)
        </label>
        <textarea
          id="event-description"
          name="description"
          maxLength={DESCRIPTION_MAX}
          className={areaClass}
        />
      </div>
      <Input
        label="Where (optional)"
        name="location"
        maxLength={LOCATION_MAX}
        autoComplete="off"
        placeholder="Our kitchen"
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="label-caps text-muted">
          Possible dates ({OPTIONS_MIN} to {OPTIONS_MAX}), London time
        </legend>
        {rows.map((row, index) => (
          <div key={row.key} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Input
              label={`Date ${index + 1}`}
              name="start"
              type="datetime-local"
              required={index < OPTIONS_MIN}
              onChange={(event) => {
                starts.current[row.key] = event.target.value;
                suggestDeadline();
              }}
            />
            <Input label="Ends (optional)" name="end" type="datetime-local" />
            {rows.length > OPTIONS_MIN ? (
              <Button
                variant="ghost"
                aria-label={`Remove date ${index + 1}`}
                onClick={() => {
                  delete starts.current[row.key];
                  setRows((current) => current.filter((r) => r.key !== row.key));
                  suggestDeadline();
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}
        {rows.length < OPTIONS_MAX ? (
          <div>
            <Button
              variant="secondary"
              onClick={() => setRows((current) => [...current, newRow()])}
            >
              Add another date
            </Button>
          </div>
        ) : null}
      </fieldset>

      <Input
        label="Voting closes"
        name="deadline"
        type="datetime-local"
        value={deadline}
        onChange={(event) => {
          touched.current = true;
          setDeadline(event.target.value);
        }}
        hint="If nobody has a majority by then, the date with the most yes wins. London time."
        required
      />

      <p className="text-muted max-w-md text-sm">
        Your flatmates can see who voted what. A date is confirmed as soon as more than half of the
        flat say yes to it.
      </p>

      <Message state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Proposing…" : "Propose it"}
        </Button>
      </div>
    </form>
  );
}

export interface EditableEvent {
  id: string;
  title: string;
  description: string;
  location: string | null;
  /** `YYYY-MM-DDTHH:mm` London time. */
  deadline: string;
  votingOpen: boolean;
}

/** The organiser fixes the words, and moves the deadline while voting is open. */
export function EditEventForm({ event }: { event: EditableEvent }) {
  const [state, formAction, pending] = useActionState(updateEvent, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="eventId" value={event.id} />
      <Input
        label="What is it?"
        name="title"
        maxLength={TITLE_MAX}
        defaultValue={event.title}
        autoComplete="off"
        required
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="edit-description" className="label-caps text-muted">
          Details (optional)
        </label>
        <textarea
          id="edit-description"
          name="description"
          maxLength={DESCRIPTION_MAX}
          defaultValue={event.description}
          className={areaClass}
        />
      </div>
      <Input
        label="Where (optional)"
        name="location"
        maxLength={LOCATION_MAX}
        defaultValue={event.location ?? ""}
        autoComplete="off"
      />
      {event.votingOpen ? (
        <Input
          label="Voting closes"
          name="deadline"
          type="datetime-local"
          defaultValue={event.deadline}
          hint="London time."
          required
        />
      ) : null}
      <Message state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
