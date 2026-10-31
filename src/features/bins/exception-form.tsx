"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveException } from "./actions";
import { NOTE_MAX, type BinFormState } from "./constants";
import { addDays, collectionsBetween, type BinStream } from "./collections";
import { dayWord } from "./view";

const initialState: BinFormState = { status: "idle" };

const selectClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

/** Skip one collection, or move it to another day, when the council changes it. */
export function ExceptionForm({ streams, today }: { streams: BinStream[]; today: string }) {
  const [state, formAction, pending] = useActionState(saveException, initialState);
  const [streamId, setStreamId] = useState(streams[0]?.id ?? "");
  const [kind, setKind] = useState<"skip" | "move">("skip");

  const stream = streams.find((s) => s.id === streamId);
  const dates = stream
    ? collectionsBetween([stream], [], today, addDays(today, 7 * 12)).map((c) => c.date)
    : [];

  if (streams.length === 0) return null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="exception-bin" className="label-caps text-muted">
          Which bin
        </label>
        <select
          id="exception-bin"
          name="streamId"
          value={streamId}
          onChange={(event) => setStreamId(event.target.value)}
          className={selectClass}
        >
          {streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="exception-date" className="label-caps text-muted">
          Which collection
        </label>
        <select id="exception-date" name="originalOn" className={selectClass} key={streamId}>
          {dates.map((date) => (
            <option key={date} value={date}>
              {dayWord(date, today)} ({date})
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="label-caps text-muted mb-2">What changed</legend>
        {(
          [
            ["skip", "Not collected"],
            ["move", "Moved to another day"],
          ] as const
        ).map(([id, label]) => (
          <label key={id} className="cursor-pointer">
            <input
              type="radio"
              name="kind"
              value={id}
              checked={kind === id}
              onChange={() => setKind(id)}
              className="peer sr-only"
            />
            <span className="border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-ink label-caps inline-flex min-h-11 items-center border px-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
              {label}
            </span>
          </label>
        ))}
      </fieldset>
      {kind === "move" ? (
        <Input
          label="Moved to"
          name="movedTo"
          type="date"
          hint="Within 14 days of the original day."
          required
        />
      ) : null}
      <Input
        label="Note (optional)"
        name="note"
        maxLength={NOTE_MAX}
        autoComplete="off"
        placeholder="Bank holiday"
      />
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save change"}
        </Button>
        {state.status === "saved" ? <p className="text-sm">Saved.</p> : null}
        {state.status === "error" ? (
          <p role="alert" className="text-negative text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
