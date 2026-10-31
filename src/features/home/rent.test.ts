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
  it("shows the earliest unpaid month, even next month's", () => {
    const result = thisMonthsRent(
      [row("2026-10-01", "paid"), row("2026-12-01", "outstanding")],
      "2026-11-28",
    );
    expect(result?.dueOn).toBe("1 Dec");
  });

  it("shows this month's paid row when nothing is owing", () => {
    const result = thisMonthsRent(
      [row("2026-10-01", "paid"), row("2026-11-01", "paid")],
      "2026-11-10",
    );
    expect(result).toMatchObject({ dueOn: "1 Nov", paid: true });
  });

  it("picks this month's row over a paid older one", () => {
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

  it("is null when no rent is set up", () => {
    expect(thisMonthsRent([], "2026-11-10")).toBeNull();
    expect(thisMonthsRent([row("2026-10-01", "paid")], "2026-11-10")).toBeNull();
  });
});
