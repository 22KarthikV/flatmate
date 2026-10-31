// Pure: this month's rent for the viewer. The rows come only from my_rent(), so they are the
// viewer's own; nothing here can reach anyone else's.

import { formatPence } from "@/features/ledger/money";
import { shortDay } from "@/features/recurring/format";
import { rentStatusLabel, type MyRentRow } from "@/features/recurring/rent-status";

export interface RentSummary {
  amount: string;
  dueOn: string;
  payTo: string;
  statusText: string;
  paid: boolean;
}

/** The row for the month `today` falls in, or null when no rent is set up. */
export function thisMonthsRent(rows: readonly MyRentRow[], today: string): RentSummary | null {
  const row = rows.find((r) => r.period.slice(0, 7) === today.slice(0, 7));
  if (!row) return null;
  return {
    amount: formatPence(row.amountPence),
    dueOn: shortDay(row.dueOn),
    payTo: row.collectorName,
    statusText: rentStatusLabel(row.status),
    paid: row.status === "paid",
  };
}
