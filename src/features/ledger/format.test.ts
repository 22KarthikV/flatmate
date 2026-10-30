import { describe, expect, it } from "vitest";

import { formatDay, groupByMonth } from "./format";

describe("formatDay", () => {
  it("writes a date-only value as the same calendar day, whatever the timezone", () => {
    expect(formatDay("2026-10-30")).toBe("Fri 30 Oct 2026");
    expect(formatDay("2026-01-01")).toBe("Thu 1 Jan 2026");
  });

  it("returns the input when it is not a date", () => {
    expect(formatDay("not a date")).toBe("not a date");
  });
});

describe("groupByMonth", () => {
  it("groups newest-first items by month of the expense date", () => {
    const items = [
      { id: "1", occurredOn: "2026-10-30" },
      { id: "2", occurredOn: "2026-10-02" },
      { id: "3", occurredOn: "2026-09-28" },
    ];
    expect(groupByMonth(items)).toEqual([
      { key: "2026-10", label: "October 2026", items: [items[0], items[1]] },
      { key: "2026-09", label: "September 2026", items: [items[2]] },
    ]);
  });

  it("is empty for no items", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
