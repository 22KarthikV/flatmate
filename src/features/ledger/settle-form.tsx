"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { recordSettlement } from "./actions";
import type { ExpenseFormState } from "./constants";
import type { Person } from "./expense-form";
import type { RawSettlement } from "./settle";

const initialState: ExpenseFormState = { status: "idle" };

/** "I paid Sam": who and how much. Sam has to confirm it before it changes anyone's balance. */
export function SettleForm({
  people,
  former = [],
  initial,
}: {
  /** The other people in the flat. */
  people: Person[];
  /** People who have left but are still owed money; an admin confirms a payment to them. */
  former?: Person[];
  initial: RawSettlement;
}) {
  const [state, formAction, pending] = useActionState(recordSettlement, initialState);
  const [values, setValues] = useState<RawSettlement>(initial);
  const recipient = [...people, ...former].find((person) => person.profileId === values.to);
  const recipientLeft = former.some((person) => person.profileId === values.to);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="settle-to" className="label-caps text-muted">
          Who did you pay?
        </label>
        <select
          id="settle-to"
          name="to"
          value={values.to}
          onChange={(event) => setValues({ ...values, to: event.target.value })}
          required
          className="border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4"
        >
          <option value="" disabled>
            Choose a flatmate
          </option>
          {people.map((person) => (
            <option key={person.profileId} value={person.profileId}>
              {person.displayName}
            </option>
          ))}
          {former.length > 0 ? (
            <optgroup label="Left the flat, still owed money">
              {former.map((person) => (
                <option key={person.profileId} value={person.profileId}>
                  {person.displayName}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>

      <Input
        label="Amount (£)"
        name="amount"
        value={values.amount}
        onChange={(event) => setValues({ ...values, amount: event.target.value })}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        required
        hint={
          recipientLeft && recipient
            ? `${recipient.displayName} has left the flat, so an admin confirms this for them before it counts.`
            : recipient
              ? `${recipient.displayName} has to confirm they received it before it counts.`
              : "The person you paid has to confirm they received it before it counts."
        }
      />

      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Record payment"}
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
