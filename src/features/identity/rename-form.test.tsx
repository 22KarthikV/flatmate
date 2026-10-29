import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ updateDisplayName: vi.fn() }));
vi.mock("./actions", () => action);

import { RenameForm } from "./rename-form";

describe("RenameForm", () => {
  it("shows the current name in a labelled field limited to 50 characters", () => {
    render(<RenameForm currentName="Alice Adams" />);

    const field = screen.getByLabelText("Display name");
    expect(field).toHaveValue("Alice Adams");
    expect(field).toHaveAttribute("maxlength", "50");
    expect(field).toBeRequired();
  });

  it("submits the new name and announces success", async () => {
    action.updateDisplayName.mockResolvedValue({ status: "saved", message: "Saved." });
    const user = userEvent.setup();
    render(<RenameForm currentName="Alice" />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Ally");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(action.updateDisplayName).toHaveBeenCalledOnce();
    const formData = action.updateDisplayName.mock.calls[0][1] as FormData;
    expect(formData.get("displayName")).toBe("Ally");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("shows an error next to the field and keeps what was typed", async () => {
    action.updateDisplayName.mockResolvedValue({ status: "error", message: "Enter a name." });
    const user = userEvent.setup();
    render(<RenameForm currentName="Alice" />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name.");
    expect(screen.getByLabelText("Display name")).toHaveAttribute("aria-invalid", "true");
  });
});
