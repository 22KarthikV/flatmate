"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPence, parsePounds } from "@/features/ledger/money";

import { recordRentPayment } from "./actions";
import type { RecurringFormState } from "./constants";

const initialState: RecurringFormState = { status: "idle" };

/**
 * "I paid my rent": an amount from 1p up to what is still owed. The collector or an admin confirms
 * it before it counts, so nothing changes until they do.
 */
export function RentPayForm({
  owedPence,
  collectorName,
}: {
  owedPence: number;
  collectorName: string;
}) {
  const [state, formAction, pending] = useActionState(recordRentPayment, initialState);
  const [amount, setAmount] = useState((owedPence / 100).toFixed(2));

  const parsed = amount.trim() === "" ? null : parsePounds(amount);
  const tooMuch = parsed?.ok === true && parsed.pence > owedPence;
  const message =
    parsed && !parsed.ok
      ? parsed.message
      : tooMuch
        ? `That is more than you still owe (${formatPence(owedPence)}).`
        : null;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Input
        label="Amount you paid (£)"
        name="amount"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="decimal"
        autoComplete="off"
        required
        hint={`You owe ${formatPence(owedPence)}. ${collectorName} or an admin has to confirm they received it before it counts.`}
      />
      {message ? (
        <p role="alert" className="text-negative text-sm">
          {message}
        </p>
      ) : null}
      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || !parsed?.ok || tooMuch}>
          {pending ? "Saving" : "I paid my rent"}
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
