import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { RentCard } from "@/features/recurring/rent-card";
import { RentDashboard } from "@/features/recurring/rent-dashboard";
import {
  getMyRent,
  getPendingRentPayments,
  getRecentConfirmedPayments,
  getRentDashboard,
  getRentPeriods,
} from "@/features/recurring/rent";

export const metadata = { title: "Your rent | FlatMate" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function RentContent({ searchParams }: { searchParams: SearchParams }) {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  const [mine, pending, params] = await Promise.all([
    getMyRent(),
    getPendingRentPayments(),
    searchParams,
  ]);
  const myPending = pending.filter((payment) => payment.payerId === membership.profileId);

  // Admins and the collector also see everyone's rent for a month. Anyone else never asks for it.
  let dashboard: React.ReactNode = null;
  if (isAdmin) {
    const [periods, recent] = await Promise.all([getRentPeriods(), getRecentConfirmedPayments()]);
    const asked = typeof params.period === "string" ? params.period : null;
    const period = asked && periods.includes(asked) ? asked : (periods[0] ?? null);
    const rows = period ? await getRentDashboard(period) : [];
    dashboard = (
      <Card>
        <CardLabel>Who has paid</CardLabel>
        <div className="mt-4 flex flex-col gap-6">
          {periods.length > 1 ? (
            <nav aria-label="Months" className="flex flex-wrap gap-2">
              {periods.slice(0, 6).map((p) => (
                <Link
                  key={p}
                  href={`/money/rent?period=${p}`}
                  aria-current={p === period ? "page" : undefined}
                  className={`label-caps inline-flex min-h-11 items-center border px-3 ${
                    p === period ? "bg-ink text-paper border-ink" : "border-line text-muted"
                  }`}
                >
                  {p.slice(0, 7)}
                </Link>
              ))}
            </nav>
          ) : null}
          {period ? (
            <RentDashboard
              period={period}
              rows={rows}
              pending={pending}
              recent={recent}
              viewerId={membership.profileId}
            />
          ) : (
            <p className="text-muted max-w-md text-sm">
              No rent has been charged yet. Set it up under{" "}
              <Link href="/money/recurring" className="underline underline-offset-4">
                Rent and bills
              </Link>
              .
            </p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Money
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Your rent</h1>
        <p className="text-muted max-w-md">
          Only you can see this. Your flatmates can&rsquo;t see what you pay.
        </p>
      </header>

      <Card>
        <CardLabel>What you owe</CardLabel>
        <div className="mt-4">
          <RentCard rows={mine} pending={myPending} />
        </div>
      </Card>

      {dashboard}
    </div>
  );
}

export default function RentPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <RentContent searchParams={searchParams} />
      </RequireFlat>
    </Suspense>
  );
}
