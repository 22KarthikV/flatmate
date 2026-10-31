import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";
import { getBillMonths } from "@/features/recurring/months";

import { buildComingUp, type ComingUpItem } from "./coming-up";
import { HomeBlock } from "./home-block";

async function loadComingUp(): Promise<ComingUpItem[]> {
  const bills = await getBillMonths();
  return buildComingUp(
    bills.map((b) => ({
      id: b.id,
      name: b.name,
      dueOn: b.dueOn,
      status: b.status,
      voided: b.voided,
    })),
    new Date(),
  );
}

export function ComingUpList({ items }: { items: ComingUpItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card aria-labelledby="home-coming-up">
      <CardLabel id="home-coming-up">Coming up</CardLabel>
      <ul className="mt-3 flex flex-col">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="border-line flex min-h-11 items-center border-t py-3 underline-offset-4 first:border-t-0 hover:underline"
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Bills due in the next 14 days and the next rota deadline. Only dates, never amounts. */
export function ComingUp() {
  return (
    <HomeBlock name="coming_up" load={loadComingUp}>
      {(items) => <ComingUpList items={items} />}
    </HomeBlock>
  );
}
