import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { londonToday } from "@/features/ledger/form";
import { addDays } from "@/features/recurring/dates";
import { ordinal } from "@/features/recurring/format";
import { MonthCard } from "@/features/recurring/month-card";
import { getBillMonths } from "@/features/recurring/months";
import { TemplateList } from "@/features/recurring/template-list";
import { getBillTemplates, getRentTemplates } from "@/features/recurring/templates";

export const metadata = { title: "Rent and bills | FlatMate" };

/** Months due within this window are "this month" on the screen; older ones live in the history. */
const RECENT_DAYS = 45;

async function RecurringContent() {
  const membership = await getMembership();
  if (!membership) return null;

  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const [months, templates, rents] = await Promise.all([
    getBillMonths(40),
    getBillTemplates(),
    isAdmin ? getRentTemplates() : Promise.resolve([]),
  ]);
  const cutoff = addDays(londonToday(), -RECENT_DAYS);
  const recent = months.filter(
    (month) => month.dueOn >= cutoff || month.status === "awaiting_amount",
  );
  const yours = recent.filter(
    (month) => month.status === "awaiting_amount" && month.payerId === membership.profileId,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Money
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Rent and bills</h1>
        <p className="text-muted max-w-md">
          Monthly bills for {membership.householdName}. Each one is created by itself on its due
          date and appears in Money like any other expense.
        </p>
      </header>

      {isAdmin ? (
        <Card>
          <CardLabel>Rent</CardLabel>
          <p className="text-muted mt-2 max-w-md text-sm">
            Only the owner, admins and the person who collects the rent see this. Everyone else sees
            only their own rent.
          </p>
          {rents.length === 0 ? (
            <p className="text-muted mt-3 max-w-md text-sm">
              Rent isn&rsquo;t set up yet. Add it by room, and each person is told their own amount
              every month.
            </p>
          ) : (
            <ul className="divide-line mt-2 divide-y">
              {rents.map((rent) => (
                <li key={rent.id} className="py-1">
                  <Link
                    href={`/money/recurring/${rent.id}`}
                    className="flex min-h-11 flex-wrap items-center justify-between gap-x-4"
                  >
                    <span>{rent.name}</span>
                    <span className="text-muted text-sm">
                      {rent.paused ? "Paused" : `Due on the ${ordinal(rent.dueDay)}`}
                      {rent.paidById === membership.profileId ? " · You collect" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/money/recurring/new"
            className="label-caps bg-ink text-paper mt-4 inline-flex min-h-11 items-center justify-center px-6 hover:opacity-85"
          >
            Add rent or a bill
          </Link>
        </Card>
      ) : null}

      {yours.length > 0 ? (
        <Card>
          <CardLabel>Needs your amount</CardLabel>
          <div className="divide-line mt-2 divide-y">
            {yours.map((month) => (
              <MonthCard key={month.id} month={month} viewerId={membership.profileId} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardLabel>This month and next</CardLabel>
        {recent.length === 0 ? (
          <p className="text-muted mt-3 max-w-md text-sm">
            Nothing has been created recently. Bills appear a week before they are due, or two weeks
            before when the amount changes each month.
          </p>
        ) : (
          <div className="divide-line mt-2 divide-y">
            {recent
              .filter((month) => !yours.includes(month))
              .map((month) => (
                <MonthCard key={month.id} month={month} viewerId={membership.profileId} />
              ))}
          </div>
        )}
        <Link
          href="/money/recurring/months"
          className="text-muted mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          All months
        </Link>
      </Card>

      <Card>
        <CardLabel>Bills</CardLabel>
        <div className="mt-2">
          <TemplateList templates={templates} viewerId={membership.profileId} />
        </div>
      </Card>
    </div>
  );
}

export default function RecurringPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <RecurringContent />
      </RequireFlat>
    </Suspense>
  );
}
