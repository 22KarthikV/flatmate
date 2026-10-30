"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPence, parsePounds } from "@/features/ledger/money";

import { enterBillAmount } from "./actions";
import type { RecurringFormState } from "./constants";
import { splitBill } from "./shares";

const initialState: RecurringFormState = { status: "idle" };

export interface AmountSharer {
  profileId: string;
  displayName: string;
  /** Hundredths of a percent for a percentage bill; null for an equal one. */
  basisPoints: number | null;
}

/**
 * The payer types this month's amount, and sees each person's share before saving. The same
 * split code the monthly job's SQL is held to decides the numbers shown here.
 */
export function AmountForm({
  instanceId,
  billName,
  splitMode,
  sharers,
}: {
  instanceId: string;
  billName: string;
  splitMode: "equal" | "percent";
  sharers: AmountSharer[];
}) {
  const [state, formAction, pending] = useActionState(enterBillAmount, initialState);
  const [amount, setAmount] = useState("");

  const parsed = amount.trim() === "" ? null : parsePounds(amount);
  const preview =
    parsed?.ok === true && sharers.length > 0
      ? splitBill(
          splitMode === "equal"
            ? {
                mode: "equal",
                amountPence: parsed.pence,
                profileIds: sharers.map((s) => s.profileId),
              }
            : {
                mode: "percent",
                amountPence: parsed.pence,
                shares: sharers.map((s) => ({
                  profileId: s.profileId,
                  basisPoints: s.basisPoints ?? 0,
                })),
              },
        )
      : null;
  const pence = new Map(preview?.ok ? preview.shares.map((s) => [s.profileId, s.pence]) : []);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="instanceId" value={instanceId} />
      <Input
        label={`This month's ${billName} (£)`}
        name="amount"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        required
        hint="Type it as it appears on the bill or letter. You can enter it once."
      />

      {parsed && !parsed.ok ? (
        <p role="alert" className="text-negative text-sm">
          {parsed.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="label-caps text-muted">Shared between</p>
        {sharers.length === 0 ? (
          <p className="text-negative text-sm">
            Nobody is left to share this bill. Ask an admin to edit it.
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {sharers.map((sharer) => (
              <li
                key={sharer.profileId}
                className="flex min-h-11 items-center justify-between gap-4 py-2"
              >
                <span>{sharer.displayName}</span>
                <span className="text-muted">
                  {pence.has(sharer.profileId)
                    ? formatPence(pence.get(sharer.profileId) ?? 0)
                    : sharer.basisPoints !== null
                      ? `${sharer.basisPoints / 100}%`
                      : "Equal share"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-h-11 flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || sharers.length === 0}>
          {pending ? "Saving" : "Save amount"}
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
