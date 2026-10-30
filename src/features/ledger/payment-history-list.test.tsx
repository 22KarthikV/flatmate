import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PaymentHistoryItem } from "./history";
import { PaymentHistoryList } from "./payment-history-list";

const ME = "00000000-0000-0000-0000-00000000000a";
const SAM = "00000000-0000-0000-0000-00000000000b";

const item = (over: Partial<PaymentHistoryItem>): PaymentHistoryItem => ({
  id: "s1",
  amountPence: 500,
  status: "confirmed",
  fromId: ME,
  toId: SAM,
  fromName: "Alice",
  toName: "Sam",
  confirmedById: SAM,
  confirmedByName: "Sam",
  when: "2026-10-30T09:00:00Z",
  ...over,
});

describe("PaymentHistoryList", () => {
  it("explains an empty history", () => {
    render(<PaymentHistoryList items={[]} viewerId={ME} />);
    expect(screen.getByText(/No payments yet/)).toBeInTheDocument();
  });

  it("shows who paid whom, the outcome, the date and who confirmed", () => {
    render(<PaymentHistoryList items={[item({})]} viewerId={ME} />);
    expect(screen.getByText("You paid Sam £5.00")).toBeInTheDocument();
    expect(screen.getByText("Confirmed · Fri 30 Oct 2026 · Confirmed by Sam")).toBeInTheDocument();
  });

  it("strikes through payments that did not count", () => {
    render(
      <PaymentHistoryList
        items={[
          item({ id: "a", status: "declined", confirmedById: null, confirmedByName: null }),
          item({ id: "b", status: "cancelled", confirmedById: null, confirmedByName: null }),
        ]}
        viewerId={ME}
      />,
    );
    const struck = screen.getAllByText("You paid Sam £5.00");
    expect(struck).toHaveLength(2);
    for (const element of struck) expect(element).toHaveClass("line-through");
    expect(screen.getByText("Not confirmed · Fri 30 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("Cancelled · Fri 30 Oct 2026")).toBeInTheDocument();
  });

  it("groups by month", () => {
    render(
      <PaymentHistoryList
        items={[item({ id: "a" }), item({ id: "b", when: "2026-09-12T09:00:00Z" })]}
        viewerId={ME}
      />,
    );
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
  });
});
