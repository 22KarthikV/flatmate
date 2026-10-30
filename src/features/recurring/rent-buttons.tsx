"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  cancelRentPayment,
  confirmRentPayment,
  declineRentPayment,
  voidRentPayment,
} from "./actions";
import type { RecurringFormState } from "./constants";

const initialState: RecurringFormState = { status: "idle" };

function ErrorLine({ state }: { state: RecurringFormState }) {
  return state.status === "error" ? (
    <p role="alert" className="text-negative text-sm">
      {state.message}
    </p>
  ) : null;
}

/** For the collector or an admin: confirm the rent arrived, or say it did not. */
export function DecideRentButtons({ paymentId }: { paymentId: string }) {
  const [confirmed, confirmAction, confirming] = useActionState(confirmRentPayment, initialState);
  const [declined, declineAction, declining] = useActionState(declineRentPayment, initialState);
  const busy = confirming || declining;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <form action={confirmAction}>
          <input type="hidden" name="paymentId" value={paymentId} />
          <Button type="submit" disabled={busy}>
            {confirming ? "Confirming" : "Confirm"}
          </Button>
        </form>
        <form action={declineAction}>
          <input type="hidden" name="paymentId" value={paymentId} />
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
export function CancelRentButton({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(cancelRentPayment, initialState);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <div>
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? "Cancelling" : "Cancel payment"}
        </Button>
      </div>
      <ErrorLine state={state} />
    </form>
  );
}

/** For an admin: undo a confirmation made by mistake. */
export function VoidRentButton({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(voidRentPayment, initialState);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <div>
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? "Reversing" : "Reverse"}
        </Button>
      </div>
      <ErrorLine state={state} />
    </form>
  );
}
