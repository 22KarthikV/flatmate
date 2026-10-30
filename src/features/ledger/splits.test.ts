import { describe, expect, it } from "vitest";

import { randomSource } from "./random-for-tests";
import { splitExpense, type SplitInput, type SplitResult } from "./splits";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const D = "00000000-0000-0000-0000-00000000000d";
const E = "00000000-0000-0000-0000-00000000000e";

function shares(result: SplitResult) {
  if (!result.ok) throw new Error(`expected shares, got: ${result.message}`);
  return result.shares;
}

const total = (result: SplitResult) => shares(result).reduce((sum, s) => sum + s.pence, 0);

describe("equal split", () => {
  it("divides evenly when it can", () => {
    expect(
      shares(splitExpense({ mode: "equal", amountPence: 900, profileIds: [A, B, C] })),
    ).toEqual([
      { profileId: A, pence: 300 },
      { profileId: B, pence: 300 },
      { profileId: C, pence: 300 },
    ]);
  });

  it("gives the leftover pence to the lowest profile ids, one each", () => {
    // £10.00 between three: 333, 333, 333 and 1p left over.
    expect(
      shares(splitExpense({ mode: "equal", amountPence: 1000, profileIds: [A, B, C] })),
    ).toEqual([
      { profileId: A, pence: 334 },
      { profileId: B, pence: 333 },
      { profileId: C, pence: 333 },
    ]);
    // £10.01 between three: 2p left over.
    expect(
      shares(splitExpense({ mode: "equal", amountPence: 1001, profileIds: [C, A, B] })),
    ).toEqual([
      { profileId: A, pence: 334 },
      { profileId: B, pence: 334 },
      { profileId: C, pence: 333 },
    ]);
  });

  it("drops people whose share is nothing", () => {
    // 1p between three people: only the lowest id gets it.
    expect(shares(splitExpense({ mode: "equal", amountPence: 1, profileIds: [C, B, A] }))).toEqual([
      { profileId: A, pence: 1 },
    ]);
  });

  it("is the same whatever order the people are given in", () => {
    const one = splitExpense({ mode: "equal", amountPence: 8_401, profileIds: [A, B, C, D, E] });
    const two = splitExpense({ mode: "equal", amountPence: 8_401, profileIds: [E, C, A, D, B] });
    expect(one).toEqual(two);
  });

  it("works for one person", () => {
    expect(shares(splitExpense({ mode: "equal", amountPence: 777, profileIds: [A] }))).toEqual([
      { profileId: A, pence: 777 },
    ]);
  });
});

describe("one-person split", () => {
  it("puts the whole amount on one person", () => {
    expect(shares(splitExpense({ mode: "one", amountPence: 1234, profileId: B }))).toEqual([
      { profileId: B, pence: 1234 },
    ]);
  });

  it("needs a person", () => {
    expect(splitExpense({ mode: "one", amountPence: 1234, profileId: "" })).toEqual({
      ok: false,
      message: "Choose who this is for.",
    });
  });
});

describe("exact split", () => {
  it("accepts amounts that add up and sorts them by profile id", () => {
    expect(
      shares(
        splitExpense({
          mode: "exact",
          amountPence: 1000,
          shares: [
            { profileId: C, pence: 250 },
            { profileId: A, pence: 600 },
            { profileId: B, pence: 150 },
          ],
        }),
      ),
    ).toEqual([
      { profileId: A, pence: 600 },
      { profileId: B, pence: 150 },
      { profileId: C, pence: 250 },
    ]);
  });

  it("drops people with 0p", () => {
    expect(
      shares(
        splitExpense({
          mode: "exact",
          amountPence: 500,
          shares: [
            { profileId: A, pence: 500 },
            { profileId: B, pence: 0 },
          ],
        }),
      ),
    ).toEqual([{ profileId: A, pence: 500 }]);
  });

  it("says by how much the amounts are out", () => {
    expect(
      splitExpense({
        mode: "exact",
        amountPence: 840,
        shares: [
          { profileId: A, pence: 400 },
          { profileId: B, pence: 300 },
        ],
      }),
    ).toEqual({
      ok: false,
      message: "The amounts add up to £7.00, but the expense is £8.40. £1.40 is left to share out.",
    });
    expect(
      splitExpense({
        mode: "exact",
        amountPence: 840,
        shares: [
          { profileId: A, pence: 800 },
          { profileId: B, pence: 100 },
        ],
      }),
    ).toEqual({
      ok: false,
      message: "The amounts add up to £9.00, but the expense is £8.40. They are £0.60 too much.",
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects a share of %s", (pence) => {
    const result = splitExpense({
      mode: "exact",
      amountPence: 100,
      shares: [
        { profileId: A, pence },
        { profileId: B, pence: 100 },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe("percent split", () => {
  it("splits by hundredths of a percent", () => {
    expect(
      shares(
        splitExpense({
          mode: "percent",
          amountPence: 1000,
          shares: [
            { profileId: A, basisPoints: 5000 },
            { profileId: B, basisPoints: 2500 },
            { profileId: C, basisPoints: 2500 },
          ],
        }),
      ),
    ).toEqual([
      { profileId: A, pence: 500 },
      { profileId: B, pence: 250 },
      { profileId: C, pence: 250 },
    ]);
  });

  it("gives leftover pence to the largest remainder first, then the lowest id", () => {
    // £1.00 split 33.33 / 33.33 / 33.34: floors are 33, 33, 33 with remainders
    // 3333, 3333, 3334 (out of 10000), so the 1p left over goes to C.
    expect(
      shares(
        splitExpense({
          mode: "percent",
          amountPence: 100,
          shares: [
            { profileId: A, basisPoints: 3333 },
            { profileId: B, basisPoints: 3333 },
            { profileId: C, basisPoints: 3334 },
          ],
        }),
      ),
    ).toEqual([
      { profileId: A, pence: 33 },
      { profileId: B, pence: 33 },
      { profileId: C, pence: 34 },
    ]);
    // Three equal thirds of 100p: equal remainders, so the lowest id wins the tie.
    expect(
      shares(
        splitExpense({
          mode: "percent",
          amountPence: 100,
          shares: [
            { profileId: C, basisPoints: 3333 },
            { profileId: B, basisPoints: 3333 },
            { profileId: A, basisPoints: 3334 },
          ],
        }),
      ),
    ).toEqual([
      { profileId: A, pence: 34 },
      { profileId: B, pence: 33 },
      { profileId: C, pence: 33 },
    ]);
  });

  it("must total exactly 100%", () => {
    expect(
      splitExpense({
        mode: "percent",
        amountPence: 100,
        shares: [
          { profileId: A, basisPoints: 5000 },
          { profileId: B, basisPoints: 4999 },
        ],
      }),
    ).toEqual({
      ok: false,
      message: "The percentages must add up to 100%. They add up to 99.99%.",
    });
    expect(
      splitExpense({
        mode: "percent",
        amountPence: 100,
        shares: [
          { profileId: A, basisPoints: 6000 },
          { profileId: B, basisPoints: 5000 },
        ],
      }),
    ).toEqual({ ok: false, message: "The percentages must add up to 100%. They add up to 110%." });
  });

  it.each([-1, 10_001, 12.5, Number.NaN])(
    "rejects a percentage of %s hundredths",
    (basisPoints) => {
      expect(
        splitExpense({
          mode: "percent",
          amountPence: 100,
          shares: [
            { profileId: A, basisPoints },
            { profileId: B, basisPoints: 5000 },
          ],
        }).ok,
      ).toBe(false);
    },
  );
});

describe("validation shared by every mode", () => {
  it.each([0, -5, 1.5, 1_000_001, Number.NaN])("rejects an expense of %s pence", (amountPence) => {
    expect(splitExpense({ mode: "equal", amountPence, profileIds: [A] }).ok).toBe(false);
  });

  it("needs at least one person", () => {
    expect(splitExpense({ mode: "equal", amountPence: 100, profileIds: [] })).toEqual({
      ok: false,
      message: "Choose at least one person.",
    });
    expect(splitExpense({ mode: "exact", amountPence: 100, shares: [] })).toEqual({
      ok: false,
      message: "Choose at least one person.",
    });
  });

  it("does not allow the same person twice", () => {
    expect(splitExpense({ mode: "equal", amountPence: 100, profileIds: [A, A] })).toEqual({
      ok: false,
      message: "Each person can only appear once.",
    });
  });

  it("does not allow an empty person id", () => {
    expect(splitExpense({ mode: "equal", amountPence: 100, profileIds: [A, ""] }).ok).toBe(false);
  });
});

describe("properties over random inputs", () => {
  const random = randomSource(20_261_030);
  const people = [A, B, C, D, E];

  function pick(count: number): string[] {
    const chosen = [...people].sort(() => random() - 0.5).slice(0, count);
    return chosen;
  }

  it("equal: shares always sum to the amount and differ by at most 1p", () => {
    for (let i = 0; i < 500; i++) {
      const amountPence = 1 + Math.floor(random() * 1_000_000);
      const profileIds = pick(1 + Math.floor(random() * 5));
      const result = splitExpense({ mode: "equal", amountPence, profileIds });
      expect(total(result)).toBe(amountPence);
      const pence = shares(result).map((s) => s.pence);
      const everyone = profileIds.length;
      // With the zero shares dropped, every share is the floor or the floor plus one.
      const floor = Math.floor(amountPence / everyone);
      for (const p of pence) expect([floor, floor + 1]).toContain(p);
      expect(Math.max(...pence) - Math.min(...pence)).toBeLessThanOrEqual(1);
    }
  });

  it("percent: shares always sum to the amount, and each is within 1p of its exact share", () => {
    for (let i = 0; i < 500; i++) {
      const amountPence = 1 + Math.floor(random() * 1_000_000);
      const count = 1 + Math.floor(random() * 5);
      const profileIds = pick(count);
      // Random hundredths of a percent that total 10000.
      const cuts = Array.from({ length: count - 1 }, () => Math.floor(random() * 10_001)).sort(
        (x, y) => x - y,
      );
      const bounds = [0, ...cuts, 10_000];
      const basisPoints = bounds.slice(1).map((b, index) => b - bounds[index]);
      const input: SplitInput = {
        mode: "percent",
        amountPence,
        shares: profileIds.map((profileId, index) => ({
          profileId,
          basisPoints: basisPoints[index],
        })),
      };
      const result = splitExpense(input);
      expect(total(result)).toBe(amountPence);
      for (const share of shares(result)) {
        const bp = input.shares.find((s) => s.profileId === share.profileId)!.basisPoints;
        const exact = (amountPence * bp) / 10_000;
        expect(Math.abs(share.pence - exact)).toBeLessThan(1);
      }
    }
  });

  it("the result never depends on the order people are listed in", () => {
    for (let i = 0; i < 200; i++) {
      const amountPence = 1 + Math.floor(random() * 100_000);
      const profileIds = pick(2 + Math.floor(random() * 4));
      const forward = splitExpense({ mode: "equal", amountPence, profileIds });
      const backward = splitExpense({
        mode: "equal",
        amountPence,
        profileIds: [...profileIds].reverse(),
      });
      expect(forward).toEqual(backward);
    }
  });
});
