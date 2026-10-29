import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ deleteAccount: vi.fn() }));
vi.mock("./actions", () => action);

import { DeleteAccountForm } from "./delete-account-form";

describe("DeleteAccountForm", () => {
  it("starts closed, with only a warning-free button", () => {
    render(<DeleteAccountForm />);

    expect(screen.getByRole("button", { name: "Delete account" })).toBeVisible();
    expect(screen.queryByLabelText(/type delete/i)).not.toBeInTheDocument();
  });

  it("explains what will happen before asking for confirmation", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountForm />);
    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByText(/can.t be undone/i)).toBeVisible();
    expect(screen.getByText(/Deleted user/)).toBeVisible();
  });

  it("keeps the final button disabled until DELETE is typed exactly", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountForm />);
    await user.click(screen.getByRole("button", { name: "Delete account" }));

    const confirm = screen.getByRole("button", { name: "Delete my account" });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/type delete/i), "delete");
    expect(confirm).toBeDisabled();

    await user.clear(screen.getByLabelText(/type delete/i));
    await user.type(screen.getByLabelText(/type delete/i), "DELETE");
    expect(confirm).toBeEnabled();
  });

  it("can be cancelled", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountForm />);
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText(/type delete/i)).not.toBeInTheDocument();
  });

  it("submits the confirmation and shows a failure message", async () => {
    action.deleteAccount.mockResolvedValue({ status: "error", message: "We couldn’t delete it." });
    const user = userEvent.setup();
    render(<DeleteAccountForm />);
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.type(screen.getByLabelText(/type delete/i), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    const formData = action.deleteAccount.mock.calls[0][1] as FormData;
    expect(formData.get("confirmation")).toBe("DELETE");
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t delete it.");
  });
});
