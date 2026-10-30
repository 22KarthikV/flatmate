"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPence } from "@/features/ledger/money";

import { saveTemplate } from "./actions";
import { MONTH_SHORT, type RecurringFormState } from "./constants";
import { DUE_DAY_MAX } from "./dates";
import { ordinal } from "./format";
import { buildTemplate, describeTotal, type FormValues, type RoomValues } from "./template-input";

const initialState: RecurringFormState = { status: "idle" };

export interface FormPerson {
  profileId: string;
  displayName: string;
  /** Owners and admins: the only people who can collect the rent. */
  isAdmin: boolean;
}

const fieldClass =
  "border-ink min-h-11 w-full border-0 border-b bg-transparent px-0 text-base focus-visible:outline-offset-4";

function Select({
  label,
  value,
  onChange,
  children,
  id,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label-caps text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      >
        {children}
      </select>
    </div>
  );
}

function Tick({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5"
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Create or edit a rent or a bill. The words typed are checked as you type by the same code the
 * server action uses, and a rent shows each person's amount and the total before saving.
 * Editing only affects months that have not been created yet.
 */
export function TemplateForm({
  people,
  initial,
  templateId,
  lockKind = false,
}: {
  people: FormPerson[];
  initial: FormValues;
  /** Set when editing an existing template. */
  templateId?: string;
  /** Editing keeps the kind: a rent cannot become a bill. */
  lockKind?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveTemplate, initialState);
  const [values, setValues] = useState<FormValues>(initial);
  const set = (change: Partial<FormValues>) => setValues((current) => ({ ...current, ...change }));

  const built = buildTemplate(values);
  const nameOf = (id: string) => people.find((p) => p.profileId === id)?.displayName ?? "Someone";
  const placed = new Set(values.rooms.flatMap((room) => room.occupants));
  const unplaced = people.filter((p) => !placed.has(p.profileId));

  function setRoom(key: string, change: Partial<RoomValues>) {
    set({ rooms: values.rooms.map((room) => (room.key === key ? { ...room, ...change } : room)) });
  }
  function toggleOccupant(key: string, profileId: string, on: boolean) {
    set({
      rooms: values.rooms.map((room) => {
        const without = room.occupants.filter((id) => id !== profileId);
        return room.key === key
          ? { ...room, occupants: on ? [...without, profileId] : without }
          : { ...room, occupants: without };
      }),
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="payload" value={built.ok ? JSON.stringify(built.input) : ""} />
      {templateId ? <input type="hidden" name="templateId" value={templateId} /> : null}

      {!lockKind ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="label-caps text-muted">What is it?</legend>
          <div className="flex gap-2">
            {(["rent", "bill"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={values.kind === kind}
                onClick={() =>
                  set({
                    kind,
                    name:
                      values.name === "" || values.name === "Rent"
                        ? kind === "rent"
                          ? "Rent"
                          : ""
                        : values.name,
                  })
                }
                className={`label-caps min-h-11 flex-1 border px-3 ${
                  values.kind === kind ? "bg-ink text-paper border-ink" : "border-ink"
                }`}
              >
                {kind === "rent" ? "Rent" : "A bill"}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Input
        label="Name"
        value={values.name}
        onChange={(event) => set({ name: event.target.value })}
        maxLength={50}
        autoComplete="off"
        placeholder={values.kind === "rent" ? "Rent" : "Gas, Wi-Fi, Council tax"}
        required
      />

      <Select
        id="due-day"
        label="Due on the"
        value={values.dueDay}
        onChange={(value) => set({ dueDay: Number(value) })}
      >
        {Array.from({ length: DUE_DAY_MAX }, (_, i) => i + 1).map((day) => (
          <option key={day} value={day}>
            {ordinal(day)} of the month
          </option>
        ))}
      </Select>

      {values.kind === "bill" ? (
        <>
          <Select
            id="paid-by"
            label="Who pays the supplier?"
            value={values.paidBy}
            onChange={(value) => set({ paidBy: value })}
          >
            {people.map((person) => (
              <option key={person.profileId} value={person.profileId}>
                {person.displayName}
              </option>
            ))}
          </Select>

          <fieldset className="flex flex-col gap-2">
            <legend className="label-caps text-muted">Is the amount the same each month?</legend>
            <div className="flex gap-2">
              {(
                [
                  ["fixed", "Same each month"],
                  ["variable", "Changes each month"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={values.amountMode === mode}
                  onClick={() => set({ amountMode: mode })}
                  className={`label-caps min-h-11 flex-1 border px-3 ${
                    values.amountMode === mode ? "bg-ink text-paper border-ink" : "border-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {values.amountMode === "variable" ? (
              <p className="text-muted text-sm">
                Two weeks before it is due, the person who pays is asked to type in the amount from
                the bill or letter. It is split and everyone is told once they do.
              </p>
            ) : null}
          </fieldset>

          {values.amountMode === "fixed" ? (
            <Input
              label="Amount each month (£)"
              value={values.amount}
              onChange={(event) => set({ amount: event.target.value })}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
            />
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="label-caps text-muted">How is it shared?</legend>
            <div className="flex gap-2">
              {(
                [
                  ["equal", "Equally"],
                  ["percent", "By percentages"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={values.splitMode === mode}
                  onClick={() => set({ splitMode: mode })}
                  className={`label-caps min-h-11 flex-1 border px-3 ${
                    values.splitMode === mode ? "bg-ink text-paper border-ink" : "border-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {values.splitMode === "equal" ? (
            <div className="flex flex-col">
              <Tick
                label="Everyone in the flat, including people who join later"
                checked={values.everyone}
                onChange={(everyone) => set({ everyone })}
              />
              {!values.everyone
                ? people.map((person) => (
                    <Tick
                      key={person.profileId}
                      label={person.displayName}
                      checked={values.chosen.includes(person.profileId)}
                      onChange={(on) =>
                        set({
                          chosen: on
                            ? [...values.chosen, person.profileId]
                            : values.chosen.filter((id) => id !== person.profileId),
                        })
                      }
                    />
                  ))
                : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="label-caps text-muted">Percentage for each person</p>
              {people.map((person) => (
                <Input
                  key={person.profileId}
                  label={person.displayName}
                  value={values.percent[person.profileId] ?? ""}
                  onChange={(event) =>
                    set({ percent: { ...values.percent, [person.profileId]: event.target.value } })
                  }
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                />
              ))}
              <p className="text-muted text-sm">They must add up to 100%.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <Select
            id="collector"
            label="Who collects the rent?"
            value={values.collectorId}
            onChange={(value) => set({ collectorId: value })}
          >
            {people
              .filter((person) => person.isAdmin)
              .map((person) => (
                <option key={person.profileId} value={person.profileId}>
                  {person.displayName}
                </option>
              ))}
          </Select>

          <div className="flex flex-col gap-6">
            <p className="label-caps text-muted">Rooms</p>
            <p className="text-muted -mt-4 text-sm">
              Each room&rsquo;s rent is split equally between the people who live in it. Nobody else
              can see these amounts, not even a flatmate in the same room.
            </p>
            {values.rooms.map((room, index) => (
              <div key={room.key} className="border-line flex flex-col gap-4 border p-4">
                <Input
                  label={`Room ${index + 1} name`}
                  value={room.name}
                  onChange={(event) => setRoom(room.key, { name: event.target.value })}
                  maxLength={30}
                  autoComplete="off"
                  placeholder="Big room"
                />
                <Input
                  label="Room's rent each month (£)"
                  value={room.rent}
                  onChange={(event) => setRoom(room.key, { rent: event.target.value })}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                />
                <fieldset className="flex flex-col">
                  <legend className="label-caps text-muted">Who lives here?</legend>
                  {people.map((person) => (
                    <Tick
                      key={person.profileId}
                      label={person.displayName}
                      checked={room.occupants.includes(person.profileId)}
                      onChange={(on) => toggleOccupant(room.key, person.profileId, on)}
                    />
                  ))}
                </fieldset>
                {values.rooms.length > 1 ? (
                  <div>
                    <Button
                      variant="ghost"
                      onClick={() => set({ rooms: values.rooms.filter((r) => r.key !== room.key) })}
                    >
                      Remove this room
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                onClick={() =>
                  set({
                    rooms: [
                      ...values.rooms,
                      { key: `room-${Date.now()}`, name: "", rent: "", occupants: [] },
                    ],
                  })
                }
              >
                Add a room
              </Button>
            </div>
          </div>

          {unplaced.length > 0 ? (
            <p className="text-muted text-sm">
              Not in a room, so not charged rent: {unplaced.map((p) => p.displayName).join(", ")}.
            </p>
          ) : null}

          {built.ok && built.summary.amounts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="label-caps text-muted">What each person will pay</p>
              <ul className="divide-line divide-y">
                {built.summary.amounts.map((amount) => (
                  <li
                    key={amount.profileId}
                    className="flex min-h-11 items-center justify-between gap-4 py-2"
                  >
                    <span>
                      {nameOf(amount.profileId)}
                      {amount.profileId === values.collectorId ? " (collects)" : ""}
                    </span>
                    <span className="flex items-center gap-3">
                      <label className="sr-only" htmlFor={`custom-${amount.profileId}`}>
                        Custom amount for {nameOf(amount.profileId)}
                      </label>
                      <input
                        id={`custom-${amount.profileId}`}
                        value={values.custom[amount.profileId] ?? ""}
                        onChange={(event) =>
                          set({
                            custom: { ...values.custom, [amount.profileId]: event.target.value },
                          })
                        }
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="custom £"
                        className="border-line placeholder:text-muted w-24 border-0 border-b bg-transparent text-right text-sm"
                      />
                      <span>{formatPence(amount.pence)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-muted text-sm">
                The person who collects the rent is not charged. Typing a custom amount replaces the
                room&rsquo;s share for that person.
              </p>
            </div>
          ) : null}
        </>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="label-caps text-muted">Which months?</legend>
        <div className="grid grid-cols-4 gap-2">
          {MONTH_SHORT.map((label, index) => {
            const month = index + 1;
            const on = values.months.includes(month);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set({
                    months: on
                      ? values.months.filter((m) => m !== month)
                      : [...values.months, month].sort((a, b) => a - b),
                  })
                }
                className={`label-caps min-h-11 border px-2 ${on ? "bg-ink text-paper border-ink" : "border-line text-muted"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-muted text-sm">
          Nothing is created in a month that is not ticked (council tax is often 10 months).
        </p>
      </fieldset>

      {templateId ? (
        <p className="text-muted text-sm">
          Changes affect future months only. Months that have already been created stay as they are.
        </p>
      ) : null}

      {built.ok && describeTotal(built.summary) ? (
        <p className="text-muted" aria-live="polite">
          {describeTotal(built.summary)}
        </p>
      ) : null}
      {!built.ok ? (
        <p className="text-muted text-sm" aria-live="polite">
          {built.message}
        </p>
      ) : null}

      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || !built.ok}>
          {pending
            ? "Saving"
            : templateId
              ? "Save changes"
              : values.kind === "rent"
                ? "Set up rent"
                : "Add bill"}
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
