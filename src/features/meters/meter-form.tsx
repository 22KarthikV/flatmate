"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addMeter } from "./actions";
import { KINDS, LABEL_MAX, unitOptions, type MeterFormState } from "./constants";
import { unitLabel } from "./usage";

const initialState: MeterFormState = { status: "idle" };

const selectClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

/** Kind, an optional label (for a second electricity meter) and the unit. Admin only. */
export function MeterForm() {
  const [state, formAction, pending] = useActionState(addMeter, initialState);
  const [kind, setKind] = useState<string>("electricity");
  const units = unitOptions(kind);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="meter-kind" className="label-caps text-muted">
          What it measures
        </label>
        <select
          id="meter-kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className={selectClass}
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <Input
        label="Label (optional)"
        name="label"
        maxLength={LABEL_MAX}
        autoComplete="off"
        placeholder="Upstairs"
        hint="Only needed to tell two meters of one kind apart."
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="meter-unit" className="label-caps text-muted">
          Unit
        </label>
        <select id="meter-unit" name="unit" key={kind} className={selectClass}>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unitLabel(unit)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding" : "Add meter"}
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
