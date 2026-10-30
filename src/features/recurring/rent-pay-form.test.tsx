import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ recordRentPayment: vi.fn() }));

import { RentPayForm } from "./rent-pay-form";

describe("RentPayForm", () => {
  it("starts with what is owed and says who has to confirm", () => {
    render(<RentPayForm owedPence={52_000} collectorName="Sam" />);
    expect(screen.getByLabelText("Amount you paid (£)")).toHaveValue("520.00");
    expect(
      screen.getByText(
        "You owe £520.00. Sam or an admin has to confirm they received it before it counts.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I paid my rent" })).toBeEnabled();
  });

  it("cannot record more than is owed", async () => {
    const user = userEvent.setup();
    render(<RentPayForm owedPence={52_000} collectorName="Sam" />);
    const field = screen.getByLabelText("Amount you paid (£)");
    await user.clear(field);
    await user.type(field, "520.01");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That is more than you still owe (£520.00).",
    );
    expect(screen.getByRole("button", { name: "I paid my rent" })).toBeDisabled();
  });

  it("allows part of it, and refuses a bad amount", async () => {
    const user = userEvent.setup();
    render(<RentPayForm owedPence={52_000} collectorName="Sam" />);
    const field = screen.getByLabelText("Amount you paid (£)");
    await user.clear(field);
    await user.type(field, "200");
    expect(screen.getByRole("button", { name: "I paid my rent" })).toBeEnabled();
    await user.clear(field);
    await user.type(field, "4.205");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I paid my rent" })).toBeDisabled();
  });
});
