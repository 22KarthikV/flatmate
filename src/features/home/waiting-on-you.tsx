import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { getPendingSettlements } from "@/features/ledger/settlements";
import { getBillMonths } from "@/features/recurring/months";
import { getWeekAvailability } from "@/features/rota/availability";
import { statusFor } from "@/features/rota/availability-summary";
import { getPendingSwaps } from "@/features/rota/swaps";
import { upcomingWeekStart, windowState } from "@/features/rota/week";

import { HomeBlock } from "./home-block";
import { buildWaiting, type Waiting } from "./waiting";

const rowClass =
  "border-line flex min-h-11 items-center border-t py-3 underline-offset-4 first:border-t-0 hover:underline";

async function loadWaiting(): Promise<Waiting | null> {
  const membership = await getMembership();
  if (!membership) return null;
  const viewerId = membership.profileId;
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  const now = new Date();
  const weekStart = upcomingWeekStart(now);
  const windowOpen = windowState(now, weekStart) === "open";

  const [availability, settlements, bills, swaps] = await Promise.all([
    windowOpen ? getWeekAvailability(weekStart) : Promise.resolve(null),
    getPendingSettlements(viewerId, isAdmin),
    getBillMonths(),
    getPendingSwaps(),
  ]);

  const answered =
    availability !== null &&
    statusFor(availability.filter((row) => row.profileId === viewerId)) === "answered";

  return buildWaiting({
    availabilityOpen: windowOpen && !answered,
    payments: settlements.toConfirm.map((p) => ({ id: p.id, otherName: p.otherName })),
    bills: bills
      .filter((m) => m.status === "awaiting_amount" && m.payerId === viewerId && !m.voided)
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      .map((m) => ({ id: m.id, name: m.name, dueOn: m.dueOn })),
    swaps: swaps
      .filter((s) => s.toId === viewerId)
      .map((s) => ({ id: s.id, fromName: s.fromName, choreName: s.choreName })),
  });
}

export function WaitingList({ waiting }: { waiting: Waiting }) {
  if (waiting.items.length === 0) {
    return <p className="text-lg">Nothing needs you right now.</p>;
  }
  return (
    <ul className="flex flex-col">
      {waiting.items.map((item) => (
        <li key={item.key}>
          <Link href={item.href} className={rowClass}>
            {item.text}
          </Link>
        </li>
      ))}
      {waiting.more > 0 ? (
        <li>
          <Link href="/notifications" className={`${rowClass} text-muted`}>
            and {waiting.more} more
          </Link>
        </li>
      ) : null}
    </ul>
  );
}

/** What is waiting on the signed-in person, most urgent first. Only reads. */
export function WaitingOnYou() {
  return (
    <Card aria-labelledby="home-waiting">
      <CardLabel id="home-waiting">Waiting on you</CardLabel>
      <div className="mt-3">
        <HomeBlock name="waiting" load={loadWaiting} height="min-h-16">
          {(waiting) => <WaitingList waiting={waiting} />}
        </HomeBlock>
      </div>
    </Card>
  );
}
