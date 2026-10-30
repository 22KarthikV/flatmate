import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ voidExpense: vi.fn() }));
vi.mock("./actions", () => actions);

import { VoidButton } from "./void-button";

const ID = "e1000000-0000-0000-0000-000000000001";

describe("VoidButton", () => {
  it("asks first, and 'Keep it' backs out without doing anything", async () => {
    const user = userEvent.setup();
    render(<VoidButton expenseId={ID} />);

    await user.click(screen.getByRole("button", { name: "Cancel this expense" }));
    expect(screen.getByText(/stops counting towards anyone/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.getByRole("button", { name: "Cancel this expense" })).toBeInTheDocument();
    expect(actions.voidExpense).not.toHaveBeenCalled();
  });

  it("cancels the expense only after confirmation", async () => {
    actions.voidExpense.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<VoidButton expenseId={ID} />);

    await user.click(screen.getByRole("button", { name: "Cancel this expense" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));

    expect(actions.voidExpense).toHaveBeenCalledOnce();
    expect((actions.voidExpense.mock.calls[0][1] as FormData).get("expenseId")).toBe(ID);
  });

  it("shows why it failed", async () => {
    actions.voidExpense.mockResolvedValue({
      status: "error",
      message: "That expense has already been cancelled.",
    });
    const user = userEvent.setup();
    render(<VoidButton expenseId={ID} />);

    await user.click(screen.getByRole("button", { name: "Cancel this expense" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already been cancelled");
  });
});
