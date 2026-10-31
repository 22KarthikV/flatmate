import { describe, expect, it } from "vitest";

import { buildComingUp } from "./coming-up";

// Tuesday 10 Nov 2026, noon in London.
const now = new Date("2026-11-10T12:00:00Z");
const bill = (id: string, dueOn: string, extra = {}) => ({
  id,
  name: `Bill ${id}`,
  dueOn,
  status: "posted",
  voided: false,
  ...extra,
});

describe("buildComingUp", () => {
  it("includes the 14-day edges and drops anything outside", () => {
    const keys = buildComingUp(
      [
        bill("yesterday", "2026-11-09"),
        bill("today", "2026-11-10"),
        bill("edge", "2026-11-24"),
        bill("far", "2026-11-25"),
      ],
      now,
    ).map((i) => i.key);
    expect(keys).toContain("bill-today");
    expect(keys).toContain("bill-edge");
    expect(keys).not.toContain("bill-yesterday");
    expect(keys).not.toContain("bill-far");
  });

  it("ignores skipped and cancelled bills", () => {
    const keys = buildComingUp(
      [bill("s", "2026-11-12", { status: "skipped" }), bill("v", "2026-11-12", { voided: true })],
      now,
    ).map((i) => i.key);
    expect(keys).toEqual(["rota-deadline"]);
  });

  it("adds the next availability deadline, sorted by date", () => {
    const items = buildComingUp([bill("late", "2026-11-20"), bill("early", "2026-11-11")], now);
    expect(items.map((i) => i.date)).toEqual(["2026-11-11", "2026-11-14", "2026-11-20"]);
    expect(items[1].text).toBe("Rota availability closes 14 Nov, 18:00");
  });

  it("moves to the following Saturday once the deadline has passed", () => {
    const after = new Date("2026-11-14T19:00:00Z");
    const deadline = buildComingUp([], after).find((i) => i.key === "rota-deadline");
    expect(deadline?.date).toBe("2026-11-21");
  });
});
