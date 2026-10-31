import { describe, expect, it } from "vitest";

import {
  defaultDeadline,
  londonLocalToInstant,
  parseAnswer,
  parseEventForm,
  parseEventId,
  type RawEvent,
} from "./schemas";

const now = new Date("2026-11-02T12:00:00Z");

const base: RawEvent = {
  title: "Pizza night",
  description: "",
  location: "",
  dates: [
    { start: "2026-11-06T19:30", end: "" },
    { start: "2026-11-07T19:30", end: "2026-11-07T22:00" },
  ],
  deadline: "2026-11-04T18:00",
};

function message(raw: RawEvent): string | null {
  const result = parseEventForm(raw, now);
  return result.ok ? null : result.message;
}

describe("parseEventForm", () => {
  it("accepts a proposal and reads times as London time", () => {
    const result = parseEventForm({ ...base, location: "  Our kitchen " }, now);
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Pizza night",
        description: "",
        location: "Our kitchen",
        options: [
          { startsAt: "2026-11-06T19:30:00.000Z", endsAt: null },
          { startsAt: "2026-11-07T19:30:00.000Z", endsAt: "2026-11-07T22:00:00.000Z" },
        ],
        deadline: "2026-11-04T18:00:00.000Z",
      },
    });
  });

  it("limits the text", () => {
    expect(message({ ...base, title: "  " })).toMatch(/title/);
    expect(message({ ...base, title: "x".repeat(81) })).toMatch(/80/);
    expect(message({ ...base, description: "x".repeat(501) })).toMatch(/500/);
    expect(message({ ...base, location: "x".repeat(101) })).toMatch(/100/);
    expect(message({ ...base, title: "x".repeat(80), description: "x".repeat(500) })).toBeNull();
  });

  it("wants two to eight dates", () => {
    expect(message({ ...base, dates: [base.dates[0]!] })).toMatch(/two dates/);
    expect(message({ ...base, dates: [base.dates[0]!, { start: "", end: "" }] })).toMatch(
      /two dates/,
    );
    const nine = Array.from({ length: 9 }, (_, i) => ({
      start: `2026-11-${String(10 + i).padStart(2, "0")}T19:00`,
      end: "",
    }));
    expect(message({ ...base, dates: nine })).toMatch(/up to 8/);
    expect(message({ ...base, dates: nine.slice(0, 8) })).toBeNull();
  });

  it("wants future dates, sensible ends and no duplicates", () => {
    expect(
      message({ ...base, dates: [{ start: "2026-11-01T19:00", end: "" }, base.dates[1]!] }),
    ).toMatch(/future/);
    expect(
      message({
        ...base,
        dates: [{ start: "2026-11-06T19:30", end: "2026-11-06T19:30" }, base.dates[1]!],
      }),
    ).toMatch(/end time/);
    expect(message({ ...base, dates: [base.dates[0]!, base.dates[0]!] })).toMatch(/different/);
  });

  it("wants voting to close after now and before the first date", () => {
    expect(message({ ...base, deadline: "2026-11-02T11:00" })).toMatch(/future/);
    expect(message({ ...base, deadline: "2026-11-06T19:30" })).toMatch(/before the first/);
    expect(message({ ...base, deadline: "" })).toMatch(/closes/);
  });
});

describe("times in London", () => {
  it("keeps 19:30 on the Friday after the clocks go back", () => {
    // The clocks went back on 25 October 2026, so 19:30 is UTC again.
    expect(londonLocalToInstant("2026-10-30T19:30")?.toISOString()).toBe(
      "2026-10-30T19:30:00.000Z",
    );
    expect(londonLocalToInstant("2026-10-23T19:30")?.toISOString()).toBe(
      "2026-10-23T18:30:00.000Z",
    );
  });

  it("keeps 19:30 on the Friday after the clocks go forward", () => {
    // The clocks go forward on 28 March 2027: 19:30 is then an hour before UTC.
    expect(londonLocalToInstant("2027-04-02T19:30")?.toISOString()).toBe(
      "2027-04-02T18:30:00.000Z",
    );
    expect(londonLocalToInstant("2027-03-26T19:30")?.toISOString()).toBe(
      "2027-03-26T19:30:00.000Z",
    );
  });

  it("rejects things that are not a date and time", () => {
    expect(londonLocalToInstant("tomorrow")).toBeNull();
    expect(londonLocalToInstant("2026-13-40T25:00")).toBeNull();
  });
});

describe("defaultDeadline", () => {
  it("is three days out, or a day before the first date when that is sooner", () => {
    expect(defaultDeadline(now, null).toISOString()).toBe("2026-11-05T12:00:00.000Z");
    expect(defaultDeadline(now, new Date("2026-11-20T19:00:00Z")).toISOString()).toBe(
      "2026-11-05T12:00:00.000Z",
    );
    expect(defaultDeadline(now, new Date("2026-11-04T19:00:00Z")).toISOString()).toBe(
      "2026-11-03T19:00:00.000Z",
    );
  });
});

describe("ids and answers", () => {
  it("only accepts uuids", () => {
    expect(parseEventId("e1000000-0000-0000-0000-000000000001")).toBe(
      "e1000000-0000-0000-0000-000000000001",
    );
    expect(parseEventId("nope")).toBeNull();
    expect(parseEventId(undefined)).toBeNull();
  });

  it("reads yes, maybe, no, and clear", () => {
    expect(parseAnswer("yes")).toBe("yes");
    expect(parseAnswer("clear")).toBeNull();
    expect(parseAnswer("sure")).toBeUndefined();
  });
});
