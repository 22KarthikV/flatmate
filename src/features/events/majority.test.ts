import { describe, expect, it } from "vitest";

import {
  decide,
  hasMajority,
  needsLine,
  tallyOptions,
  yesNeeded,
  yesStillNeeded,
  type OptionTally,
} from "./majority";
import { PARITY_VECTORS } from "./parity-vectors";

function tallies(yes: number[]): OptionTally[] {
  return yes.map((count, index) => ({ optionId: `o${index}`, yes: count, maybe: 0, no: 0 }));
}

describe("the majority rule", () => {
  it.each(PARITY_VECTORS)("$name", (vector) => {
    for (const [deadlinePassed, expected] of [
      [false, vector.early],
      [true, vector.atDeadline],
    ] as const) {
      const decision = decide(tallies(vector.yes), vector.members, deadlinePassed);
      expect(decision.kind).toBe(expected.outcome);
      if (decision.kind === "confirm") {
        expect([decision.optionId]).toEqual(expected.dates.map((i) => `o${i}`));
      }
      if (decision.kind === "tiebreak") {
        expect(decision.optionIds).toEqual(expected.dates.map((i) => `o${i}`));
      }
    }
  });

  it("needs more than half: 3 of 5, 3 of 4, 2 of 3, 2 of 2, 1 of 1", () => {
    expect([1, 2, 3, 4, 5, 6].map(yesNeeded)).toEqual([1, 2, 2, 3, 3, 4]);
  });

  it("matches yes * 2 > n for every flat size and yes count", () => {
    for (let n = 1; n <= 12; n += 1) {
      for (let yes = 0; yes <= n; yes += 1) {
        expect(hasMajority(yes, n)).toBe(yes * 2 > n);
        expect(hasMajority(yes, n)).toBe(yes >= yesNeeded(n));
        expect(yesStillNeeded(yes, n)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("lets only one date cross on a single extra yes", () => {
    for (let n = 1; n <= 12; n += 1) {
      for (let a = 0; a <= n; a += 1) {
        for (let b = 0; b <= n; b += 1) {
          if (hasMajority(a, n) || hasMajority(b, n)) continue;
          const crossed = [a + 1, b].filter((yes) => hasMajority(yes, n)).length;
          expect(crossed).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("counts only current members' votes", () => {
    const votes = [
      { optionId: "o0", profileId: "a", answer: "yes" as const },
      { optionId: "o0", profileId: "gone", answer: "yes" as const },
      { optionId: "o0", profileId: "b", answer: "maybe" as const },
      { optionId: "o1", profileId: "a", answer: "no" as const },
    ];
    expect(tallyOptions(["o0", "o1"], votes, new Set(["a", "b"]))).toEqual([
      { optionId: "o0", yes: 1, maybe: 1, no: 0 },
      { optionId: "o1", yes: 0, maybe: 0, no: 1 },
    ]);
  });

  it("never confirms on maybe or no", () => {
    const decision = decide([{ optionId: "o0", yes: 0, maybe: 5, no: 5 }], 5, false);
    expect(decision.kind).toBe("wait");
  });

  it("says what a date still needs", () => {
    expect(needsLine(2, 5)).toBe("One more yes confirms this date.");
    expect(needsLine(0, 5)).toBe("3 more yes votes confirm this date.");
    expect(needsLine(3, 5)).toBe("This date has the majority.");
  });
});
