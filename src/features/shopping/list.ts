// Pure helpers for the list screen, free of server-only imports.

export interface ShoppingItem {
  id: string;
  name: string;
  note: string | null;
  addedBy: string;
  addedByName: string;
  createdAt: string;
  boughtAt: string | null;
  boughtByName: string | null;
  expenseId: string | null;
  clearedAt: string | null;
}

export interface ItemGroups {
  /** Still to buy, newest first. */
  open: ShoppingItem[];
  /** Ticked, not yet in an expense. */
  bought: ShoppingItem[];
  /** Part of an expense, with its link. */
  inExpense: ShoppingItem[];
}

const newestFirst = (a: ShoppingItem, b: ShoppingItem) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

/** Sections of the list. Cleared items are hidden. */
export function groupItems(items: ShoppingItem[]): ItemGroups {
  const live = items.filter((item) => item.clearedAt === null).sort(newestFirst);
  return {
    open: live.filter((item) => item.boughtAt === null),
    bought: live.filter((item) => item.boughtAt !== null && item.expenseId === null),
    inExpense: live.filter((item) => item.expenseId !== null),
  };
}

/** The "Turn into an expense" link: item ids only, no names or amounts. Null when nothing is bought. */
export function buyHref(bought: ShoppingItem[]): string | null {
  return bought.length === 0
    ? null
    : `/more/shopping/buy?items=${bought.map((i) => i.id).join(",")}`;
}

/** Of the ids in the address, the ones that really are bought and not yet in an expense. */
export function selectBuyable(requested: string[], items: ShoppingItem[]): ShoppingItem[] {
  return items.filter(
    (item) =>
      requested.includes(item.id) &&
      item.boughtAt !== null &&
      item.expenseId === null &&
      item.clearedAt === null,
  );
}
