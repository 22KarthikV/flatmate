import { describe, expect, it } from "vitest";

import { randomSource } from "./random-for-tests";
import { simplifyDebts, type Balance, type Payment } from "./simplify";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const D = "00000000-0000-0000-0000-00000000000d";
const E = "00000000-0000-0000-0000-00000000000e";

describe("simplifyDebts", () => {
  it("needs no payments when everyone is square", () => {
    expect(simplifyDebts([])).toEqual([]);
    expect(
      simplifyDebts([
        { profileId: A, pence: 0 },
        { profileId: B, pence: 0 },
      ]),
    ).toEqual([]);
  });

  it("one debt is one payment", () => {
    expect(
      simplifyDebts([
        { profileId: A, pence: 1200 },
        { profileId: B, pence: -1200 },
      ]),
    ).toEqual([{ from: B, to: A, pence: 1200 }]);
  });

  it("collapses a chain: B owes A and C owes B becomes C paying A", () => {
    // A is owed 10, B is square (owes A 10, owed 10 by C), C owes 10.
    expect(
      simplifyDebts([
        { profileId: A, pence: 1000 },
        { profileId: B, pence: 0 },
        { profileId: C, pence: -1000 },
      ]),
    ).toEqual([{ from: C, to: A, pence: 1000 }]);
  });

  it("matches the largest debtor with the largest creditor first", () => {
    expect(
      simplifyDebts([
        { profileId: A, pence: 700 },
        { profileId: B, pence: 300 },
        { profileId: C, pence: -600 },
        { profileId: D, pence: -400 },
      ]),
    ).toEqual([
      { from: C, to: A, pence: 600 },
      { from: D, to: B, pence: 300 },
      { from: D, to: A, pence: 100 },
    ]);
  });

  it("gives the same answer whatever order the balances arrive in", () => {
    const balances: Balance[] = [
      { profileId: A, pence: 1250 },
      { profileId: B, pence: -250 },
      { profileId: C, pence: -500 },
      { profileId: D, pence: 250 },
      { profileId: E, pence: -750 },
    ];
    const forward = simplifyDebts(balances);
    expect(simplifyDebts([...balances].reverse())).toEqual(forward);
    expect(
      simplifyDebts([balances[2], balances[0], balances[4], balances[1], balances[3]]),
    ).toEqual(forward);
  });

  it("breaks ties by profile id", () => {
    expect(
      simplifyDebts([
        { profileId: C, pence: -500 },
        { profileId: B, pence: -500 },
        { profileId: A, pence: 1000 },
      ]),
    ).toEqual([
      { from: B, to: A, pence: 500 },
      { from: C, to: A, pence: 500 },
    ]);
  });

  it("refuses balances that do not add up to zero, rather than hiding money", () => {
    expect(() =>
      simplifyDebts([
        { profileId: A, pence: 1000 },
        { profileId: B, pence: -900 },
      ]),
    ).toThrow("Balances must add up to zero");
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses a balance of %s", (pence) => {
    expect(() =>
      simplifyDebts([
        { profileId: A, pence },
        { profileId: B, pence: -1 },
      ]),
    ).toThrow("whole number of pence");
  });

  it("refuses the same person twice", () => {
    expect(() =>
      simplifyDebts([
        { profileId: A, pence: 100 },
        { profileId: A, pence: -100 },
      ]),
    ).toThrow("once");
  });
});

describe("properties over random flats", () => {
  const random = randomSource(1_030_2026);
  const ids = Array.from(
    { length: 20 },
    (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  );

  /** Random balances that really do add up to zero, as the database guarantees. */
  function randomBalances(): Balance[] {
    const count = 1 + Math.floor(random() * 12);
    const pence = Array.from({ length: count }, () => Math.floor(random() * 200_001) - 100_000);
    const sum = pence.reduce((a, b) => a + b, 0);
    pence[count - 1] -= sum;
    return pence.map((value, index) => ({ profileId: ids[index], pence: value }));
  }

  function applied(balances: Balance[], payments: Payment[]): Map<string, number> {
    const net = new Map(balances.map((b) => [b.profileId, b.pence]));
    for (const payment of payments) {
      net.set(payment.from, (net.get(payment.from) ?? 0) + payment.pence);
      net.set(payment.to, (net.get(payment.to) ?? 0) - payment.pence);
    }
    return net;
  }

  it("clears every balance exactly, with positive payments, in at most (people - 1) payments", () => {
    for (let i = 0; i < 500; i++) {
      const balances = randomBalances();
      const payments = simplifyDebts(balances);
      for (const payment of payments) {
        expect(payment.pence).toBeGreaterThan(0);
        expect(Number.isInteger(payment.pence)).toBe(true);
        expect(payment.from).not.toBe(payment.to);
      }
      for (const left of applied(balances, payments).values()) expect(left).toBe(0);
      expect(payments.length).toBeLessThanOrEqual(Math.max(0, balances.length - 1));
    }
  });

  it("only ever asks a debtor to pay a creditor", () => {
    for (let i = 0; i < 200; i++) {
      const balances = randomBalances();
      const owed = new Map(balances.map((b) => [b.profileId, b.pence]));
      for (const payment of simplifyDebts(balances)) {
        expect(owed.get(payment.from)!).toBeLessThan(0);
        expect(owed.get(payment.to)!).toBeGreaterThan(0);
      }
    }
  });
});
