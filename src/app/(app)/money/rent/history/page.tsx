import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { formatDay } from "@/features/ledger/format";
import { formatPence } from "@/features/ledger/money";
import { monthLabel } from "@/features/recurring/format";
import { getMyRent, getRentDashboard, getRentPeriods } from "@/features/recurring/rent";
import { rentStatusLabel } from "@/features/recurring/rent-status";

export const metadata = { title: "Rent history | FlatMate" };

async function HistoryContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  const mine = await getMyRent();
  // Admins also see everyone's, month by month (the same function the collector's screen uses).
  const periods = isAdmin ? (await getRentPeriods()).slice(0, 12) : [];
  const months = await Promise.all(
    periods.map(async (period) => ({ period, rows: await getRentDashboard(period) })),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money/rent"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Your rent
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Rent history</h1>
        <p className="text-muted max-w-md">
          {isAdmin
            ? "Your own rent first, then everyone's by month. Members see only their own."
            : "Each month of your own rent. Only you can see this."}
        </p>
      </header>

      <Card>
        <CardLabel>Your rent</CardLabel>
        {mine.length === 0 ? (
          <p className="text-muted mt-3 max-w-md text-sm">
            You have not been charged any rent yet.
          </p>
        ) : (
          <ul className="divide-line mt-2 divide-y">
            {mine.map((row) => (
              <li key={row.chargeId} className="flex flex-col gap-1 py-3">
                <div className="flex items-start justify-between gap-4">
                  <span>{monthLabel(row.period)}</span>
                  <span>{formatPence(row.amountPence)}</span>
                </div>
                <p className="text-muted text-sm">
                  Due {formatDay(row.dueOn)} · {rentStatusLabel(row.status)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {months.map(({ period, rows }) => (
        <Card key={period}>
          <CardLabel>Everyone · {monthLabel(period)}</CardLabel>
          <ul className="divide-line mt-2 divide-y">
            {rows.map((row) => (
              <li key={row.chargeId} className="flex flex-col gap-1 py-3">
                <div className="flex items-start justify-between gap-4">
                  <span>
                    {row.displayName}
                    {row.stillInFlat ? "" : " (left)"}
                  </span>
                  <span>{formatPence(row.amountPence)}</span>
                </div>
                <p className="text-muted text-sm">
                  {rentStatusLabel(row.status)}
                  {!row.stillInFlat && row.outstandingPence > 0 ? " · left, unpaid" : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default function RentHistoryPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <HistoryContent />
      </RequireFlat>
    </Suspense>
  );
}
