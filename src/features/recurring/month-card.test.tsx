import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonthCard } from "./month-card";
import type { BillMonth } from "./months";

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";

const created: BillMonth = {
  id: "m1",
  templateId: "t1",
  name: "Wi-Fi",
  payerId: BOB,
  payerName: "Bob",
  dueOn: "2026-11-12",
  status: "posted",
  expenseId: "e1",
  amountPence: 3200,
  voided: false,
  sharers: [
    { displayName: "Alice", pence: 1600 },
    { displayName: "Bob", pence: 1600 },
  ],
};

const waiting: BillMonth = {
  ...created,
  id: "m2",
  name: "Gas",
  payerId: ALICE,
  payerName: "Alice",
  status: "awaiting_amount",
  expenseId: null,
  amountPence: null,
  sharers: [],
};

describe("MonthCard", () => {
  it("shows what a created month came to, who pays and who shared it", () => {
    render(<MonthCard month={created} viewerId={ALICE} />);
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.getByText("£32.00")).toBeInTheDocument();
    expect(screen.getByText(/November 2026 · due Thu 12 Nov 2026 · Bob pays/)).toBeInTheDocument();
    expect(screen.getByText("Shared: Alice £16.00, Bob £16.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it in Money" })).toHaveAttribute(
      "href",
      "/money/expenses/e1",
    );
  });

  it("says 'You pay' for the viewer's own bills", () => {
    render(<MonthCard month={created} viewerId={BOB} />);
    expect(screen.getByText(/You pay/)).toBeInTheDocument();
  });

  it("offers the payer a way to enter the amount while it is waiting", () => {
    render(<MonthCard month={waiting} viewerId={ALICE} />);
    expect(screen.getByText("Waiting for the amount")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Enter this month’s amount/ })).toHaveAttribute(
      "href",
      "/money/recurring/instances/m2/amount",
    );
  });

  it("tells everyone else who will enter it, without a link", () => {
    render(<MonthCard month={waiting} viewerId={BOB} />);
    expect(screen.getByText("Alice will enter the amount.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks a skipped month as skipped", () => {
    render(<MonthCard month={{ ...waiting, status: "skipped" }} viewerId={BOB} />);
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.queryByText(/will enter the amount/)).not.toBeInTheDocument();
  });

  it("strikes through an expense that was cancelled in the ledger", () => {
    render(<MonthCard month={{ ...created, voided: true }} viewerId={ALICE} />);
    expect(screen.getByText("£32.00")).toHaveClass("line-through");
  });
});
