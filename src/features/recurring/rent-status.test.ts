import { describe, expect, it } from "vitest";

import {
  isRentStatus,
  rentStatusLabel,
  summariseMonth,
  totalOwed,
  type DashboardRow,
} from "./rent-status";

function row(extra: Partial<DashboardRow>): DashboardRow {
  return {
    chargeId: "c",
    profileId: "p",
    displayName: "Alice",
    stillInFlat: true,
    roomName: null,
    period: "2026-11-01",
    dueOn: "2026-11-06",
    amountPence: 60_000,
    coveredPence: 0,
    pendingPence: 0,
    outstandingPence: 60_000,
    status: "outstanding",
    ...extra,
  };
}

describe("rent status", () => {
  it("has a plain label for each status", () => {
    expect(rentStatusLabel("paid")).toBe("Paid");
    expect(rentStatusLabel("pending")).toBe("Waiting to be confirmed");
    expect(rentStatusLabel("part_paid")).toBe("Part paid");
    expect(rentStatusLabel("outstanding")).toBe("Not paid yet");
  });

  it("recognises only the four statuses", () => {
    expect(isRentStatus("paid")).toBe(true);
    expect(isRentStatus("overdue")).toBe(false);
    expect(isRentStatus(null)).toBe(false);
  });

  it("adds up what a person still owes", () => {
    expect(totalOwed([{ outstandingPence: 60_000 }, { outstandingPence: 5000 }])).toBe(65_000);
    expect(totalOwed([])).toBe(0);
  });

  it("summarises a month for the collector, to the penny", () => {
    const summary = summariseMonth([
      row({ status: "paid", coveredPence: 60_000, outstandingPence: 0 }),
      row({ status: "pending", pendingPence: 55_000, outstandingPence: 0, amountPence: 55_000 }),
      row({ status: "part_paid", coveredPence: 20_000, outstandingPence: 40_000 }),
      row({ status: "outstanding", amountPence: 10_000, outstandingPence: 10_000 }),
    ]);
    expect(summary).toEqual({
      duePence: 185_000,
      paidPence: 80_000,
      pendingPence: 55_000,
      outstandingPence: 50_000,
      counts: { paid: 1, pending: 1, part_paid: 1, outstanding: 1 },
    });
  });
});
