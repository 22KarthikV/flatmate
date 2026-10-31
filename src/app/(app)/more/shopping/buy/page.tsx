import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { ExpenseForm } from "@/features/ledger/expense-form";
import { londonToday } from "@/features/ledger/form";
import { buyItems } from "@/features/shopping/actions";
import { shoppingDescription } from "@/features/shopping/expense-description";
import { getShoppingItems } from "@/features/shopping/items";
import { selectBuyable } from "@/features/shopping/list";
import { parseItemIds } from "@/features/shopping/schemas";

export const metadata = { title: "Shopping expense | FlatMate" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function BuyContent({ searchParams }: { searchParams: SearchParams }) {
  const membership = await getMembership();
  if (!membership) return null;

  const raw = (await searchParams).items;
  const requested = parseItemIds(Array.isArray(raw) ? raw[0] : raw);
  const items = selectBuyable(requested, await getShoppingItems());
  if (items.length === 0) redirect("/more/shopping");

  const members = await getMembers();
  const people = members.map(({ profileId, displayName }) => ({ profileId, displayName }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/more/shopping"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Shopping list
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Turn into an expense</h1>
        <p className="text-muted max-w-md">
          {items.length} {items.length === 1 ? "thing" : "things"} bought. Type the total; it is
          split equally unless you change it.
        </p>
      </header>
      <Card>
        <ExpenseForm
          people={people}
          viewerId={membership.profileId}
          today={londonToday()}
          action={buyItems}
          hidden={{ itemIds: items.map((item) => item.id).join(",") }}
          initial={{
            description: shoppingDescription(items.map((item) => item.name)),
            category: "groceries",
          }}
        />
      </Card>
    </div>
  );
}

export default function BuyPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <BuyContent searchParams={searchParams} />
      </RequireFlat>
    </Suspense>
  );
}
