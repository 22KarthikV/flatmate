import { describe, expect, it } from "vitest";

import { collectionsBetween, isPatternDay, type BinException, type BinStream } from "./collections";
import { PARITY_VECTORS } from "./parity-vectors";

const stream = (over: Partial<BinStream> = {}): BinStream => ({
  id: "s1",
  name: "Grey bin",
  colour: "grey",
  anchorOn: "2026-11-03",
  everyWeeks: 1,
  ...over,
});

const skip = (originalOn: string): BinException => ({
  streamId: "s1",
  originalOn,
  kind: "skip",
  movedTo: null,
  note: null,
});

describe("shared vectors (the SQL reminder runs the same cases)", () => {
  it.each(PARITY_VECTORS.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
    const s = stream({ anchorOn: vector.anchor, everyWeeks: vector.everyWeeks });
    const exceptions: BinException[] = vector.exceptions.map((e) => ({
      streamId: "s1",
      originalOn: e.originalOn,
      kind: e.kind,
      movedTo: e.movedTo ?? null,
      note: null,
    }));
    const found = collectionsBetween([s], exceptions, vector.date, vector.date);
    expect(found.length === 1).toBe(vector.collected);
  });
});

describe("isPatternDay", () => {
  it("is true on every n weeks from the anchor, before and after", () => {
    const s = stream({ everyWeeks: 2 });
    expect(isPatternDay(s, "2026-11-03")).toBe(true);
    expect(isPatternDay(s, "2026-11-17")).toBe(true);
    expect(isPatternDay(s, "2026-10-20")).toBe(true);
    expect(isPatternDay(s, "2026-11-10")).toBe(false);
  });
});

describe("collectionsBetween", () => {
  it("lists collections in date order, then by name, across month and year ends", () => {
    const found = collectionsBetween(
      [
        stream({ id: "a", name: "Grey bin", anchorOn: "2026-12-29" }),
        stream({ id: "b", name: "Blue box", anchorOn: "2026-12-29", everyWeeks: 2 }),
      ],
      [],
      "2026-12-28",
      "2027-01-12",
    );
    expect(found.map((c) => `${c.date} ${c.name}`)).toEqual([
      "2026-12-29 Blue box",
      "2026-12-29 Grey bin",
      "2027-01-05 Grey bin",
      "2027-01-12 Blue box",
      "2027-01-12 Grey bin",
    ]);
  });

  it("marks a moved collection and keeps where it came from", () => {
    const found = collectionsBetween(
      [stream()],
      [
        {
          streamId: "s1",
          originalOn: "2026-11-10",
          kind: "move",
          movedTo: "2026-11-12",
          note: "Strike",
        },
      ],
      "2026-11-09",
      "2026-11-13",
    );
    expect(found).toEqual([
      expect.objectContaining({
        date: "2026-11-12",
        moved: true,
        originalOn: "2026-11-10",
        note: "Strike",
      }),
    ]);
  });

  it("drops a skipped collection", () => {
    const found = collectionsBetween([stream()], [skip("2026-11-10")], "2026-11-09", "2026-11-17");
    expect(found.map((c) => c.date)).toEqual(["2026-11-17"]);
  });

  it("ignores other bins' exceptions and gives nothing for an empty range", () => {
    expect(
      collectionsBetween(
        [stream()],
        [{ ...skip("2026-11-10"), streamId: "other" }],
        "2026-11-10",
        "2026-11-10",
      ),
    ).toHaveLength(1);
    expect(collectionsBetween([stream()], [], "2026-11-11", "2026-11-10")).toEqual([]);
  });
});
