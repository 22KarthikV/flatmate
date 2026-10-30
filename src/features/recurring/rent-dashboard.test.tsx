import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  confirmRentPayment: vi.fn(),
  declineRentPayment: vi.fn(),
  voidRentPayment: vi.fn(),
  cancelRentPayment: vi.fn(),
  waiveRent: vi.fn(),
}));

import { RentDashboard } from "./rent-dashboard";
import type { DashboardRow, RentPaymentRow } from "./rent-status";

const row = (extra: Partial<DashboardRow>): DashboardRow => ({
  chargeId: "c",
  profileId: "p",
  displayName: "Alice",
  stillInFlat: true,
  roomName: "Big room",
  period: "2026-11-01",
  dueOn: "2026-11-06",
  amountPence: 60_000,
  coveredPence: 0,
  pendingPence: 0,
  outstandingPence: 60_000,
  status: "outstanding",
  ...extra,
});

const rows = [
  row({ chargeId: "c1", profileId: "alice", displayName: "Alice" }),
  row({
    chargeId: "c2",
    profileId: "bob",
    displayName: "Bob",
    status: "paid",
    coveredPence: 60_000,
    outstandingPence: 0,
  }),
  row({
    chargeId: "c3",
    profileId: "cara",
    displayName: "Cara",
    roomName: "Box room",
    amountPence: 55_000,
    status: "pending",
    pendingPence: 55_000,
    outstandingPence: 0,
  }),
  row({
    chargeId: "c4",
    profileId: "lou",
    displayName: "Lou",
    stillInFlat: false,
    amountPence: 40_000,
    outstandingPence: 40_000,
  }),
];

const pending: RentPaymentRow[] = [
  {
    id: "p1",
    payerId: "cara",
    payerName: "Cara",
    amountPence: 55_000,
    createdAt: "2026-11-04T10:00:00Z",
    kind: "payment",
    voided: false,
  },
];

describe("RentDashboard", () => {
  it("shows everyone's amount and status for the month, with the totals to the penny", () => {
    render(
      <RentDashboard period="2026-11-01" rows={rows} pending={[]} recent={[]} viewerId="sam" />,
    );
    const month = screen.getByRole("region", { name: "Rent for November 2026" });
    expect(within(month).getByText("Alice")).toBeInTheDocument();
    expect(within(month).getByText("Bob")).toBeInTheDocument();
    expect(within(month).getByText("£550.00")).toBeInTheDocument();
    expect(
      within(month).getByText(
        /£600.00 of £2,150.00 confirmed, £550.00 waiting, £1,000.00 still out/,
      ),
    ).toBeInTheDocument();
    expect(within(month).getAllByText(/Not paid yet/)).toHaveLength(2);
    expect(within(month).getByText(/Waiting to be confirmed/)).toBeInTheDocument();
  });

  it("marks someone who left owing", () => {
    render(
      <RentDashboard period="2026-11-01" rows={rows} pending={[]} recent={[]} viewerId="sam" />,
    );
    expect(screen.getByText("Lou (left)")).toBeInTheDocument();
    expect(screen.getByText(/left, unpaid/)).toBeInTheDocument();
  });

  it("explains that members see only their own", () => {
    render(
      <RentDashboard period="2026-11-01" rows={rows} pending={[]} recent={[]} viewerId="sam" />,
    );
    expect(screen.getByText(/Each flatmate sees only their own/)).toBeInTheDocument();
  });

  it("lets the collector confirm or decline a payment waiting", () => {
    render(
      <RentDashboard
        period="2026-11-01"
        rows={rows}
        pending={pending}
        recent={[]}
        viewerId="sam"
      />,
    );
    const section = screen.getByRole("region", { name: "Payments to confirm" });
    expect(within(section).getByText("Cara says they paid £550.00")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Didn’t arrive" })).toBeInTheDocument();
  });

  it("does not let an admin confirm their own payment", () => {
    render(
      <RentDashboard
        period="2026-11-01"
        rows={rows}
        pending={pending}
        recent={[]}
        viewerId="cara"
      />,
    );
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.getByText(/Another admin has to confirm your own payment/)).toBeInTheDocument();
  });

  it("offers to close unpaid rent but not the admin's own", () => {
    render(
      <RentDashboard period="2026-11-01" rows={rows} pending={[]} recent={[]} viewerId="alice" />,
    );
    // Alice (the viewer) has outstanding rent; Lou has too: only Lou's can be closed by her.
    expect(screen.getAllByText("Close it without payment")).toHaveLength(1);
  });

  it("lists recent confirmed payments with a way to reverse one, and marks reversed ones", () => {
    render(
      <RentDashboard
        period="2026-11-01"
        rows={rows}
        pending={[]}
        recent={[
          { ...pending[0], id: "p2", payerName: "Bob", amountPence: 60_000 },
          { ...pending[0], id: "p3", payerName: "Dee", amountPence: 10_000, voided: true },
          { ...pending[0], id: "p4", payerName: "Lou", amountPence: 5000, kind: "waiver" },
        ]}
        viewerId="sam"
      />,
    );
    expect(screen.getAllByRole("button", { name: "Reverse" })).toHaveLength(2);
    expect(screen.getByText("Reversed")).toBeInTheDocument();
    expect(screen.getByText("Lou (closed without payment)")).toBeInTheDocument();
  });

  it("says when nothing was charged", () => {
    render(<RentDashboard period="2026-11-01" rows={[]} pending={[]} recent={[]} viewerId="sam" />);
    expect(screen.getByText("No rent was charged for this month.")).toBeInTheDocument();
  });
});
