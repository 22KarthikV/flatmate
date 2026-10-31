import { describe, expect, it } from "vitest";

import { usageBetween, usageText, type Reading } from "./usage";

const r = (readOn: string, value: number, over: Partial<Reading> = {}): Reading => ({
  id: readOn,
  readOn,
  value,
  isReset: false,
  voided: false,
  ...over,
});

describe("usageBetween", () => {
  it("works out use between consecutive readings, in date order", () => {
    const gaps = usageBetween([r("2026-11-01", 1214), r("2026-10-01", 1000)]);
    expect(gaps).toEqual([
      {
        fromId: "2026-10-01",
        toId: "2026-11-01",
        from: "2026-10-01",
        to: "2026-11-01",
        days: 31,
        used: 214,
        perDay: 214 / 31,
      },
    ]);
  });

  it("gives nothing for none or one reading", () => {
    expect(usageBetween([])).toEqual([]);
    expect(usageBetween([r("2026-10-01", 5)])).toEqual([]);
  });

  it("does not work out use across a reset reading", () => {
    const gaps = usageBetween([
      r("2026-10-01", 9000),
      r("2026-11-01", 50, { isReset: true }),
      r("2026-12-01", 150),
    ]);
    expect(gaps.map((g) => [g.from, g.to, g.used])).toEqual([["2026-11-01", "2026-12-01", 100]]);
  });

  it("ignores cancelled readings, joining their neighbours", () => {
    const gaps = usageBetween([
      r("2026-10-01", 1000),
      r("2026-10-15", 99999, { voided: true }),
      r("2026-11-01", 1214),
    ]);
    expect(gaps.map((g) => [g.from, g.to, g.used, g.days])).toEqual([
      ["2026-10-01", "2026-11-01", 214, 31],
    ]);
  });

  it("counts days as calendar days across both clock changes", () => {
    expect(usageBetween([r("2026-03-01", 0), r("2026-04-01", 31)])[0].days).toBe(31);
    expect(usageBetween([r("2026-10-01", 0), r("2026-11-01", 31)])[0].days).toBe(31);
    expect(usageBetween([r("2026-10-24", 0), r("2026-10-26", 2)])[0].days).toBe(2);
  });

  it("keeps decimals exact", () => {
    expect(usageBetween([r("2026-10-01", 10.125), r("2026-10-02", 10.375)])[0].used).toBe(0.25);
  });
});

describe("usageText", () => {
  const gap = (used: number, days: number) => ({
    fromId: "a",
    toId: "b",
    from: "2026-10-01",
    to: "2026-11-01",
    days,
    used,
    perDay: used / days,
  });

  it("reads like the spec example", () => {
    expect(usageText(gap(214, 31), "kWh")).toBe("Used 214 kWh in 31 days, about 7 a day.");
  });
  it("uses the singular for one day and shows m³ for cubic metres", () => {
    expect(usageText(gap(3, 1), "m3")).toBe("Used 3 m³ in 1 day, about 3 a day.");
  });
  it("keeps small rates readable", () => {
    expect(usageText(gap(31, 31), "kWh")).toBe("Used 31 kWh in 31 days, about 1 a day.");
    expect(usageText(gap(1.5, 31), "m3")).toBe("Used 1.5 m³ in 31 days, about 0.05 a day.");
    expect(usageText(gap(100, 31), "kWh")).toContain("about 3.2 a day");
  });
});
