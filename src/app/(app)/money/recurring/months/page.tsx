import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { monthLabel } from "@/features/recurring/format";
import { MonthCard } from "@/features/recurring/month-card";
import { getBillMonths } from "@/features/recurring/months";

export const metadata = { title: "Bill history | FlatMate" };

async function MonthsContent() {
  const membership = await getMembership();
  if (!membership) return null;

  const months = await getBillMonths();
  const groups = new Map<string, typeof months>();
  for (const month of months) {
    const key = monthLabel(month.dueOn);
    groups.set(key, [...(groups.get(key) ?? []), month]);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money/recurring"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Rent and bills
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Bill history</h1>
        <p className="text-muted max-w-md">
          Each month&rsquo;s bills: what was due and who shared it. Who has paid the supplier is
          arranged outside the app.
        </p>
      </header>

      {months.length === 0 ? (
        <Card>
          <CardLabel>Months</CardLabel>
          <p className="text-muted mt-3 max-w-md text-sm">
            No months yet. They appear here once a bill has been created.
          </p>
        </Card>
      ) : (
        [...groups.entries()].map(([label, items]) => (
          <Card key={label}>
            <CardLabel>{label}</CardLabel>
            <div className="divide-line mt-2 divide-y">
              {items.map((month) => (
                <MonthCard key={month.id} month={month} viewerId={membership.profileId} />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

export default function BillMonthsPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <MonthsContent />
      </RequireFlat>
    </Suspense>
  );
}
