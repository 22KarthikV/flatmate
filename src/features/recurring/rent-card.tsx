import Link from "next/link";

import { formatDay } from "@/features/ledger/format";
import { formatPence } from "@/features/ledger/money";

import { monthLabel } from "./format";
import { CancelRentButton } from "./rent-buttons";
import { rentStatusLabel, totalOwed, type MyRentRow, type RentPaymentRow } from "./rent-status";

/**
 * "Your rent": the viewer's own months, what they owe, and the button to say they paid. It is
 * given only the viewer's own rows (they come from a function that cannot return anyone else's),
 * and it never mentions the room, a roommate, or the rent total.
 */
export function RentCard({
  rows,
  pending,
}: {
  rows: MyRentRow[];
  /** The viewer's own payments that are waiting to be confirmed. */
  pending: RentPaymentRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted max-w-md text-sm">
        You have no rent to pay. If your flat has set up rent, you will be told your amount each
        month, a week before it is due.
      </p>
    );
  }

  const owed = totalOwed(rows);
  const latest = rows.slice(0, 3);
  const collector = rows[0].collectorName;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="font-display text-5xl">{formatPence(owed)}</p>
        <p className="text-muted text-sm">
          {owed > 0
            ? `still to pay to ${collector}`
            : pending.length > 0
              ? "paid, waiting to be confirmed"
              : "You are all paid up."}
        </p>
      </div>

      <ul className="divide-line divide-y">
        {latest.map((row) => (
          <li key={row.chargeId} className="flex flex-col gap-1 py-3">
            <div className="flex items-start justify-between gap-4">
              <span>{monthLabel(row.period)}</span>
              <span>{formatPence(row.amountPence)}</span>
            </div>
            <p className="text-muted text-sm">
              Due {formatDay(row.dueOn)} · {rentStatusLabel(row.status)}
              {row.status === "part_paid"
                ? ` · ${formatPence(row.outstandingPence)} still to pay`
                : ""}
            </p>
          </li>
        ))}
      </ul>

      {pending.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="label-caps text-muted">Waiting to be confirmed</p>
          {pending.map((payment) => (
            <div key={payment.id} className="flex flex-col gap-2">
              <p>
                You said you paid {formatPence(payment.amountPence)}. {collector} or an admin has to
                confirm it.
              </p>
              <CancelRentButton paymentId={payment.id} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        {owed > 0 ? (
          <Link
            href="/money/rent/pay"
            className="label-caps bg-ink text-paper inline-flex min-h-11 items-center justify-center px-6 hover:opacity-85"
          >
            I paid my rent
          </Link>
        ) : null}
        <Link
          href="/money/rent/history"
          className="text-muted inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          Your rent history
        </Link>
      </div>
    </div>
  );
}
