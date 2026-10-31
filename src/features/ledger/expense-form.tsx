"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

import { addExpense, editExpense } from "./actions";
import {
  CATEGORIES,
  DESCRIPTION_MAX,
  SPLIT_MODES,
  type ExpenseFormState,
  type SplitMode,
} from "./constants";
import { buildSplit, type RawExpense } from "./form";
import { formatPence } from "./money";

const initialState: ExpenseFormState = { status: "idle" };

export interface Person {
  profileId: string;
  displayName: string;
}

const selectClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="label-caps text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Adds an expense, or corrects one. The amount and the split are held here so each person's share
 * shows as you type; the server action reads the posted fields with the same code and the database
 * checks them again.
 */
export function ExpenseForm({
  people,
  viewerId,
  today,
  expense,
  action,
  hidden,
  initial,
  submitLabel,
}: {
  people: Person[];
  viewerId: string;
  /** yyyy-mm-dd in London, the default date. */
  today: string;
  /** When set, the form corrects this expense instead of adding one. */
  expense?: { id: string; initial: RawExpense };
  /** Another tool that makes an expense (the shopping list) supplies its own action, with fields to post along. */
  action?: (previous: ExpenseFormState, formData: FormData) => Promise<ExpenseFormState>;
  hidden?: Record<string, string>;
  /** Starting values for the fields; anything left out keeps the usual default. */
  initial?: Partial<RawExpense>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action ?? (expense ? editExpense : addExpense),
    initialState,
  );

  const [values, setValues] = useState<RawExpense>(
    expense?.initial ?? {
      ...{
        amount: "",
        description: "",
        category: "groceries",
        occurredOn: today,
        paidBy: viewerId,
        mode: "equal",
        who: people.map((person) => person.profileId),
        exact: {},
        percent: {},
        one: "",
      },
      ...initial,
    },
  );
  const set = <K extends keyof RawExpense>(key: K, value: RawExpense[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const names = new Map(people.map((person) => [person.profileId, person.displayName]));
  const nameOf = (id: string) =>
    id === viewerId ? `${names.get(id) ?? "You"} (you)` : (names.get(id) ?? "Someone");
  const split = buildSplit(
    values,
    people.map((person) => person.profileId),
  );
  const editing = Boolean(expense);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {expense ? <input type="hidden" name="expenseId" value={expense.id} /> : null}
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name + value} type="hidden" name={name} value={value} />
      ))}

      <Input
        label="Amount (£)"
        name="amount"
        value={values.amount}
        onChange={(event) => set("amount", event.target.value)}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        required
      />
      <Input
        label="What was it for?"
        name="description"
        value={values.description}
        onChange={(event) => set("description", event.target.value)}
        maxLength={DESCRIPTION_MAX}
        autoComplete="off"
        placeholder="Kitchen roll"
        required
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Category" htmlFor="expense-category">
          <select
            id="expense-category"
            name="category"
            value={values.category}
            onChange={(event) => set("category", event.target.value)}
            className={selectClass}
          >
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </Field>
        <Input
          label="Date"
          name="occurredOn"
          type="date"
          value={values.occurredOn}
          onChange={(event) => set("occurredOn", event.target.value)}
          required
        />
      </div>

      <Field label="Who paid?" htmlFor="expense-paid-by">
        <select
          id="expense-paid-by"
          name="paidBy"
          value={values.paidBy}
          onChange={(event) => set("paidBy", event.target.value)}
          className={selectClass}
        >
          {people.map((person) => (
            <option key={person.profileId} value={person.profileId}>
              {nameOf(person.profileId)}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-4">
        <legend className="label-caps text-muted">Split</legend>
        <div className="flex flex-wrap gap-2">
          {SPLIT_MODES.map((mode) => (
            <label key={mode.id} className="cursor-pointer">
              <input
                type="radio"
                name="mode"
                value={mode.id}
                checked={values.mode === mode.id}
                onChange={() => set("mode", mode.id satisfies SplitMode)}
                className="peer sr-only"
              />
              <span className="border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-ink label-caps inline-flex min-h-11 items-center border px-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                {mode.label}
              </span>
            </label>
          ))}
        </div>

        {values.mode === "equal" ? (
          <ul className="flex flex-col">
            {people.map((person) => (
              <li key={person.profileId}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="who"
                    value={person.profileId}
                    checked={values.who.includes(person.profileId)}
                    onChange={(event) =>
                      set(
                        "who",
                        event.target.checked
                          ? [...values.who, person.profileId]
                          : values.who.filter((id) => id !== person.profileId),
                      )
                    }
                    className="accent-ink size-6"
                  />
                  <span>{nameOf(person.profileId)}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}

        {values.mode === "one" ? (
          <ul className="flex flex-col">
            {people.map((person) => (
              <li key={person.profileId}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="one"
                    value={person.profileId}
                    checked={values.one === person.profileId}
                    onChange={() => set("one", person.profileId)}
                    className="accent-ink size-6"
                  />
                  <span>{nameOf(person.profileId)}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}

        {values.mode === "exact" || values.mode === "percent" ? (
          <ul className="flex flex-col gap-1">
            {people.map((person) => {
              const kind = values.mode as "exact" | "percent";
              const id = `${kind}-${person.profileId}`;
              return (
                <li
                  key={person.profileId}
                  className="flex min-h-11 items-center justify-between gap-4"
                >
                  <label htmlFor={id}>{nameOf(person.profileId)}</label>
                  <span className="flex items-center gap-1">
                    {kind === "exact" ? <span aria-hidden="true">£</span> : null}
                    <input
                      id={id}
                      name={`${kind}:${person.profileId}`}
                      value={values[kind][person.profileId] ?? ""}
                      onChange={(event) =>
                        set(kind, { ...values[kind], [person.profileId]: event.target.value })
                      }
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={kind === "exact" ? "0.00" : "0"}
                      className={cn(
                        "border-ink min-h-11 w-24 border-0 border-b bg-transparent px-0 text-right text-base focus-visible:outline-offset-4",
                      )}
                    />
                    {kind === "percent" ? <span aria-hidden="true">%</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </fieldset>

      <div aria-live="polite" className="border-line border-t pt-4">
        <p className="label-caps text-muted">Each share</p>
        {values.amount.trim() === "" ? (
          <p className="text-muted mt-2 text-sm">Enter an amount to see each share.</p>
        ) : split.ok ? (
          <ul className="mt-2 flex flex-col gap-1">
            {split.shares.map((share) => (
              <li key={share.profileId} className="flex justify-between gap-4">
                <span>{nameOf(share.profileId)}</span>
                <span>{formatPence(share.pence)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted mt-2 text-sm">{split.message}</p>
        )}
      </div>

      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : (submitLabel ?? (editing ? "Save correction" : "Add expense"))}
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
