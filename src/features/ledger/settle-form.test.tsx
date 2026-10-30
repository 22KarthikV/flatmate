import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ recordSettlement: vi.fn() }));
vi.mock("./actions", () => actions);

import { SettleForm } from "./settle-form";

const SAM = "00000000-0000-0000-0000-00000000000b";
const KIM = "00000000-0000-0000-0000-00000000000c";
const PEOPLE = [
  { profileId: SAM, displayName: "Sam" },
  { profileId: KIM, displayName: "Kim" },
];

describe("SettleForm", () => {
  it("lists the other flatmates and says the receiver has to confirm", () => {
    render(<SettleForm people={PEOPLE} initial={{ to: "", amount: "" }} />);
    expect(screen.getByRole("option", { name: "Sam" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kim" })).toBeInTheDocument();
    expect(screen.getByText(/has to confirm they received it/)).toBeInTheDocument();
    expect(screen.getByLabelText("Amount (£)")).toHaveAttribute("inputmode", "decimal");
  });

  it("is prefilled from a suggested payment and names the person who must confirm", () => {
    render(<SettleForm people={PEOPLE} initial={{ to: SAM, amount: "3.00" }} />);
    expect(screen.getByLabelText("Who did you pay?")).toHaveValue(SAM);
    expect(screen.getByLabelText("Amount (£)")).toHaveValue("3.00");
    expect(
      screen.getByText("Sam has to confirm they received it before it counts."),
    ).toBeInTheDocument();
  });

  it("offers a former flatmate who is owed money, and says an admin confirms for them", async () => {
    const DEE = "00000000-0000-0000-0000-00000000000d";
    const user = userEvent.setup();
    render(
      <SettleForm
        people={PEOPLE}
        former={[{ profileId: DEE, displayName: "Dee" }]}
        initial={{ to: "", amount: "" }}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Who did you pay?"), DEE);
    expect(
      screen.getByText(
        "Dee has left the flat, so an admin confirms this for them before it counts.",
      ),
    ).toBeInTheDocument();
  });

  it("posts who and how much", async () => {
    actions.recordSettlement.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    render(<SettleForm people={PEOPLE} initial={{ to: "", amount: "" }} />);

    await user.selectOptions(screen.getByLabelText("Who did you pay?"), KIM);
    await user.type(screen.getByLabelText("Amount (£)"), "12.50");
    await user.click(screen.getByRole("button", { name: "Record payment" }));

    expect(actions.recordSettlement).toHaveBeenCalledOnce();
    const form = actions.recordSettlement.mock.calls[0][1] as FormData;
    expect(form.get("to")).toBe(KIM);
    expect(form.get("amount")).toBe("12.50");
  });

  it("shows why it failed", async () => {
    actions.recordSettlement.mockResolvedValue({ status: "error", message: "Enter an amount." });
    const user = userEvent.setup();
    render(<SettleForm people={PEOPLE} initial={{ to: SAM, amount: "1" }} />);
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter an amount.");
  });
});
