"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { waiveRent } from "./actions";
import type { RecurringFormState } from "./constants";

const initialState: RecurringFormState = { status: "idle" };

/** An admin closes rent that will not be paid. A reason is required and kept. */
export function WaiveForm({
  payerId,
  payerName,
  outstandingPence,
}: {
  payerId: string;
  payerName: string;
  outstandingPence: number;
}) {
  const [state, formAction, pending] = useActionState(waiveRent, initialState);
  const [reason, setReason] = useState("");

  return (
    <details className="text-sm">
      <summary className="text-muted inline-flex min-h-11 cursor-pointer items-center underline underline-offset-4">
        Close it without payment
      </summary>
      <form action={formAction} className="mt-3 flex flex-col gap-4">
        <input type="hidden" name="payerId" value={payerId} />
        <Input
          label={`Amount to close for ${payerName} (£)`}
          name="amount"
          defaultValue={(outstandingPence / 100).toFixed(2)}
          inputMode="decimal"
          autoComplete="off"
          required
        />
        <Input
          label="Why? (kept on record)"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          autoComplete="off"
          required
        />
        <div className="flex min-h-11 flex-wrap items-center gap-4">
          <Button type="submit" variant="secondary" disabled={pending || reason.trim() === ""}>
            {pending ? "Saving" : "Close it"}
          </Button>
          {state.status === "error" ? (
            <p role="alert" className="text-negative text-sm">
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </details>
  );
}
