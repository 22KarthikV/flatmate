import { describe, expect, it } from "vitest";

import {
  describeMonths,
  describeSchedule,
  instanceStatusLabel,
  monthLabel,
  ordinal,
  shortDay,
} from "./format";

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("formatting", () => {
  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 6, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "6th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "28th",
    ]);
  });

  it("writes a month and a short day", () => {
    expect(monthLabel("2026-11-01")).toBe("November 2026");
    expect(monthLabel("2027-01-06")).toBe("January 2027");
    expect(shortDay("2026-11-12")).toBe("12 Nov");
    expect(shortDay("nonsense")).toBe("nonsense");
  });

  it("describes which months apply", () => {
    expect(describeMonths(ALL)).toBe("every month");
    expect(describeMonths([1, 2, 4, 5, 6, 7, 8, 9, 10, 11])).toBe("10 months a year");
    expect(describeMonths([6, 7, 8])).toBe("Jun, Jul, Aug");
  });

  it("describes a schedule in a line", () => {
    expect(describeSchedule({ dueDay: 12, amountMode: "variable", activeMonths: ALL })).toBe(
      "Due on the 12th · amount changes each month · every month",
    );
    expect(
      describeSchedule({
        dueDay: 1,
        amountMode: "fixed",
        activeMonths: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11],
      }),
    ).toBe("Due on the 1st · same amount each month · 10 months a year");
  });

  it("labels a month's state", () => {
    expect(instanceStatusLabel("awaiting_amount")).toBe("Waiting for the amount");
    expect(instanceStatusLabel("posted")).toBe("Created");
    expect(instanceStatusLabel("skipped")).toBe("Skipped");
    expect(instanceStatusLabel("cancelled")).toBe("Cancelled");
  });
});
