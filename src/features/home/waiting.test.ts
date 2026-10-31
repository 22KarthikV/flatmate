import { describe, expect, it } from "vitest";

import { buildWaiting, WAITING_CAP, type WaitingInput } from "./waiting";

const none: WaitingInput = {
  availabilityOpen: false,
  payments: [],
  bills: [],
  swaps: [],
};

describe("buildWaiting", () => {
  it("is empty when nothing waits", () => {
    expect(buildWaiting(none)).toEqual({ items: [], more: 0 });
  });

  it("asks for availability only while the window is open and unanswered", () => {
    expect(buildWaiting({ ...none, availabilityOpen: true }).items).toEqual([
      {
        key: "availability",
        text: "Say which days you're around next week. Closes Saturday 18:00",
        href: "/rota/availability",
      },
    ]);
    expect(buildWaiting(none).items).toHaveLength(0);
  });

  it("orders availability, payments, bill amounts, then swaps", () => {
    const { items } = buildWaiting({
      availabilityOpen: true,
      payments: [{ id: "p1", otherName: "Sam" }],
      bills: [{ id: "b1", name: "Gas", dueOn: "2026-11-12" }],
      swaps: [{ id: "s1", fromName: "Riyon", choreName: "Bins" }],
    });
    expect(items.map((item) => item.text)).toEqual([
      "Say which days you're around next week. Closes Saturday 18:00",
      "Sam says they paid you. Please confirm",
      "Enter this month's Gas amount, due 12 Nov",
      "Riyon asked to swap Bins with you",
    ]);
    expect(items.map((item) => item.href)).toEqual([
      "/rota/availability",
      "/money",
      "/money/recurring/instances/b1/amount",
      "/rota",
    ]);
  });

  it("caps the list and counts the rest", () => {
    const result = buildWaiting({
      availabilityOpen: true,
      payments: [
        { id: "p1", otherName: "Sam" },
        { id: "p2", otherName: "Kim" },
      ],
      bills: [{ id: "b1", name: "Gas", dueOn: "2026-11-12" }],
      swaps: [{ id: "s1", fromName: "Riyon", choreName: "Bins" }],
    });
    expect(WAITING_CAP).toBe(4);
    expect(result.items).toHaveLength(4);
    expect(result.more).toBe(1);
  });
});
