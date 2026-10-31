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

/**
 * The rent to show: the earliest month still not paid (which can be next month, as rent is created
 * a week ahead, or an older one still owing), else this month's paid row, else null.
 */
export function thisMonthsRent(rows: readonly MyRentRow[], today: string): RentSummary | null {
  const unpaid = rows
    .filter((r) => r.status !== "paid")
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const row = unpaid[0] ?? rows.find((r) => r.period.slice(0, 7) === today.slice(0, 7));
  if (!row) return null;
  return {
    amount: formatPence(row.amountPence),
    dueOn: shortDay(row.dueOn),
    payTo: row.collectorName,
    statusText: rentStatusLabel(row.status),
    paid: row.status === "paid",
  };
}
