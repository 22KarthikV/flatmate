import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ enterBillAmount: vi.fn() }));
vi.mock("./actions", () => actions);

import { AmountForm } from "./amount-form";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";

const people = [
  { profileId: A, displayName: "Alice", basisPoints: null },
  { profileId: B, displayName: "Bob", basisPoints: null },
  { profileId: C, displayName: "Cara", basisPoints: null },
];

describe("AmountForm", () => {
  it("names the bill, says it can be entered once and lists who shares it", () => {
    render(<AmountForm instanceId="i1" billName="Gas" splitMode="equal" sharers={people} />);
    expect(screen.getByLabelText("This month's Gas (£)")).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText(/You can enter it once/)).toBeInTheDocument();
    expect(screen.getAllByText("Equal share")).toHaveLength(3);
  });

  it("shows each person's share as the amount is typed, leftover pence to the lowest id", async () => {
    const user = userEvent.setup();
    render(<AmountForm instanceId="i1" billName="Gas" splitMode="equal" sharers={people} />);
    await user.type(screen.getByLabelText("This month's Gas (£)"), "84.50");
    expect(screen.getAllByText("£28.17")).toHaveLength(2);
    expect(screen.getByText("£28.16")).toBeInTheDocument();
  });

  it("shows percentage bills by their percentages", async () => {
    const user = userEvent.setup();
    render(
      <AmountForm
        instanceId="i1"
        billName="Boiler cover"
        splitMode="percent"
        sharers={[
          { profileId: A, displayName: "Alice", basisPoints: 7000 },
          { profileId: B, displayName: "Bob", basisPoints: 3000 },
        ]}
      />,
    );
    expect(screen.getByText("70%")).toBeInTheDocument();
    await user.type(screen.getByLabelText("This month's Boiler cover (£)"), "10");
    expect(screen.getByText("£7.00")).toBeInTheDocument();
    expect(screen.getByText("£3.00")).toBeInTheDocument();
  });

  it("explains an amount it cannot use", async () => {
    const user = userEvent.setup();
    render(<AmountForm instanceId="i1" billName="Gas" splitMode="equal" sharers={people} />);
    await user.type(screen.getByLabelText("This month's Gas (£)"), "4.205");
    expect(screen.getByRole("alert")).toHaveTextContent(/No more than two decimal places/);
  });

  it("cannot be saved when nobody is left to share the bill", () => {
    render(<AmountForm instanceId="i1" billName="Gas" splitMode="equal" sharers={[]} />);
    expect(screen.getByText(/Nobody is left to share this bill/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save amount" })).toBeDisabled();
  });

  it("posts the instance id with the amount", () => {
    const { container } = render(
      <AmountForm instanceId="i1" billName="Gas" splitMode="equal" sharers={people} />,
    );
    expect(container.querySelector('input[name="instanceId"]')).toHaveValue("i1");
  });
});
