import { Card, CardLabel } from "@/components/ui/card";

import { formatDay } from "./format";
import { formatPence } from "./money";
import type { PendingSettlements } from "./settlements";
import { CancelPaymentButton, ConfirmButtons } from "./settlement-buttons";

/** Payments waiting for a decision: the ones you must confirm first, then the ones you sent. */
export function PendingSettlementsCard({ pending }: { pending: PendingSettlements }) {
  if (pending.toConfirm.length === 0 && pending.sent.length === 0) return null;

  return (
    <Card>
      <CardLabel>Payments to deal with</CardLabel>

      {pending.toConfirm.length > 0 ? (
        <ul className="divide-line mt-3 divide-y">
          {pending.toConfirm.map((payment) => (
            <li key={payment.id} className="flex flex-col gap-3 py-4">
              <div className="flex flex-col gap-1">
                <span>
                  {payment.otherName} says they paid you {formatPence(payment.amountPence)}
                </span>
                <span className="text-muted text-sm">
                  {formatDay(payment.createdAt.slice(0, 10))}. It only counts once you confirm it
                  arrived.
                </span>
              </div>
              <ConfirmButtons settlementId={payment.id} />
            </li>
          ))}
        </ul>
      ) : null}

      {pending.sent.length > 0 ? (
        <ul className="divide-line mt-3 divide-y">
          {pending.sent.map((payment) => (
            <li key={payment.id} className="flex flex-col gap-2 py-4">
              <div className="flex flex-col gap-1">
                <span>
                  You paid {payment.otherName} {formatPence(payment.amountPence)}
                </span>
                <span className="text-muted text-sm">
                  Waiting for {payment.otherName} to confirm. It doesn&rsquo;t count until they do.
                </span>
              </div>
              <CancelPaymentButton settlementId={payment.id} />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
