"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { cancelSettlement, confirmSettlement, declineSettlement } from "./actions";
import type { ExpenseFormState } from "./constants";

const initialState: ExpenseFormState = { status: "idle" };

function ErrorLine({ state }: { state: ExpenseFormState }) {
  return state.status === "error" ? (
    <p role="alert" className="text-negative text-sm">
      {state.message}
    </p>
  ) : null;
}

/** For the person who was paid: confirm it arrived, or say it did not. */
export function ConfirmButtons({ settlementId }: { settlementId: string }) {
  const [confirmed, confirmAction, confirming] = useActionState(confirmSettlement, initialState);
  const [declined, declineAction, declining] = useActionState(declineSettlement, initialState);
  const busy = confirming || declining;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <form action={confirmAction}>
          <input type="hidden" name="settlementId" value={settlementId} />
          <Button type="submit" disabled={busy}>
            {confirming ? "Confirming" : "Confirm"}
          </Button>
        </form>
        <form action={declineAction}>
          <input type="hidden" name="settlementId" value={settlementId} />
          <Button type="submit" variant="secondary" disabled={busy}>
            {declining ? "Saving" : "Didn’t arrive"}
          </Button>
        </form>
      </div>
      <ErrorLine state={confirmed} />
      <ErrorLine state={declined} />
    </div>
  );
}

/** For the person who paid: take it back while it is still waiting. */
export function CancelPaymentButton({ settlementId }: { settlementId: string }) {
  const [state, action, pending] = useActionState(cancelSettlement, initialState);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="settlementId" value={settlementId} />
      <div>
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? "Cancelling" : "Cancel payment"}
        </Button>
      </div>
      <ErrorLine state={state} />
    </form>
  );
}
