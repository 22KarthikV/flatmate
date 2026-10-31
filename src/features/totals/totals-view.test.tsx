import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Totals } from "./totals";
import { TotalsView } from "./totals-view";

const empty = { totalPence: 0, pendingRentPence: 0, lines: [] };

describe("TotalsView", () => {
  it("says plainly when nothing is owed either way", () => {
    render(<TotalsView totals={{ owe: empty, owed: empty }} />);
    expect(screen.getByText("You don’t owe anyone anything right now.")).toBeInTheDocument();
    expect(screen.getByText("Nobody owes you anything right now.")).toBeInTheDocument();
  });

  it("shows each person with rent and bills together, and the totals", () => {
    const totals: Totals = {
      owe: {
        totalPence: 61_250,
        pendingRentPence: 0,
        lines: [
          {
            profileId: "sam",
            name: "Sam",
            rentPence: 60_000,
            billsPence: 1250,
            totalPence: 61_250,
          },
        ],
      },
      owed: {
        totalPence: 2000,
        pendingRentPence: 60_000,
        lines: [
          { profileId: "kim", name: "Kim", rentPence: 0, billsPence: 2000, totalPence: 2000 },
        ],
      },
    };
    render(<TotalsView totals={totals} />);

    expect(screen.getAllByText("£612.50")).toHaveLength(2);
    expect(screen.getByText("Rent £600.00 · Bills and expenses £12.50")).toBeInTheDocument();
    expect(screen.getByText("Bills and expenses £20.00")).toBeInTheDocument();
    expect(screen.getByText(/£600.00 of rent has been marked as paid/)).toBeInTheDocument();
  });
});
