import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { ShoppingItem } from "./list";

/** The flat's list, newest first. Row-level security limits it to the caller's flat. */
export async function getShoppingItems(): Promise<ShoppingItem[]> {
  const { supabase } = await getRequestSession();
  const { data } = await supabase
    .from("shopping_items")
    .select(
      "id, name, note, added_by, created_at, bought_at, expense_id, cleared_at, adder:profiles!shopping_items_added_by_fkey(display_name), buyer:profiles!shopping_items_bought_by_fkey(display_name)",
    )
    .is("cleared_at", null)
    .order("created_at", { ascending: false })
    .limit(300);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    note: row.note,
    addedBy: row.added_by,
    addedByName: row.adder?.display_name ?? "Someone",
    createdAt: row.created_at,
    boughtAt: row.bought_at,
    boughtByName: row.buyer?.display_name ?? null,
    expenseId: row.expense_id,
    clearedAt: row.cleared_at,
  }));
}
