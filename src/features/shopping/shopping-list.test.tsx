import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ clearBought: vi.fn(), removeItem: vi.fn(), setBought: vi.fn() }));

import type { ShoppingItem } from "./list";
import { ShoppingList } from "./shopping-list";

const item = (id: string, over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id,
  name: id,
  note: null,
  addedBy: "p-alice",
  addedByName: "Alice",
  createdAt: "2026-10-31T10:00:00Z",
  boughtAt: null,
  boughtByName: null,
  expenseId: null,
  clearedAt: null,
  ...over,
});

describe("ShoppingList", () => {
  it("shows an empty state", () => {
    render(<ShoppingList items={[]} viewerId="p-bob" isAdmin={false} />);
    expect(screen.getByText(/Nothing on the list/)).toBeInTheDocument();
  });

  it("shows open, bought and expense sections, with the buy link by ids only", () => {
    render(
      <ShoppingList
        items={[
          item("milk"),
          item("bread", { boughtAt: "2026-10-31T11:00:00Z", boughtByName: "Bob" }),
          item("tea", { boughtAt: "2026-10-31T11:00:00Z", expenseId: "e1" }),
        ]}
        viewerId="p-bob"
        isAdmin={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "To buy (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bought (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Added to expenses (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Turn into an expense" })).toHaveAttribute(
      "href",
      "/more/shopping/buy?items=bread",
    );
    expect(screen.getByRole("link", { name: "Expense" })).toHaveAttribute(
      "href",
      "/money/expenses/e1",
    );
  });

  it("lets only the adder or an admin remove, and never an item behind an expense", () => {
    const items = [item("milk"), item("tea", { boughtAt: "x", expenseId: "e1" })];
    const { rerender } = render(<ShoppingList items={items} viewerId="p-bob" isAdmin={false} />);
    expect(screen.queryByRole("button", { name: "Remove milk" })).toBeNull();
    rerender(<ShoppingList items={items} viewerId="p-bob" isAdmin />);
    expect(screen.getByRole("button", { name: "Remove milk" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove tea" })).toBeNull();
    rerender(<ShoppingList items={items} viewerId="p-alice" isAdmin={false} />);
    expect(screen.getByRole("button", { name: "Remove milk" })).toBeInTheDocument();
  });
});
