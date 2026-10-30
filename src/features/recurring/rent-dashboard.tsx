import { formatDay } from "@/features/ledger/format";
import { formatPence } from "@/features/ledger/money";

import { monthLabel } from "./format";
import { DecideRentButtons, VoidRentButton } from "./rent-buttons";
import {
  rentStatusLabel,
  summariseMonth,
  type DashboardRow,
  type RentPaymentRow,
} from "./rent-status";
import { WaiveForm } from "./waive-form";

/**
 * "Who has paid", for the collector and admins: everyone's amount and status for a month, the
 * payments waiting to be confirmed, and the latest confirmed ones in case one needs reversing.
 * Members never see this screen's data: the database function behind it refuses them.
 */
export function RentDashboard({
  period,
  rows,
  pending,
  recent,
  viewerId,
}: {
  period: string;
  rows: DashboardRow[];
  pending: RentPaymentRow[];
  recent: RentPaymentRow[];
  viewerId: string;
}) {
  const summary = summariseMonth(rows);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted max-w-md text-sm">
        Only the owner, admins and the person who collects the rent see everyone&rsquo;s amounts.
        Each flatmate sees only their own.
      </p>

      {pending.length > 0 ? (
        <section aria-label="Payments to confirm" className="flex flex-col gap-4">
          <p className="label-caps text-muted">Waiting for you</p>
          {pending.map((payment) => (
            <div key={payment.id} className="flex flex-col gap-2">
              <p>
                {payment.payerName} says they paid {formatPence(payment.amountPence)}
              </p>
              {payment.payerId === viewerId ? (
                <p className="text-muted text-sm">Another admin has to confirm your own payment.</p>
              ) : (
                <DecideRentButtons paymentId={payment.id} />
              )}
            </div>
          ))}
        </section>
      ) : null}

      <section aria-label={`Rent for ${monthLabel(period)}`} className="flex flex-col gap-3">
        <p className="label-caps text-muted">{monthLabel(period)}</p>
        {rows.length === 0 ? (
          <p className="text-muted max-w-md text-sm">No rent was charged for this month.</p>
        ) : (
          <>
            <p className="text-sm">
              {formatPence(summary.paidPence)} of {formatPence(summary.duePence)} confirmed
              {summary.pendingPence > 0 ? `, ${formatPence(summary.pendingPence)} waiting` : ""}
              {summary.outstandingPence > 0
                ? `, ${formatPence(summary.outstandingPence)} still out`
                : ""}
              .
            </p>
            <ul className="divide-line divide-y">
              {rows.map((row) => (
                <li key={row.chargeId} className="flex flex-col gap-2 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <span>
                      {row.displayName}
                      {row.stillInFlat ? "" : " (left)"}
                    </span>
                    <span>{formatPence(row.amountPence)}</span>
                  </div>
                  <p className="text-muted text-sm">
                    {row.roomName ? `${row.roomName} · ` : ""}Due {formatDay(row.dueOn)} ·{" "}
                    {rentStatusLabel(row.status)}
                    {row.coveredPence > 0 && row.status !== "paid"
                      ? ` · ${formatPence(row.coveredPence)} confirmed`
                      : ""}
                    {!row.stillInFlat && row.outstandingPence > 0 ? " · left, unpaid" : ""}
                  </p>
                  {row.outstandingPence > 0 && row.profileId !== viewerId ? (
                    <WaiveForm
                      payerId={row.profileId}
                      payerName={row.displayName}
                      outstandingPence={row.outstandingPence}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {recent.length > 0 ? (
        <section aria-label="Recent confirmed payments" className="flex flex-col gap-3">
          <p className="label-caps text-muted">Recently confirmed</p>
          <ul className="divide-line divide-y">
            {recent.map((payment) => (
              <li key={payment.id} className="flex flex-col gap-1 py-3">
                <div className="flex items-start justify-between gap-4">
                  <span className={payment.voided ? "text-muted line-through" : undefined}>
                    {payment.payerName}
                    {payment.kind === "waiver" ? " (closed without payment)" : ""}
                  </span>
                  <span className={payment.voided ? "text-muted line-through" : undefined}>
                    {formatPence(payment.amountPence)}
                  </span>
                </div>
                {payment.voided ? (
                  <p className="text-muted text-sm">Reversed</p>
                ) : (
                  <VoidRentButton paymentId={payment.id} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
