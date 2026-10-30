import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ saveNudgeInterval: vi.fn() }));
vi.mock("./actions", () => actions);

import { NudgeCard } from "./nudge-card";

describe("NudgeCard", () => {
  it("shows the flat's current setting", () => {
    render(<NudgeCard current={14} />);
    expect(screen.getByLabelText("Remind people who owe money")).toHaveValue("14");
  });

  it("shows 'Never' for off and the usual 7 days for anything unexpected", () => {
    const { unmount } = render(<NudgeCard current={null} />);
    expect(screen.getByLabelText("Remind people who owe money")).toHaveValue("off");
    unmount();
    render(<NudgeCard current={5} />);
    expect(screen.getByLabelText("Remind people who owe money")).toHaveValue("7");
  });

  it("saves the chosen interval and says so", async () => {
    actions.saveNudgeInterval.mockResolvedValue({ status: "saved" });
    const user = userEvent.setup();
    render(<NudgeCard current={7} />);

    await user.selectOptions(screen.getByLabelText("Remind people who owe money"), "3");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect((actions.saveNudgeInterval.mock.calls[0][1] as FormData).get("interval")).toBe("3");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("shows why it could not be saved", async () => {
    actions.saveNudgeInterval.mockResolvedValue({
      status: "error",
      message: "Only the owner and admins can change this.",
    });
    const user = userEvent.setup();
    render(<NudgeCard current={7} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the owner and admins");
  });
});
