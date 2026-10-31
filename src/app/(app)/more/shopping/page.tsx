import Link from "next/link";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { AddItemForm } from "@/features/shopping/add-item-form";
import { getShoppingItems } from "@/features/shopping/items";
import { ShoppingList } from "@/features/shopping/shopping-list";

export const metadata = { title: "Shopping list | FlatMate" };

async function ShoppingContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const items = await getShoppingItems();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/more"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          More
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Shopping list</h1>
        <p className="text-muted max-w-md">One list for everyone in {membership.householdName}.</p>
      </header>
      <Card>
        <AddItemForm />
      </Card>
      <ShoppingList
        items={items}
        viewerId={membership.profileId}
        isAdmin={membership.role === "owner" || membership.role === "admin"}
      />
    </div>
  );
}

export default function ShoppingPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <ShoppingContent />
      </RequireFlat>
    </Suspense>
  );
}
