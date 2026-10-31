import { describe, expect, it } from "vitest";

import { dayWord, groupByDate, nextCollections } from "./view";
import type { Collection } from "./collections";

const c = (date: string, name: string): Collection => ({
  date,
  streamId: name,
  name,
  colour: "grey",
  moved: false,
  originalOn: date,
  note: null,
});

describe("dayWord", () => {
  it("says today and tomorrow in words, otherwise the weekday and date", () => {
    expect(dayWord("2026-11-03", "2026-11-03")).toBe("Today");
    expect(dayWord("2026-11-04", "2026-11-03")).toBe("Tomorrow");
    expect(dayWord("2026-11-10", "2026-11-03")).toBe("Tuesday 10 Nov");
  });
});

describe("groupByDate", () => {
  it("puts bins on the same day together", () => {
    const groups = groupByDate([
      c("2026-11-03", "Grey bin"),
      c("2026-11-03", "Blue box"),
      c("2026-11-10", "Grey bin"),
    ]);
    expect(groups.map((g) => [g.date, g.items.map((i) => i.name)])).toEqual([
      ["2026-11-03", ["Grey bin", "Blue box"]],
      ["2026-11-10", ["Grey bin"]],
    ]);
  });
});

describe("nextCollections", () => {
  it("looks six weeks ahead from today", () => {
    const found = nextCollections(
      [{ id: "s", name: "Grey bin", colour: "grey", anchorOn: "2026-11-03", everyWeeks: 1 }],
      [],
      "2026-11-03",
    );
    expect(found[0].date).toBe("2026-11-03");
    expect(found.at(-1)?.date).toBe("2026-12-15");
    expect(found).toHaveLength(7);
  });
});
