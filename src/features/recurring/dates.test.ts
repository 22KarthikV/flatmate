import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  dueDateFor,
  generateOn,
  isActiveMonth,
  isReminderDay,
  isValidDueDay,
  londonDate,
  periodOf,
  periodsToGenerate,
  reminderDates,
  ALL_MONTHS,
} from "./dates";

describe("calendar helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("finds the period and moves between months over the year boundary", () => {
    expect(periodOf("2026-11-17")).toBe("2026-11-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2027-01-01", -1)).toBe("2026-12-01");
    expect(addMonths("2026-11-01", 14)).toBe("2028-01-01");
  });

  it("takes London's date, not the UTC date", () => {
    // 23:30 UTC on 30 June is already 1 July in London (British Summer Time).
    expect(londonDate(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(londonDate(new Date("2026-12-30T23:30:00Z"))).toBe("2026-12-30");
  });
});

describe("due dates", () => {
  it("accepts only days 1 to 28", () => {
    expect(isValidDueDay(1)).toBe(true);
    expect(isValidDueDay(28)).toBe(true);
    expect(isValidDueDay(0)).toBe(false);
    expect(isValidDueDay(29)).toBe(false);
    expect(isValidDueDay(6.5)).toBe(false);
  });

  it("builds the due date of a period", () => {
    expect(dueDateFor("2026-11-01", 6)).toBe("2026-11-06");
    expect(dueDateFor("2026-02-01", 28)).toBe("2026-02-28");
    expect(dueDateFor("2026-12-01", 1)).toBe("2026-12-01");
  });

  it("refuses a due day outside 1 to 28", () => {
    expect(() => dueDateFor("2026-02-01", 31)).toThrow();
  });
});

describe("active months", () => {
  it("is checked against the month of the due date", () => {
    const tenMonths = ALL_MONTHS.filter((m) => m !== 2 && m !== 3); // council tax: none in Feb or Mar
    expect(isActiveMonth("2026-11-01", tenMonths)).toBe(true);
    expect(isActiveMonth("2027-02-01", tenMonths)).toBe(false);
    expect(isActiveMonth("2027-03-01", tenMonths)).toBe(false);
  });
});

describe("when a month is created", () => {
  it("is 7 days ahead for rent and fixed bills and 14 for variable bills", () => {
    expect(generateOn("2026-11-06", "rent")).toBe("2026-10-30");
    expect(generateOn("2026-11-12", "fixed")).toBe("2026-11-05");
    expect(generateOn("2026-11-12", "variable")).toBe("2026-10-29");
  });

  it("crosses the year boundary", () => {
    expect(generateOn("2027-01-03", "rent")).toBe("2026-12-27");
    expect(generateOn("2027-01-03", "variable")).toBe("2026-12-20");
  });
});

describe("periodsToGenerate", () => {
  const base = { dueDay: 6, shape: "rent" as const, activeMonths: ALL_MONTHS };

  it("creates nothing before the window opens", () => {
    expect(periodsToGenerate({ ...base, today: "2026-10-29" })).toEqual([]);
  });

  it("creates next month's rent on the first day of its window", () => {
    expect(periodsToGenerate({ ...base, today: "2026-10-30" })).toEqual(["2026-11-01"]);
  });

  it("catches up a day the job missed while the month is still due", () => {
    expect(periodsToGenerate({ ...base, today: "2026-11-04" })).toEqual(["2026-11-01"]);
    expect(periodsToGenerate({ ...base, today: "2026-11-06" })).toEqual(["2026-11-01"]);
  });

  it("never backfills a month whose due date has passed", () => {
    expect(periodsToGenerate({ ...base, today: "2026-11-07" })).toEqual([]);
    expect(periodsToGenerate({ ...base, today: "2026-11-20" })).toEqual([]);
  });

  it("starts a rent due on the 7th set up on the 30th with the next 7th", () => {
    const set = { ...base, dueDay: 7 };
    // This month's 7th has gone and is not created; the next 7th appears when its window opens.
    expect(periodsToGenerate({ ...set, today: "2026-11-30" })).toEqual(["2026-12-01"]);
    expect(periodsToGenerate({ ...set, today: "2026-10-30" })).toEqual([]);
    expect(periodsToGenerate({ ...set, today: "2026-11-08" })).toEqual([]);
    expect(periodsToGenerate({ ...set, today: "2026-11-29" })).toEqual([]);
  });

  it("starts a template made inside its window with the upcoming month", () => {
    expect(periodsToGenerate({ ...base, today: "2026-11-02" })).toEqual(["2026-11-01"]);
  });

  it("opens a variable bill two weeks ahead", () => {
    const gas = { dueDay: 12, shape: "variable" as const, activeMonths: ALL_MONTHS };
    expect(periodsToGenerate({ ...gas, today: "2026-10-28" })).toEqual([]);
    expect(periodsToGenerate({ ...gas, today: "2026-10-29" })).toEqual(["2026-11-01"]);
    expect(periodsToGenerate({ ...gas, today: "2026-11-05" })).toEqual(["2026-11-01"]);
  });

  it("crosses into the next year", () => {
    expect(periodsToGenerate({ ...base, dueDay: 3, today: "2026-12-27" })).toEqual(["2027-01-01"]);
    expect(periodsToGenerate({ ...base, dueDay: 3, today: "2026-12-26" })).toEqual([]);
  });

  it("skips inactive months", () => {
    const tenMonths = ALL_MONTHS.filter((m) => m !== 2 && m !== 3);
    const tax = { dueDay: 15, shape: "variable" as const, activeMonths: tenMonths };
    expect(periodsToGenerate({ ...tax, today: "2027-02-05" })).toEqual([]);
    expect(periodsToGenerate({ ...tax, today: "2027-03-05" })).toEqual([]);
    expect(periodsToGenerate({ ...tax, today: "2027-04-05" })).toEqual(["2027-04-01"]);
  });
});

describe("reminders", () => {
  it("rent: 7, 3, 2 and 1 days before, the day, then every day", () => {
    expect(reminderDates("2026-11-06", "rent", "2026-11-10")).toEqual([
      "2026-10-30",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
    ]);
  });

  it("variable bill: 14, 7, 3 and 1 days before, the day, then every day", () => {
    expect(reminderDates("2026-11-12", "variable", "2026-11-14")).toEqual([
      "2026-10-29",
      "2026-11-05",
      "2026-11-09",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
  });

  it("answers for a single day", () => {
    const check = (today: string, kind: "rent" | "variable") =>
      isReminderDay({ today, dueDate: "2026-11-06", kind });
    expect(check("2026-10-30", "rent")).toBe(true);
    expect(check("2026-10-31", "rent")).toBe(false);
    expect(check("2026-11-06", "rent")).toBe(true);
    expect(check("2026-11-20", "rent")).toBe(true);
    expect(check("2026-10-23", "variable")).toBe(true);
    expect(check("2026-10-30", "variable")).toBe(true);
    expect(check("2026-10-27", "variable")).toBe(false);
  });

  it("crosses the year boundary", () => {
    expect(reminderDates("2027-01-03", "rent", "2027-01-03").slice(0, 2)).toEqual([
      "2026-12-27",
      "2026-12-31",
    ]);
  });
});
