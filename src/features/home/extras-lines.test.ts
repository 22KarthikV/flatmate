import { describe, expect, it } from "vitest";

import { eventLines, extrasLines, joinNames } from "./extras-lines";

const NOW = new Date("2026-11-03T17:30:00Z"); // 17:30 in London (GMT)

describe("joinNames", () => {
  it("joins in words", () => {
    expect(joinNames(["Grey bin"])).toBe("Grey bin");
    expect(joinNames(["Grey bin", "Blue box"])).toBe("Grey bin and Blue box");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("eventLines", () => {
  const event = (over = {}) => ({
    id: "e1",
    title: "Quiz night",
    status: "confirmed" as const,
    needsMyVote: false,
    startsAt: "2026-11-06T19:30:00Z",
    endsAt: "2026-11-06T22:00:00Z",
    ...over,
  });

  it("counts events waiting for your vote", () => {
    expect(eventLines([event({ status: "voting", needsMyVote: true })], NOW)[0]).toEqual({
      key: "events-vote",
      text: "1 event to vote on",
      href: "/events",
    });
    expect(
      eventLines(
        [
          event({ id: "a", status: "voting", needsMyVote: true }),
          event({ id: "b", status: "voting", needsMyVote: true }),
        ],
        NOW,
      )[0].text,
    ).toBe("2 events to vote on");
  });

  it("names the next confirmed event that is still ahead", () => {
    const lines = eventLines(
      [
        event({ id: "later", title: "Later", startsAt: "2026-11-20T19:00:00Z", endsAt: null }),
        event({ id: "soon" }),
        event({ id: "past", title: "Past", startsAt: "2026-10-01T19:00:00Z", endsAt: null }),
      ],
      NOW,
    );
    expect(lines).toEqual([
      { key: "events-next", text: "Next: Quiz night, Fri 6 Nov, 19:30", href: "/events/soon" },
    ]);
  });

  it("is empty with nothing to say", () => {
    expect(eventLines([], NOW)).toEqual([]);
    expect(eventLines([event({ status: "cancelled" })], NOW)).toEqual([]);
  });
});

describe("extrasLines", () => {
  const base = {
    shoppingOpen: 0,
    binsTomorrow: [] as string[],
    fixCount: null as number | null,
    pinned: null as string | null,
  };

  it("is empty when there is nothing", () => {
    expect(extrasLines(base, NOW)).toEqual([]);
  });

  it("counts the shopping list in words", () => {
    expect(extrasLines({ ...base, shoppingOpen: 1 }, NOW)[0].text).toBe(
      "1 thing on the shopping list",
    );
    expect(extrasLines({ ...base, shoppingOpen: 4 }, NOW)[0]).toEqual({
      key: "shopping",
      text: "4 things on the shopping list",
      href: "/more/shopping",
    });
  });

  it("says tonight in the evening and tomorrow earlier in the day", () => {
    const bins = { ...base, binsTomorrow: ["Grey bin", "Food waste"] };
    expect(extrasLines(bins, NOW)[0].text).toBe("Tonight: Grey bin and Food waste out");
    expect(extrasLines(bins, new Date("2026-11-03T09:00:00Z"))[0].text).toBe(
      "Tomorrow: Grey bin and Food waste",
    );
  });

  it("uses London time in summer when deciding it is evening", () => {
    const bins = { ...base, binsTomorrow: ["Grey bin"] };
    // 16:30 UTC is 17:30 BST.
    expect(extrasLines(bins, new Date("2026-07-13T16:30:00Z"))[0].text).toBe(
      "Tonight: Grey bin out",
    );
    expect(extrasLines(bins, new Date("2026-07-13T15:30:00Z"))[0].text).toBe("Tomorrow: Grey bin");
  });

  it("counts open problems and shows the pinned post", () => {
    const lines = extrasLines({ ...base, fixCount: 2, pinned: "Shoes off in the hall" }, NOW);
    expect(lines.map((l) => [l.key, l.text, l.href])).toEqual([
      ["fixes", "2 problems still open", "/more/fixes"],
      ["pinned", "Pinned: Shoes off in the hall", "/more/board"],
    ]);
    expect(extrasLines({ ...base, fixCount: 1 }, NOW)[0].text).toBe("1 problem still open");
  });

  it("never carries an amount", () => {
    const all = extrasLines(
      { shoppingOpen: 3, binsTomorrow: ["Grey bin"], fixCount: 1, pinned: "Rule" },
      NOW,
    );
    expect(all.map((l) => l.text).join(" ")).not.toMatch(/[£$]/);
  });
});
