"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveBin } from "./actions";
import { COLOURS, EVERY_WEEKS, BIN_NAME_MAX, type BinFormState } from "./constants";
import { addDays, collectionsBetween } from "./collections";
import { dayWord } from "./view";

const initialState: BinFormState = { status: "idle" };

const selectClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

export interface BinValues {
  id?: string;
  name: string;
  colour: string;
  anchorOn: string;
  everyWeeks: number;
}

/** The next five dates the typed pattern gives, so a wrong date is spotted before it is saved. */
export function previewDates(anchorOn: string, everyWeeks: number, today: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorOn) || Number.isNaN(Date.parse(`${anchorOn}T00:00:00Z`))) {
    return [];
  }
  return collectionsBetween(
    [{ id: "p", name: "", colour: "other", anchorOn, everyWeeks }],
    [],
    today,
    addDays(today, 7 * everyWeeks * 5),
  )
    .slice(0, 5)
    .map((c) => c.date);
}

/**
 * Adds a bin, or changes one. "A date it was collected" is a real calendar date from the council
 * calendar; every other collection is counted from it.
 */
export function BinForm({ bin, today }: { bin?: BinValues; today: string }) {
  const [state, formAction, pending] = useActionState(saveBin, initialState);
  const [values, setValues] = useState<BinValues>(
    bin ?? { name: "", colour: "grey", anchorOn: today, everyWeeks: 1 },
  );
  const set = <K extends keyof BinValues>(key: K, value: BinValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  // A new bin clears the form once it is saved; adjusted during render, not in an effect.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "saved" && !bin) {
      setValues({ name: "", colour: "grey", anchorOn: today, everyWeeks: 1 });
    }
  }

  const preview = previewDates(values.anchorOn, values.everyWeeks, today);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {bin?.id ? <input type="hidden" name="binId" value={bin.id} /> : null}
      <Input
        label="Name"
        name="name"
        value={values.name}
        onChange={(event) => set("name", event.target.value)}
        maxLength={BIN_NAME_MAX}
        autoComplete="off"
        placeholder="Grey bin"
        required
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={`colour-${bin?.id ?? "new"}`} className="label-caps text-muted">
            Colour
          </label>
          <select
            id={`colour-${bin?.id ?? "new"}`}
            name="colour"
            value={values.colour}
            onChange={(event) => set("colour", event.target.value)}
            className={selectClass}
          >
            {COLOURS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`every-${bin?.id ?? "new"}`} className="label-caps text-muted">
            How often
          </label>
          <select
            id={`every-${bin?.id ?? "new"}`}
            name="everyWeeks"
            value={values.everyWeeks}
            onChange={(event) => set("everyWeeks", Number(event.target.value))}
            className={selectClass}
          >
            {EVERY_WEEKS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Input
        label="A date it was collected"
        name="anchorOn"
        type="date"
        value={values.anchorOn}
        onChange={(event) => set("anchorOn", event.target.value)}
        hint="Any real collection day from your council calendar, past or coming."
        required
      />
      <div aria-live="polite" className="border-line border-t pt-3">
        <p className="label-caps text-muted">The next collections would be</p>
        {preview.length === 0 ? (
          <p className="text-muted mt-2 text-sm">Choose a date to see them.</p>
        ) : (
          <ul className="mt-2 text-sm">
            {preview.map((date) => (
              <li key={date}>{dayWord(date, today)}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : bin ? "Save bin" : "Add bin"}
        </Button>
        {state.status === "error" ? (
          <p role="alert" className="text-negative text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
