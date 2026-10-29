import { describe, expect, it } from "vitest";

import { formatBadge, formatTime, groupByDay } from "./format";

describe("formatBadge", () => {
  it("hides the badge at zero and for bad input", () => {
    expect(formatBadge(0)).toBeNull();
    expect(formatBadge(-3)).toBeNull();
    expect(formatBadge(Number.NaN)).toBeNull();
  });

  it("shows the count up to nine and 9+ above", () => {
    expect(formatBadge(1)).toBe("1");
    expect(formatBadge(9)).toBe("9");
    expect(formatBadge(10)).toBe("9+");
    expect(formatBadge(250)).toBe("9+");
  });
});

describe("groupByDay", () => {
  const now = new Date("2026-10-29T12:00:00Z");

  it("groups newest first under Today, Yesterday and a dated heading", () => {
    const items = [
      { id: "a", createdAt: "2026-10-29T11:00:00Z" },
      { id: "b", createdAt: "2026-10-29T08:00:00Z" },
      { id: "c", createdAt: "2026-10-28T20:00:00Z" },
      { id: "d", createdAt: "2026-10-20T09:00:00Z" },
    ];
    const groups = groupByDay(items, now);
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "Tue 20 Oct"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["c"]);
  });

  it("uses London days, not UTC days, around the clocks changing", () => {
    // 23:30 UTC on 30 March 2026 is 00:30 BST on the 31st, after summer time starts on the 29th.
    const march = new Date("2026-03-31T10:00:00Z");
    const groups = groupByDay([{ id: "x", createdAt: "2026-03-30T23:30:00Z" }], march);
    expect(groups[0]?.label).toBe("Today");
  });

  it("returns nothing for nothing", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe("formatTime", () => {
  it("shows the London time of day", () => {
    expect(formatTime("2026-10-29T13:05:00Z")).toBe("13:05");
    expect(formatTime("2026-07-01T13:05:00Z")).toBe("14:05");
  });
});
