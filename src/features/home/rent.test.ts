import { describe, expect, it } from "vitest";

import type { MyRentRow } from "@/features/recurring/rent-status";

import { thisMonthsRent } from "./rent";

const row = (period: string, status: MyRentRow["status"]): MyRentRow => ({
  chargeId: period,
  period,
  dueOn: period.slice(0, 8) + "01",
  amountPence: 45000,
  coveredPence: 0,
  pendingPence: 0,
  outstandingPence: 45000,
  status,
  collectorId: "c",
  collectorName: "Riyon",
});

describe("thisMonthsRent", () => {
  it("picks this month's row only", () => {
    const result = thisMonthsRent(
      [row("2026-10-01", "paid"), row("2026-11-01", "outstanding")],
      "2026-11-10",
    );
    expect(result).toEqual({
      amount: "£450.00",
      dueOn: "1 Nov",
      payTo: "Riyon",
      statusText: "Not paid yet",
      paid: false,
    });
  });

  it("is null when no rent is set up for the month", () => {
    expect(thisMonthsRent([], "2026-11-10")).toBeNull();
    expect(thisMonthsRent([row("2026-10-01", "paid")], "2026-11-10")).toBeNull();
  });
});
