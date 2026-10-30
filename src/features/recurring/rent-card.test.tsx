import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ cancelRentPayment: vi.fn() }));

import { RentCard } from "./rent-card";
import type { MyRentRow, RentPaymentRow } from "./rent-status";

const row = (extra: Partial<MyRentRow> = {}): MyRentRow => ({
  chargeId: "c1",
  period: "2026-11-01",
  dueOn: "2026-11-06",
  amountPence: 52_000,
  coveredPence: 0,
  pendingPence: 0,
  outstandingPence: 52_000,
  status: "outstanding",
  collectorId: "sam",
  collectorName: "Sam",
  ...extra,
});

describe("RentCard", () => {
  it("shows the viewer's own amount, who it is owed to and when it is due", () => {
    render(<RentCard rows={[row()]} pending={[]} />);
    expect(screen.getAllByText("£520.00").length).toBeGreaterThan(0);
    expect(screen.getByText("still to pay to Sam")).toBeInTheDocument();
    expect(screen.getByText(/Due Fri 6 Nov 2026 · Not paid yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "I paid my rent" })).toHaveAttribute(
      "href",
      "/money/rent/pay",
    );
  });

  it("never shows anyone else's amount, a room or a total (a roommate's £600.00 is not on the page)", () => {
    const { container } = render(<RentCard rows={[row()]} pending={[]} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("600.00");
    expect(text.toLowerCase()).not.toContain("room");
    expect(text.toLowerCase()).not.toContain("total");
  });

  it("says when everything is paid and offers no payment button", () => {
    render(
      <RentCard
        rows={[row({ status: "paid", coveredPence: 52_000, outstandingPence: 0 })]}
        pending={[]}
      />,
    );
    expect(screen.getByText("You are all paid up.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "I paid my rent" })).not.toBeInTheDocument();
  });

  it("shows a payment waiting for the collector, with a way to cancel it", () => {
    const payment: RentPaymentRow = {
      id: "p1",
      payerId: "me",
      payerName: "Me",
      amountPence: 52_000,
      createdAt: "2026-11-04T10:00:00Z",
      kind: "payment",
      voided: false,
    };
    render(
      <RentCard
        rows={[row({ status: "pending", pendingPence: 52_000, outstandingPence: 0 })]}
        pending={[payment]}
      />,
    );
    expect(screen.getByText("paid, waiting to be confirmed")).toBeInTheDocument();
    expect(
      screen.getByText(/You said you paid £520.00. Sam or an admin has to confirm it./),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel payment" })).toBeInTheDocument();
  });

  it("says what is left on a part-paid month", () => {
    render(
      <RentCard
        rows={[row({ status: "part_paid", coveredPence: 20_000, outstandingPence: 32_000 })]}
        pending={[]}
      />,
    );
    expect(screen.getByText(/Part paid · £320.00 still to pay/)).toBeInTheDocument();
  });

  it("explains when there is no rent", () => {
    render(<RentCard rows={[]} pending={[]} />);
    expect(screen.getByText(/You have no rent to pay/)).toBeInTheDocument();
  });
});
