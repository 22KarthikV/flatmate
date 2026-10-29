import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ createHousehold: vi.fn() }));
vi.mock("./actions", () => action);

import { CreateFlatForm } from "./create-flat-form";

describe("CreateFlatForm", () => {
  it("has a labelled name field limited to 50 characters", () => {
    render(<CreateFlatForm />);
    const field = screen.getByLabelText("Flat name");
    expect(field).toHaveAttribute("maxlength", "50");
    expect(field).toBeRequired();
  });

  it("submits the name", async () => {
    action.createHousehold.mockResolvedValue({ status: "created" });
    const user = userEvent.setup();
    render(<CreateFlatForm />);

    await user.type(screen.getByLabelText("Flat name"), "Flat 12");
    await user.click(screen.getByRole("button", { name: "Create flat" }));

    expect(action.createHousehold).toHaveBeenCalledOnce();
    expect((action.createHousehold.mock.calls[0][1] as FormData).get("name")).toBe("Flat 12");
  });

  it("shows an error as an alert", async () => {
    action.createHousehold.mockResolvedValue({
      status: "error",
      message: "Enter a name for your flat.",
    });
    const user = userEvent.setup();
    render(<CreateFlatForm />);

    await user.type(screen.getByLabelText("Flat name"), "x");
    await user.click(screen.getByRole("button", { name: "Create flat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name for your flat.");
  });
});
