"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveChore } from "./actions";
import {
  CHECKLIST_ITEM_MAX,
  CHECKLIST_MAX_ITEMS,
  CHORE_NAME_MAX,
  EFFORTS,
  WEEKDAYS,
  type Cadence,
  type Chore,
  type ChoreFormState,
} from "./constants";

const initialState: ChoreFormState = { status: "idle" };

const selectClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

let stepCounter = 0;
const makeSteps = (texts: string[]): Step[] => texts.map((text) => ({ key: stepCounter++, text }));

interface Step {
  key: number;
  text: string;
}

/** Moves one step up (-1) or down (+1); a step at an edge stays where it is. */
export function moveStep<T>(steps: T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * Adds a chore, or changes one. The checklist is a list of steps the admin can add, reorder and
 * remove; the server action reads the posted fields with the same code the tests use, and the
 * database checks them again.
 */
export function ChoreForm({
  chore,
  onDone,
}: {
  /** When set, the form changes this chore instead of adding one. */
  chore?: Chore;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveChore, initialState);

  const [cadence, setCadence] = useState<Cadence>(chore?.cadence ?? "weekly");
  const [steps, setSteps] = useState<Step[]>(() =>
    makeSteps(chore ? chore.items.map((item) => item.text) : [""]),
  );

  useEffect(() => {
    if (state.status === "saved") onDone?.();
  }, [state, onDone]);

  const updateStep = (key: number, text: string) =>
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, text } : step)));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {chore ? <input type="hidden" name="choreId" value={chore.id} /> : null}

      <Input
        label="Chore name"
        name="name"
        defaultValue={chore?.name ?? ""}
        maxLength={CHORE_NAME_MAX}
        autoComplete="off"
        placeholder="Kitchen"
        required
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="chore-cadence" className="label-caps text-muted">
            How often
          </label>
          <select
            id="chore-cadence"
            name="cadence"
            value={cadence}
            onChange={(event) => setCadence(event.target.value as Cadence)}
            className={selectClass}
          >
            <option value="weekly">Once a week</option>
            <option value="every_n_days">Every few days</option>
          </select>
        </div>

        {cadence === "weekly" ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="chore-day" className="label-caps text-muted">
              Usually done on
            </label>
            <select
              id="chore-day"
              name="preferredDow"
              defaultValue={String(chore?.preferredDow ?? 6)}
              className={selectClass}
            >
              {WEEKDAYS.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <Input
            label="Every how many days (1 to 14)"
            name="everyNDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={14}
            defaultValue={chore?.everyNDays ?? 2}
            required
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="chore-effort" className="label-caps text-muted">
          Effort
        </label>
        <select
          id="chore-effort"
          name="effort"
          defaultValue={String(chore?.effort ?? 3)}
          className={selectClass}
        >
          {EFFORTS.map((effort) => (
            <option key={effort.id} value={effort.id}>
              {effort.label}
            </option>
          ))}
        </select>
        <p className="text-muted text-sm">
          Effort only helps share the work fairly. A change applies to weeks not yet made.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="label-caps text-muted">Checklist</legend>
        <p className="text-muted text-sm">
          The chore counts as done when every step is ticked. Changing the steps never changes
          chores already handed out.
        </p>
        <ol className="flex flex-col gap-2">
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  label={`Step ${index + 1}`}
                  name="item"
                  value={step.text}
                  onChange={(event) => updateStep(step.key, event.target.value)}
                  maxLength={CHECKLIST_ITEM_MAX}
                  autoComplete="off"
                />
              </div>
              <Button
                variant="ghost"
                className="px-2"
                disabled={index === 0}
                aria-label={`Move step ${index + 1} up`}
                onClick={() => setSteps((current) => moveStep(current, index, -1))}
              >
                Up
              </Button>
              <Button
                variant="ghost"
                className="px-2"
                disabled={index === steps.length - 1}
                aria-label={`Move step ${index + 1} down`}
                onClick={() => setSteps((current) => moveStep(current, index, 1))}
              >
                Down
              </Button>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Remove step ${index + 1}`}
                onClick={() => setSteps((current) => current.filter((s) => s.key !== step.key))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
        <div>
          <Button
            variant="secondary"
            disabled={steps.length >= CHECKLIST_MAX_ITEMS}
            onClick={() => setSteps((current) => [...current, ...makeSteps([""])])}
          >
            Add a step
          </Button>
        </div>
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="needsSignoff"
          defaultChecked={chore?.needsSignoff ?? false}
          className="size-5"
        />
        <span>Another flatmate signs it off when it is done</span>
      </label>

      {state.status === "error" ? (
        <p role="alert" className="text-negative">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : chore ? "Save chore" : "Add chore"}
        </Button>
        {onDone ? (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
