import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TemplateList } from "./template-list";
import type { BillTemplate } from "./templates";

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";

const wifi: BillTemplate = {
  id: "t1",
  name: "Wi-Fi",
  paidById: BOB,
  paidByName: "Bob",
  dueDay: 12,
  amountMode: "fixed",
  amountPence: 3200,
  splitMode: "equal",
  activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  paused: false,
  pausedReason: null,
  ended: false,
};

describe("TemplateList", () => {
  it("lists each bill with who pays, when it is due and its amount", () => {
    render(<TemplateList templates={[wifi]} viewerId={ALICE} />);
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.getByText("£32.00")).toBeInTheDocument();
    expect(
      screen.getByText("Bob pays · Due on the 12th · same amount each month · every month"),
    ).toBeInTheDocument();
  });

  it("shows 'Changes' for a bill whose amount changes each month", () => {
    render(
      <TemplateList
        templates={[{ ...wifi, name: "Gas", amountMode: "variable", amountPence: null }]}
        viewerId={BOB}
      />,
    );
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(
      screen.getByText(/You pay · Due on the 12th · amount changes each month/),
    ).toBeInTheDocument();
  });

  it("says why a bill is paused", () => {
    render(
      <TemplateList
        templates={[{ ...wifi, paused: true, pausedReason: "member_left" }]}
        viewerId={ALICE}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/Paused because a flatmate left/);
  });

  it("explains an empty list", () => {
    render(<TemplateList templates={[]} viewerId={ALICE} />);
    expect(screen.getByText(/No bills are set up yet/)).toBeInTheDocument();
  });
});
