import { describe, expect, it } from "vitest";

import { buyHref, groupItems, selectBuyable, type ShoppingItem } from "./list";

const item = (id: string, over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id,
  name: id,
  note: null,
  addedBy: "p1",
  addedByName: "Alice",
  createdAt: "2026-10-31T10:00:00Z",
  boughtAt: null,
  boughtByName: null,
  expenseId: null,
  clearedAt: null,
  ...over,
});

describe("groupItems", () => {
  it("splits open, bought and in-an-expense, hiding cleared", () => {
    const groups = groupItems([
      item("old", { createdAt: "2026-10-30T10:00:00Z" }),
      item("new", { createdAt: "2026-10-31T10:00:00Z" }),
      item("bought", { boughtAt: "2026-10-31T11:00:00Z", boughtByName: "Bob" }),
      item("paid", { boughtAt: "2026-10-31T11:00:00Z", expenseId: "e1" }),
      item("gone", { boughtAt: "2026-10-31T11:00:00Z", clearedAt: "2026-10-31T12:00:00Z" }),
    ]);
    expect(groups.open.map((i) => i.id)).toEqual(["new", "old"]);
    expect(groups.bought.map((i) => i.id)).toEqual(["bought"]);
    expect(groups.inExpense.map((i) => i.id)).toEqual(["paid"]);
  });
  it("is empty for an empty list", () => {
    expect(groupItems([])).toEqual({ open: [], bought: [], inExpense: [] });
  });
});

describe("buyHref", () => {
  it("links the bought items by id only", () => {
    expect(buyHref([item("a"), item("b")])).toBe("/more/shopping/buy?items=a,b");
  });
  it("is null with nothing bought", () => {
    expect(buyHref([])).toBeNull();
  });
});

describe("selectBuyable", () => {
  const items = [
    item("a", { boughtAt: "x" }),
    item("b", { boughtAt: "x", expenseId: "e" }),
    item("c"),
  ];
  it("keeps only requested items that are bought and not yet in an expense", () => {
    expect(selectBuyable(["a", "b", "c", "zzz"], items).map((i) => i.id)).toEqual(["a"]);
  });
  it("refuses ids it was not given", () => {
    expect(selectBuyable(["zzz"], items)).toEqual([]);
  });
});
