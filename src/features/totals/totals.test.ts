import { describe, expect, it } from "vitest";

import type { SuggestedPayment } from "@/features/ledger/balance-view";

import { buildTotals } from "./totals";

const ME = "me";

const payment = (over: Partial<SuggestedPayment>): SuggestedPayment => ({
  fromId: "a",
  toId: "b",
  fromName: "A",
  toName: "B",
  pence: 0,
  youPay: false,
  youReceive: false,
  involvesYou: false,
  ...over,
});

describe("buildTotals", () => {
  it("is empty when nothing is owed either way", () => {
    expect(buildTotals({ payments: [], rentIOwe: [], rentOwedToMe: [] })).toEqual({
      owe: { totalPence: 0, pendingRentPence: 0, lines: [] },
      owed: { totalPence: 0, pendingRentPence: 0, lines: [] },
    });
  });

  it("adds rent to what you owe the same person for bills and expenses", () => {
    const totals = buildTotals({
      payments: [payment({ fromId: ME, toId: "sam", toName: "Sam", pence: 1250, youPay: true })],
      rentIOwe: [
        { collectorId: "sam", collectorName: "Sam", outstandingPence: 60_000, pendingPence: 0 },
      ],
      rentOwedToMe: [],
    });
    expect(totals.owe.lines).toEqual([
      { profileId: "sam", name: "Sam", rentPence: 60_000, billsPence: 1250, totalPence: 61_250 },
    ]);
    expect(totals.owe.totalPence).toBe(61_250);
    expect(totals.owed.totalPence).toBe(0);
  });

  it("keeps what you owe separate from what you are owed, even for the same person", () => {
    const totals = buildTotals({
      payments: [
        payment({ fromId: "kim", toId: ME, fromName: "Kim", pence: 2000, youReceive: true }),
      ],
      rentIOwe: [
        { collectorId: "kim", collectorName: "Kim", outstandingPence: 50_000, pendingPence: 0 },
      ],
      rentOwedToMe: [],
    });
    expect(totals.owe.totalPence).toBe(50_000);
    expect(totals.owed.totalPence).toBe(2000);
    expect(totals.owed.lines[0]).toMatchObject({ name: "Kim", billsPence: 2000, rentPence: 0 });
  });

  it("lists each person who owes you, with rent and bills together, biggest first", () => {
    const totals = buildTotals({
      payments: [
        payment({ fromId: "bob", toId: ME, fromName: "Bob", pence: 700, youReceive: true }),
        payment({ fromId: "cara", toId: ME, fromName: "Cara", pence: 100, youReceive: true }),
      ],
      rentIOwe: [],
      rentOwedToMe: [
        { payerId: "alice", payerName: "Alice", outstandingPence: 100_000, pendingPence: 0 },
        { payerId: "bob", payerName: "Bob", outstandingPence: 0, pendingPence: 60_000 },
      ],
    });
    expect(totals.owed.lines.map((l) => [l.name, l.totalPence])).toEqual([
      ["Alice", 100_000],
      ["Bob", 700],
      ["Cara", 100],
    ]);
    expect(totals.owed.totalPence).toBe(100_800);
  });

  it("reports rent waiting for confirmation apart from the totals", () => {
    const totals = buildTotals({
      payments: [],
      rentIOwe: [
        { collectorId: "sam", collectorName: "Sam", outstandingPence: 0, pendingPence: 60_000 },
      ],
      rentOwedToMe: [
        { payerId: "bob", payerName: "Bob", outstandingPence: 0, pendingPence: 60_000 },
      ],
    });
    expect(totals.owe).toEqual({ totalPence: 0, pendingRentPence: 60_000, lines: [] });
    expect(totals.owed).toEqual({ totalPence: 0, pendingRentPence: 60_000, lines: [] });
  });

  it("ignores suggested payments between other people", () => {
    const totals = buildTotals({
      payments: [payment({ fromId: "a", toId: "b", pence: 900 })],
      rentIOwe: [],
      rentOwedToMe: [],
    });
    expect(totals.owe.totalPence + totals.owed.totalPence).toBe(0);
  });
});
