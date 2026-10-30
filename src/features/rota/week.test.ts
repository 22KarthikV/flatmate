import { describe, expect, it } from "vitest";

import {
  DEADLINE_SENTENCE,
  addDays,
  availabilityDeadline,
  availabilityOpensAt,
  currentWeekStart,
  dayOfWeek,
  daysBetween,
  londonDate,
  londonParts,
  londonWallTime,
  nudgeTimes,
  upcomingWeekStart,
  weekDates,
  weekStartOf,
  weekdayName,
  windowState,
} from "./week";

describe("calendar helpers", () => {
  it("knows the day of the week", () => {
    expect(dayOfWeek("2026-11-01")).toBe(0);
    expect(weekdayName("2026-11-01")).toBe("Sunday");
    expect(weekdayName("2026-11-07")).toBe("Saturday");
  });

  it("starts the week on the Sunday on or before a date", () => {
    expect(weekStartOf("2026-11-01")).toBe("2026-11-01");
    expect(weekStartOf("2026-11-04")).toBe("2026-11-01");
    expect(weekStartOf("2026-11-07")).toBe("2026-11-01");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-08");
  });

  it("lists seven dates, Sunday first, across a month end", () => {
    expect(weekDates("2026-10-25")).toEqual([
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    expect(weekDates("2026-11-29").at(-1)).toBe("2026-12-05");
  });

  it("adds days and counts between dates across both clock changes", () => {
    expect(addDays("2027-03-27", 1)).toBe("2027-03-28");
    expect(addDays("2027-03-28", 1)).toBe("2027-03-29");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(daysBetween("2027-03-26", "2027-03-30")).toBe(4);
    expect(daysBetween("2026-10-30", "2026-10-25")).toBe(-5);
  });

  it("keeps every week of two years starting on a Sunday and seven days long", () => {
    let start = "2026-01-04";
    for (let i = 0; i < 104; i++) {
      expect(dayOfWeek(start)).toBe(0);
      const dates = weekDates(start);
      expect(new Set(dates).size).toBe(7);
      expect(daysBetween(dates[0]!, dates[6]!)).toBe(6);
      start = addDays(start, 7);
    }
  });
});

describe("London time", () => {
  it("reads London's calendar date, not UTC's, in summer", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London.
    expect(londonDate(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(londonParts(new Date("2026-06-30T23:30:00Z"))).toEqual({
      date: "2026-07-01",
      hour: 0,
      minute: 30,
    });
  });

  it("matches UTC in winter", () => {
    expect(londonDate(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });

  it("finds the instant for a wall-clock time in summer and winter", () => {
    expect(londonWallTime("2026-07-04", 18).toISOString()).toBe("2026-07-04T17:00:00.000Z");
    expect(londonWallTime("2026-12-05", 18).toISOString()).toBe("2026-12-05T18:00:00.000Z");
  });

  it("finds the right instant on the days the clocks change", () => {
    // Clocks go forward on 28 March 2027 and back on 31 October 2027.
    expect(londonWallTime("2027-03-27", 18).toISOString()).toBe("2027-03-27T18:00:00.000Z");
    expect(londonWallTime("2027-03-28", 18).toISOString()).toBe("2027-03-28T17:00:00.000Z");
    expect(londonWallTime("2027-10-30", 18).toISOString()).toBe("2027-10-30T17:00:00.000Z");
    expect(londonWallTime("2027-10-31", 18).toISOString()).toBe("2027-10-31T18:00:00.000Z");
  });
});

describe("availability window (T5)", () => {
  it("closes on the Saturday before the week, at 6pm London", () => {
    // Week starting Sunday 1 Nov 2026; London is on GMT, so 18:00 UTC.
    expect(availabilityDeadline("2026-11-01").toISOString()).toBe("2026-10-31T18:00:00.000Z");
    // Week starting Sunday 28 March 2027: the clocks go forward that very night, but at 6pm on
    // Saturday London is still on GMT.
    expect(availabilityDeadline("2027-03-28").toISOString()).toBe("2027-03-27T18:00:00.000Z");
    // Week starting 4 July 2027 (summer): 6pm BST is 17:00 UTC.
    expect(availabilityDeadline("2027-07-04").toISOString()).toBe("2027-07-03T17:00:00.000Z");
  });

  it("opens at the start of the Sunday a week ahead", () => {
    expect(availabilityOpensAt("2026-11-08").toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(availabilityOpensAt("2027-07-04").toISOString()).toBe("2027-06-26T23:00:00.000Z");
  });

  it("is exact at the boundaries", () => {
    const week = "2026-11-08";
    const close = availabilityDeadline(week);
    expect(windowState(new Date(close.getTime() - 1), week)).toBe("open");
    expect(windowState(close, week)).toBe("closed");
    const open = availabilityOpensAt(week);
    expect(windowState(new Date(open.getTime() - 1), week)).toBe("not_open");
    expect(windowState(open, week)).toBe("open");
  });

  it("asks about the week after the current one", () => {
    // Friday 30 Oct 2026: this week began 25 Oct, the one being asked about begins 1 Nov.
    const friday = new Date("2026-10-30T12:00:00Z");
    expect(currentWeekStart(friday)).toBe("2026-10-25");
    expect(upcomingWeekStart(friday)).toBe("2026-11-01");
    // Sunday morning starts a new week and opens the next window.
    expect(upcomingWeekStart(new Date("2026-11-01T08:00:00Z"))).toBe("2026-11-08");
    // Late on Saturday night in summer London is already Sunday in London.
    expect(upcomingWeekStart(new Date("2027-07-03T23:30:00Z"))).toBe("2027-07-11");
  });

  it("puts the nudges three days before and on the morning of the close", () => {
    const { first, last } = nudgeTimes("2026-11-08");
    expect(first.toISOString()).toBe("2026-11-04T09:00:00.000Z");
    expect(last.toISOString()).toBe("2026-11-07T09:00:00.000Z");
    expect(last < availabilityDeadline("2026-11-08")).toBe(true);
  });

  it("states the deadline and the consequence in plain words", () => {
    expect(DEADLINE_SENTENCE).toContain("Saturday 6pm");
    expect(DEADLINE_SENTENCE).toContain("available every day");
    expect(DEADLINE_SENTENCE).toContain("any chore");
  });
});

describe("shortDate", () => {
  it("writes a day and month", async () => {
    const { shortDate } = await import("./week");
    expect(shortDate("2026-11-08")).toBe("8 Nov");
    expect(shortDate("2027-03-28")).toBe("28 Mar");
  });
});

describe("the deadline sentence in the database", () => {
  it("is word for word the one the nudges send", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261117000000_rota_availability.sql", "utf8");
    expect(sql).toContain(DEADLINE_SENTENCE);
  });
});
