import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({
  leaveHousehold: vi.fn(),
  transferOwnership: vi.fn(),
  closeHousehold: vi.fn(),
}));
vi.mock("./actions", () => action);

import { LeaveSection } from "./leave-section";

const others = [{ profileId: "p2", displayName: "Ben" }];

describe("LeaveSection", () => {
  it("makes a member confirm before leaving", async () => {
    action.leaveHousehold.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<LeaveSection role="member" others={others} />);

    await user.click(screen.getByRole("button", { name: "Leave flat" }));
    expect(action.leaveHousehold).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Leave flat" }));
    expect(action.leaveHousehold).toHaveBeenCalledOnce();
  });

  it("gives an owner with flatmates a hand-over, not a leave button", () => {
    render(<LeaveSection role="owner" others={others} />);
    expect(screen.getByLabelText("New owner")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ben" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave flat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close flat" })).not.toBeInTheDocument();
  });

  it("lets a lone owner close the flat after confirming", async () => {
    action.closeHousehold.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<LeaveSection role="owner" others={[]} />);

    await user.click(screen.getByRole("button", { name: "Close flat" }));
    expect(action.closeHousehold).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close flat" }));
    expect(action.closeHousehold).toHaveBeenCalledOnce();
  });

  it("explains why a member with money open cannot leave, and offers no leave button", () => {
    render(<LeaveSection role="member" others={others} moneyOpen />);
    expect(screen.getByRole("status")).toHaveTextContent("You can’t leave yet");
    expect(screen.getByRole("link", { name: "Money screen" })).toHaveAttribute("href", "/money");
    expect(screen.queryByRole("button", { name: "Leave flat" })).toBeNull();
  });

  it("shows why leaving was refused", async () => {
    action.leaveHousehold.mockResolvedValue({ status: "error", message: "Settle up first." });
    const user = userEvent.setup();
    render(<LeaveSection role="member" others={others} />);

    await user.click(screen.getByRole("button", { name: "Leave flat" }));
    await user.click(screen.getByRole("button", { name: "Leave flat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Settle up first.");
  });
});
