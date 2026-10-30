import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  pauseTemplate: vi.fn(),
  resumeTemplate: vi.fn(),
  skipMonth: vi.fn(),
  endTemplate: vi.fn(),
}));

import { TemplateDetailView } from "./template-detail";
import type { TemplateDetail } from "./templates";

const SAM = "00000000-0000-0000-0000-000000000001";
const ALICE = "00000000-0000-0000-0000-000000000003";
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const bill: TemplateDetail = {
  id: "t1",
  kind: "bill",
  name: "Gas",
  paidById: ALICE,
  paidByName: "Alice",
  dueDay: 12,
  amountMode: "variable",
  amountPence: null,
  splitMode: "equal",
  activeMonths: ALL,
  paused: false,
  pausedReason: null,
  ended: false,
  shares: [],
  rooms: [],
  log: [{ id: "l1", change: "created", createdAt: "2026-10-30T10:00:00Z", changedByName: "Sam" }],
  months: [{ period: "2026-11-01", status: "awaiting_amount" }],
};

const rent: TemplateDetail = {
  ...bill,
  id: "t2",
  kind: "rent",
  name: "Rent",
  paidById: SAM,
  paidByName: "Sam",
  dueDay: 6,
  amountMode: "fixed",
  splitMode: "amounts",
  rooms: [{ id: "r1", name: "Big room", rentPence: 120_000 }],
  shares: [
    { profileId: ALICE, displayName: "Alice", shareValue: 60_000, roomId: "r1" },
    { profileId: SAM, displayName: "Sam", shareValue: 60_000, roomId: "r1" },
  ],
};

describe("TemplateDetailView", () => {
  it("shows a bill to a member: its rules, who shares it and its months, with no management buttons", () => {
    render(
      <TemplateDetailView detail={bill} viewerId={ALICE} viewerIsAdmin={false} skippable={[]} />,
    );
    expect(screen.getByText("Gas")).toBeInTheDocument();
    expect(screen.getByText(/You pay/)).toBeInTheDocument();
    expect(screen.getByText("Everyone in the flat.")).toBeInTheDocument();
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(screen.getByText("Waiting for the amount")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("gives an admin edit, pause, end and skip", () => {
    render(
      <TemplateDetailView
        detail={bill}
        viewerId={SAM}
        viewerIsAdmin
        skippable={["2026-12-01", "2027-01-01"]}
      />,
    );
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/money/recurring/t1/edit",
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End it" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip December 2026" })).toBeInTheDocument();
  });

  it("offers resume instead of pause when paused, and says why", () => {
    render(
      <TemplateDetailView
        detail={{ ...bill, paused: true, pausedReason: "member_left" }}
        viewerId={SAM}
        viewerIsAdmin
        skippable={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/a flatmate left/);
  });

  it("shows a rent's rooms, amounts and total to an admin, with a note on who can see them", () => {
    render(<TemplateDetailView detail={rent} viewerId={SAM} viewerIsAdmin skippable={[]} />);
    expect(screen.getByText("Rooms and who pays what")).toBeInTheDocument();
    expect(screen.getByText("Big room")).toBeInTheDocument();
    expect(screen.getAllByText("£600.00")).toHaveLength(2);
    expect(screen.getAllByText("£1,200.00")).toHaveLength(2);
    expect(screen.getByText(/Everyone else sees only their own rent/)).toBeInTheDocument();
    expect(screen.getByText("Sam (collects)")).toBeInTheDocument();
  });

  it("shows the change log", () => {
    render(
      <TemplateDetailView detail={bill} viewerId={ALICE} viewerIsAdmin={false} skippable={[]} />,
    );
    expect(screen.getByText("Created · Sam")).toBeInTheDocument();
  });

  it("says an ended template is kept as history and offers no buttons", () => {
    render(
      <TemplateDetailView
        detail={{ ...bill, ended: true }}
        viewerId={SAM}
        viewerIsAdmin
        skippable={[]}
      />,
    );
    expect(screen.getAllByText(/This has ended/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });
});
