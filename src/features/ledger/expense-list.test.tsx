import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExpenseList } from "./expense-list";
import type { ExpenseRow } from "./expenses";

const ME = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";

const row = (over: Partial<ExpenseRow>): ExpenseRow => ({
  id: "e1",
  description: "Kitchen roll",
  category: "household",
  amountPence: 840,
  occurredOn: "2026-10-30",
  createdAt: "2026-10-30T09:00:00Z",
  paidById: OTHER,
  paidByName: "Bob",
  createdById: OTHER,
  voided: false,
  replaced: false,
  myShare: 420,
  ...over,
});

describe("ExpenseList", () => {
  it("explains an empty list", () => {
    render(<ExpenseList items={[]} viewerId={ME} />);
    expect(screen.getByText(/No expenses yet/)).toBeInTheDocument();
  });

  it("shows what it was, who paid, the date, the total and the viewer's share, as a link", () => {
    render(<ExpenseList items={[row({})]} viewerId={ME} />);
    const link = screen.getByRole("link", { name: /Kitchen roll/ });
    expect(link).toHaveAttribute("href", "/money/expenses/e1");
    expect(link).toHaveTextContent("Household · Bob paid · Fri 30 Oct 2026");
    expect(link).toHaveTextContent("£8.40");
    expect(link).toHaveTextContent("Your share £4.20");
  });

  it("says 'You paid' for the viewer's own, and shows no share when they have none", () => {
    render(<ExpenseList items={[row({ paidById: ME, myShare: null })]} viewerId={ME} />);
    const link = screen.getByRole("link", { name: /Kitchen roll/ });
    expect(link).toHaveTextContent("You paid");
    expect(link).not.toHaveTextContent("Your share");
  });

  it("marks cancelled and corrected expenses and strikes them through", () => {
    render(
      <ExpenseList
        items={[
          row({ id: "a", description: "Cancelled one", voided: true }),
          row({ id: "b", description: "Corrected one", voided: true, replaced: true }),
        ]}
        viewerId={ME}
      />,
    );
    expect(screen.getByRole("link", { name: /Cancelled one/ })).toHaveTextContent("Cancelled");
    expect(screen.getByRole("link", { name: /Corrected one/ })).toHaveTextContent("Corrected");
    expect(screen.getByText("Cancelled one")).toHaveClass("line-through");
  });

  it("groups by month", () => {
    render(
      <ExpenseList
        items={[
          row({ id: "a", occurredOn: "2026-10-30" }),
          row({ id: "b", description: "Older", occurredOn: "2026-09-12" }),
        ]}
        viewerId={ME}
      />,
    );
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
  });
});
