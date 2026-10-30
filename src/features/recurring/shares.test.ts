import { describe, expect, it } from "vitest";

import { randomSource } from "../ledger/random-for-tests";
import { PARITY_VECTORS } from "./parity-vectors";
import { equalShares, splitBill } from "./shares";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";

describe("splitBill against the shared vectors", () => {
  it.each(PARITY_VECTORS.map((vector) => [vector.name, vector] as const))("%s", (_name, vector) => {
    const result =
      vector.mode === "equal"
        ? splitBill({
            mode: "equal",
            amountPence: vector.amountPence,
            profileIds: vector.people.map((p) => p.profileId),
          })
        : splitBill({
            mode: "percent",
            amountPence: vector.amountPence,
            shares: vector.people.map((p) => ({
              profileId: p.profileId,
              basisPoints: p.basisPoints ?? 0,
            })),
          });
    expect(result).toEqual({ ok: true, shares: vector.expected });
  });

  it("every vector sums to its amount", () => {
    for (const vector of PARITY_VECTORS) {
      const sum = vector.expected.reduce((total, share) => total + share.pence, 0);
      expect(sum, vector.name).toBe(vector.amountPence);
    }
  });
});

describe("equalShares", () => {
  it("is spread over exactly the people given", () => {
    const result = equalShares([A, B, C], 1000);
    expect(result).toEqual({
      ok: true,
      shares: [
        { profileId: A, pence: 334 },
        { profileId: B, pence: 333 },
        { profileId: C, pence: 333 },
      ],
    });
  });

  it("refuses nobody and a bad amount", () => {
    expect(equalShares([], 1000).ok).toBe(false);
    expect(equalShares([A], 0).ok).toBe(false);
    expect(equalShares([A], 1_000_001).ok).toBe(false);
  });

  it("always sums to the total (property)", () => {
    const random = randomSource(20261101);
    for (let run = 0; run < 500; run += 1) {
      const count = 1 + Math.floor(random() * 8);
      const ids = Array.from(
        { length: count },
        (_, i) => `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`,
      );
      const total = 1 + Math.floor(random() * 1_000_000);
      const result = equalShares(ids, total);
      if (!result.ok) throw new Error(result.message);
      expect(result.shares).toHaveLength(count);
      expect(result.shares.reduce((sum, s) => sum + s.pence, 0)).toBe(total);
      const pence = result.shares.map((s) => s.pence);
      expect(Math.max(...pence) - Math.min(...pence)).toBeLessThanOrEqual(1);
    }
  });
});

describe("percent bills (property)", () => {
  it("always sum to the total", () => {
    const random = randomSource(7);
    for (let run = 0; run < 500; run += 1) {
      const count = 1 + Math.floor(random() * 5);
      const cuts = Array.from({ length: count - 1 }, () => Math.floor(random() * 10_001)).sort(
        (a, b) => a - b,
      );
      const points = [...cuts, 10_000].map(
        (cut, i) => cut - (i === 0 ? 0 : [...cuts, 10_000][i - 1]),
      );
      const shares = points.map((basisPoints, i) => ({
        profileId: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`,
        basisPoints,
      }));
      const total = 1 + Math.floor(random() * 1_000_000);
      const result = splitBill({ mode: "percent", amountPence: total, shares });
      if (!result.ok) throw new Error(result.message);
      expect(result.shares.reduce((sum, s) => sum + s.pence, 0)).toBe(total);
    }
  });
});
