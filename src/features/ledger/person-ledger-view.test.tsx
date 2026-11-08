import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildBalancesView } from "./balance-view";
import { PersonLedgerView } from "./person-ledger-view";
import { paymentsFor, toLedgerItems, type PersonLedgerRow } from "./person-ledger";

const view = buildBalancesView(
  [
    { profileId: "me", displayName: "Karthik", pence: 15890, current: true },
    { profileId: "riyon", displayName: "Riyon", pence: -15890, current: true },
  ],
  "me",
);
const riyon = view.people.find((person) => person.profileId === "riyon")!;
const me = view.people.find((person) => person.profileId === "me")!;

const base: PersonLedgerRow = {
  kind: "expense",
  item_id: "e1",
  occurred_on: "2026-11-06",
  description: "Electricity",
  other_id: "me",
  other_name: "Karthik",
  amount_pence: 40000,
  share_pence: 10000,
  effect_pence: -10000,
  counts: true,
  status: "active",
};
const items = toLedgerItems([
  base,
  {
    ...base,
    item_id: "e2",
    description: "Wrong amount",
    effect_pence: -5890,
    share_pence: 5890,
    counts: false,
    status: "cancelled",
  },
  {
    ...base,
    kind: "settlement",
    item_id: "s1",
    description: "",
    amount_pence: 2000,
    share_pence: 0,
    effect_pence: 2000,
    status: "confirmed",
  },
  { ...base, item_id: "e3", description: "Bin bags", effect_pence: -7890, share_pence: 7890 },
]);

describe("PersonLedgerView", () => {
  it("lists what counts, each linked to its expense, and says what it adds up to", () => {
    render(<PersonLedgerView person={riyon} items={items} payments={[]} inconsistent={false} />);

    expect(screen.getByText("Riyon owes £158.90")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Electricity/ })).toHaveAttribute(
      "href",
      "/money/expenses/e1",
    );
    expect(screen.getByText("-£100.00")).toBeInTheDocument();
    expect(screen.getByText("+£20.00")).toBeInTheDocument();
    expect(screen.getByText("Riyon paid Karthik")).toBeInTheDocument();
    expect(screen.getByText("£158.90 owing")).toBeInTheDocument();
    expect(screen.queryByText("Wrong amount")).toBeNull();
  });

  it("shows cancelled and unconfirmed items only when asked, and still adds up the same", () => {
    render(<PersonLedgerView person={riyon} items={items} payments={[]} inconsistent={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Show 1 cancelled or unconfirmed" }));
    expect(screen.getByText("Wrong amount")).toBeInTheDocument();
    expect(screen.getByText(/Cancelled/)).toBeInTheDocument();
    expect(screen.getByText("£158.90 owing")).toBeInTheDocument();
  });

  it("switches to the fewest payments, with a way to record one you owe", () => {
    const payments = paymentsFor(view.payments, "riyon");
    render(
      <PersonLedgerView person={riyon} items={items} payments={payments} inconsistent={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fewest payments" }));
    expect(screen.getByText("Riyon pays you £158.90")).toBeInTheDocument();
    expect(screen.queryByText("Electricity")).toBeNull();
  });

  it("speaks to the viewer on their own page", () => {
    render(<PersonLedgerView person={me} items={[]} payments={[]} inconsistent={false} />);
    expect(screen.getByText("You are owed £158.90")).toBeInTheDocument();
    expect(screen.getByText("Nothing yet.")).toBeInTheDocument();
  });

  it("withholds suggested payments when the balances do not add up", () => {
    render(<PersonLedgerView person={riyon} items={[]} payments={[]} inconsistent={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Fewest payments" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
