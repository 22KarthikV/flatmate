import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { SwapRequests } from "@/features/rota/swap-requests";
import { getPendingSwaps } from "@/features/rota/swaps";
import { WeekView } from "@/features/rota/week-view";
import { currentWeekStart, londonDate, upcomingWeekStart } from "@/features/rota/week";
import { getWeeks } from "@/features/rota/weeks";

export const metadata = { title: "Rota | FlatMate" };

const linkClass =
  "label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4";

async function RotaContent() {
  const membership = await getMembership();
  if (!membership) return null;

  const now = new Date();
  const today = londonDate(now);
  const thisWeek = currentWeekStart(now);
  const nextWeek = upcomingWeekStart(now);
  const [weeks, swaps] = await Promise.all([getWeeks([thisWeek, nextWeek]), getPendingSwaps()]);
  const current = weeks.find((week) => week.weekStart === thisWeek);
  const upcoming = weeks.find((week) => week.weekStart === nextWeek);
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Chores</p>
        <h1 className="font-display text-5xl sm:text-6xl">Rota</h1>
        <p className="text-muted max-w-md">
          A fair share of the work, with the reason for every chore.
        </p>
        <nav aria-label="Rota" className="flex flex-wrap gap-x-6">
          <Link href="/rota/availability" className={linkClass}>
            Which days are you around?
          </Link>
          <Link href="/rota/chores" className={linkClass}>
            {isAdmin ? "Edit chores" : "Chores and steps"}
          </Link>
        </nav>
      </header>

      <SwapRequests swaps={swaps} viewerId={membership.profileId} today={today} />

      {current ? (
        <WeekView title="This week" week={current} viewerId={membership.profileId} today={today} />
      ) : null}
      {upcoming ? (
        <WeekView title="Next week" week={upcoming} viewerId={membership.profileId} today={today} />
      ) : null}

      {!current && !upcoming ? (
        <Card>
          <CardLabel>No rota yet</CardLabel>
          <p className="mt-3 max-w-md">
            {isAdmin
              ? "Add the chores, ask everyone which days they are around, and the rota builds itself shortly after the deadline. You can also give out a week now from Edit chores."
              : "Say which days you are around next week. The rota is built shortly after the deadline on Saturday evening."}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default function RotaPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <RotaContent />
      </RequireFlat>
    </Suspense>
  );
}
