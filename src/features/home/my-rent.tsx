import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { londonDate } from "@/features/rota/week";
import { getMyRent } from "@/features/recurring/rent";

import { HomeBlock } from "./home-block";
import { thisMonthsRent, type RentSummary } from "./rent";

/** `{ rent: null }` rather than null, so "no rent set up" is not mistaken for a failed read. */
async function loadRent(): Promise<{ rent: RentSummary | null }> {
  // getMyRent calls my_rent(), which returns only the caller's own rows.
  return { rent: thisMonthsRent(await getMyRent(), londonDate(new Date())) };
}

export function RentCard({ rent }: { rent: RentSummary }) {
  return (
    <Card aria-labelledby="home-rent">
      <CardLabel id="home-rent">Your rent</CardLabel>
      <Link
        href="/money/rent"
        className="mt-3 flex min-h-11 flex-col justify-center underline-offset-4 hover:underline"
      >
        <span className="text-lg">
          {rent.amount} due {rent.dueOn}
        </span>
        <span className="text-muted text-sm">
          {rent.statusText} &middot; pay {rent.payTo}
        </span>
      </Link>
    </Card>
  );
}

/** The viewer's own rent for this month. Hidden when none is set up. */
export function MyRent() {
  return (
    <HomeBlock name="rent" load={loadRent} height="min-h-20">
      {({ rent }) => (rent ? <RentCard rent={rent} /> : null)}
    </HomeBlock>
  );
}
