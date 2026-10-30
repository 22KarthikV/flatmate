import { describe, expect, it } from "vitest";

import { daysFor, statusFor, summarise, type AvailabilityRow } from "./availability-summary";

const WEEK = "2026-11-08";
const row = (
  profileId: string,
  onDate: string,
  available: boolean,
  assumed = false,
): AvailabilityRow => ({
  profileId,
  onDate,
  available,
  assumed,
});

describe("daysFor", () => {
  it("lists seven days from Sunday with labels, and treats a missing day as around", () => {
    const days = daysFor(WEEK, [row("a", "2026-11-10", false)]);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({
      date: "2026-11-08",
      weekday: "Sunday",
      short: "8 Nov",
      available: true,
    });
    expect(days[2]).toMatchObject({ weekday: "Tuesday", available: false });
    expect(days[6]).toMatchObject({ weekday: "Saturday", short: "14 Nov" });
  });
});

describe("statusFor", () => {
  it("is waiting with no rows, assumed when all were filled in, answered otherwise", () => {
    expect(statusFor([])).toBe("waiting");
    expect(statusFor([row("a", "2026-11-08", true, true)])).toBe("assumed");
    expect(statusFor([row("a", "2026-11-08", true, false)])).toBe("answered");
  });
});

describe("summarise", () => {
  it("gives each person a status and the days they are away", () => {
    const people = [
      { profileId: "a", displayName: "Alice" },
      { profileId: "b", displayName: "Bob" },
      { profileId: "c", displayName: "Carol" },
    ];
    const rows = [
      row("a", "2026-11-09", false),
      row("a", "2026-11-10", true),
      row("b", "2026-11-09", true, true),
    ];
    expect(summarise(WEEK, people, rows)).toEqual([
      { profileId: "a", displayName: "Alice", status: "answered", awayDays: ["Monday"] },
      { profileId: "b", displayName: "Bob", status: "assumed", awayDays: [] },
      { profileId: "c", displayName: "Carol", status: "waiting", awayDays: [] },
    ]);
  });
});
