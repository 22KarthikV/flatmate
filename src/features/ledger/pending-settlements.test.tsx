import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  confirmSettlement: vi.fn(),
  declineSettlement: vi.fn(),
  cancelSettlement: vi.fn(),
}));
vi.mock("./actions", () => actions);

import { PendingSettlementsCard } from "./pending-settlements";

const ID = "51000000-0000-0000-0000-000000000001";
const payment = { id: ID, amountPence: 600, createdAt: "2026-10-30T09:00:00Z", otherName: "Sam" };

describe("PendingSettlementsCard", () => {
  it("shows nothing when nothing is waiting", () => {
    const { container } = render(<PendingSettlementsCard pending={{ toConfirm: [], sent: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks the receiver to confirm, and the confirm button sends the payment's id", async () => {
    actions.confirmSettlement.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<PendingSettlementsCard pending={{ toConfirm: [payment], sent: [] }} />);

    expect(screen.getByText("Sam says they paid you £6.00")).toBeInTheDocument();
    expect(screen.getByText(/only counts once you confirm/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(actions.confirmSettlement).toHaveBeenCalledOnce();
    expect((actions.confirmSettlement.mock.calls[0][1] as FormData).get("settlementId")).toBe(ID);
  });

  it("lets the receiver say it did not arrive", async () => {
    actions.declineSettlement.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<PendingSettlementsCard pending={{ toConfirm: [payment], sent: [] }} />);
    await user.click(screen.getByRole("button", { name: "Didn’t arrive" }));
    expect((actions.declineSettlement.mock.calls[0][1] as FormData).get("settlementId")).toBe(ID);
  });

  it("tells the payer it is waiting, and lets them take it back", async () => {
    actions.cancelSettlement.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<PendingSettlementsCard pending={{ toConfirm: [], sent: [payment] }} />);

    expect(screen.getByText("You paid Sam £6.00")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for Sam to confirm/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel payment" }));
    expect((actions.cancelSettlement.mock.calls[0][1] as FormData).get("settlementId")).toBe(ID);
  });

  it("shows why a decision failed", async () => {
    actions.confirmSettlement.mockResolvedValue({
      status: "error",
      message: "That payment has already been dealt with.",
    });
    const user = userEvent.setup();
    render(<PendingSettlementsCard pending={{ toConfirm: [payment], sent: [] }} />);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already been dealt with");
  });
});
