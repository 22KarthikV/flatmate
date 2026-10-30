import Link from "next/link";

import { formatDay } from "@/features/ledger/format";
import { formatPence } from "@/features/ledger/money";

import { instanceStatusLabel, monthLabel } from "./format";
import type { BillMonth } from "./months";

/** One bill month: what is due, what it came to, and who shares it. */
export function MonthCard({ month, viewerId }: { month: BillMonth; viewerId: string }) {
  const waiting = month.status === "awaiting_amount";
  const mine = waiting && month.payerId === viewerId;

  return (
    <article
      aria-label={`${month.name}, ${monthLabel(month.dueOn)}`}
      className="flex flex-col gap-3 py-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className={month.voided ? "text-muted line-through" : undefined}>{month.name}</h3>
          <p className="text-muted text-sm">
            {monthLabel(month.dueOn)} · due {formatDay(month.dueOn)} ·{" "}
            {month.payerId === viewerId ? "You pay" : `${month.payerName} pays`}
          </p>
        </div>
        <p className={month.voided ? "text-muted line-through" : undefined}>
          {month.amountPence !== null
            ? formatPence(month.amountPence)
            : instanceStatusLabel(month.status)}
        </p>
      </div>

      {mine ? (
        <Link
          href={`/money/recurring/instances/${month.id}/amount`}
          className="label-caps bg-ink text-paper inline-flex min-h-11 items-center justify-center self-start px-6 hover:opacity-85"
        >
          Enter this month&rsquo;s amount
        </Link>
      ) : waiting ? (
        <p className="text-muted text-sm">{month.payerName} will enter the amount.</p>
      ) : null}

      {month.sharers.length > 0 ? (
        <p className="text-muted text-sm">
          Shared: {month.sharers.map((s) => `${s.displayName} ${formatPence(s.pence)}`).join(", ")}
        </p>
      ) : null}

      {month.expenseId ? (
        <Link
          href={`/money/expenses/${month.expenseId}`}
          className="text-muted inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4"
        >
          See it in Money
        </Link>
      ) : null}
    </article>
  );
}
