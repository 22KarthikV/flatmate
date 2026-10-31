import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { addDays } from "@/features/bins/collections";
import { getNextBinDays } from "@/features/bins/summary";
import { getPinnedPost } from "@/features/board/summary";
import { getEvents } from "@/features/events/events";
import { getFixSummary } from "@/features/fixes/summary";
import { getMembership } from "@/features/household/membership";
import { londonToday } from "@/features/ledger/form";
import { getShoppingItems } from "@/features/shopping/items";
import { logger } from "@/lib/logger";

import { eventLines, extrasLines, type HomeLine } from "./extras-lines";
import { HomeBlock } from "./home-block";

function LinesCard({ id, label, lines }: { id: string; label: string; lines: HomeLine[] }) {
  if (lines.length === 0) return null;
  return (
    <Card aria-labelledby={id}>
      <CardLabel id={id}>{label}</CardLabel>
      <ul className="mt-3 flex flex-col">
        {lines.map((line) => (
          <li key={line.key}>
            <Link
              href={line.href}
              className="border-line flex min-h-11 items-center border-t py-3 break-words underline-offset-4 first:border-t-0 hover:underline"
            >
              {line.text}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A part that cannot be read is left out and logged; the rest of the card still shows. */
async function part<T>(name: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    logger.error(`home.extras_${name}_failed`, { error });
    return fallback;
  }
}

async function loadEvents(): Promise<HomeLine[]> {
  return eventLines(await getEvents(), new Date());
}

async function loadExtras(): Promise<HomeLine[]> {
  const membership = await getMembership();
  if (!membership) return [];
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const tomorrow = addDays(londonToday(), 1);

  const [shoppingOpen, binsTomorrow, fix, pinned] = await Promise.all([
    part("shopping", async () => (await getShoppingItems()).filter((i) => !i.boughtAt).length, 0),
    part(
      "bins",
      async () => (await getNextBinDays(20)).filter((c) => c.date === tomorrow).map((c) => c.name),
      [] as string[],
    ),
    part("fixes", () => getFixSummary({ profileId: membership.profileId, isAdmin }), null),
    part("pinned", () => getPinnedPost(), null),
  ]);

  return extrasLines(
    { shoppingOpen, binsTomorrow, fixCount: fix?.count ?? null, pinned: pinned?.text ?? null },
    new Date(),
  );
}

export { LinesCard };

/** Events to vote on and the next confirmed one. Hidden when there is nothing to say. */
export function EventsBlock() {
  return (
    <HomeBlock name="events" load={loadEvents}>
      {(lines) => <LinesCard id="home-events" label="Events" lines={lines} />}
    </HomeBlock>
  );
}

/** Shopping, bins, open problems and the pinned note. Hidden when there is nothing to say. */
export function ExtrasBlock() {
  return (
    <HomeBlock name="extras" load={loadExtras}>
      {(lines) => <LinesCard id="home-extras" label="Around the flat" lines={lines} />}
    </HomeBlock>
  );
}
