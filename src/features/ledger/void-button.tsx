"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";

import { voidExpense } from "./actions";
import type { ExpenseFormState } from "./constants";

const initialState: ExpenseFormState = { status: "idle" };

/** Cancels an expense after one confirmation. It stays in the history and stops counting. */
export function VoidButton({ expenseId }: { expenseId: string }) {
  const [state, formAction, pending] = useActionState(voidExpense, initialState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
        Cancel this expense
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <p className="max-w-md text-sm">
        Cancel this expense? It stops counting towards anyone&rsquo;s balance, and everyone it
        involves is told. You can still see it in the history.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Cancelling" : "Yes, cancel it"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-negative text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
