import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ExpenseFilter, filterExpenses } from "./expense-filter";
import type { ExpenseRow } from "./expenses";

const ME = "00000000-0000-0000-0000-00000000000a";

const row = (id: string, description: string, over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id,
  description,
  category: "household",
  amountPence: 840,
  occurredOn: "2026-10-30",
  createdAt: "2026-10-30T09:00:00Z",
  paidById: ME,
  paidByName: "Alice",
  createdById: ME,
  voided: false,
  replaced: false,
  myShare: null,
  ...over,
});

const items = [
  row("a", "Kitchen roll"),
  row("b", "Wrong amount", { voided: true }),
  row("c", "Old version", { voided: true, replaced: true }),
];

describe("filterExpenses", () => {
  it("keeps live expenses, cancelled or corrected ones, or everything", () => {
    expect(filterExpenses(items, "active").map((i) => i.id)).toEqual(["a"]);
    expect(filterExpenses(items, "cancelled").map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterExpenses(items, "all").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("ExpenseFilter", () => {
  it("starts on Active, hiding cancelled expenses", () => {
    render(<ExpenseFilter items={items} viewerId={ME} />);
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Kitchen roll")).toBeInTheDocument();
    expect(screen.queryByText("Wrong amount")).not.toBeInTheDocument();
  });

  it("switches to Cancelled and to All", async () => {
    const user = userEvent.setup();
    render(<ExpenseFilter items={items} viewerId={ME} />);

    await user.click(screen.getByRole("button", { name: "Cancelled" }));
    expect(screen.getByRole("button", { name: "Cancelled" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("Kitchen roll")).not.toBeInTheDocument();
    expect(screen.getByText("Wrong amount")).toBeInTheDocument();
    expect(screen.getByText("Old version")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Kitchen roll")).toBeInTheDocument();
    expect(screen.getByText("Wrong amount")).toBeInTheDocument();
  });

  it("can start on another option", () => {
    render(<ExpenseFilter items={items} viewerId={ME} initial="all" />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Wrong amount")).toBeInTheDocument();
  });

  it("says plainly when an option has nothing in it", async () => {
    const user = userEvent.setup();
    render(<ExpenseFilter items={[row("a", "Kitchen roll")]} viewerId={ME} />);
    await user.click(screen.getByRole("button", { name: "Cancelled" }));
    expect(screen.getByText("No cancelled expenses.")).toBeInTheDocument();
  });
});
