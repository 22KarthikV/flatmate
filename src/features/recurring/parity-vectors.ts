/**
 * Bill-split cases shared by three checks: the TypeScript `splitExpense` (Vitest, here), the SQL
 * function the monthly job uses (pgTAP) and, by the property tests, the rule that shares always sum
 * to the total. Every person is listed, sorted by profile id, with 0 for anyone who rounds away.
 * The SQL test file copies these numbers; change both together.
 */

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const D = "00000000-0000-0000-0000-00000000000d";
const E = "00000000-0000-0000-0000-00000000000e";

export interface ParityVector {
  name: string;
  mode: "equal" | "percent";
  amountPence: number;
  /** basisPoints (hundredths of a percent) is set for percent splits only. */
  people: { profileId: string; basisPoints?: number }[];
  expected: { profileId: string; pence: number }[];
}

export const PARITY_VECTORS: readonly ParityVector[] = [
  {
    name: "equal, divides evenly",
    mode: "equal",
    amountPence: 900,
    people: [{ profileId: A }, { profileId: B }, { profileId: C }],
    expected: [
      { profileId: A, pence: 300 },
      { profileId: B, pence: 300 },
      { profileId: C, pence: 300 },
    ],
  },
  {
    name: "equal, one penny over goes to the lowest id",
    mode: "equal",
    amountPence: 1000,
    people: [{ profileId: A }, { profileId: B }, { profileId: C }],
    expected: [
      { profileId: A, pence: 334 },
      { profileId: B, pence: 333 },
      { profileId: C, pence: 333 },
    ],
  },
  {
    name: "equal, two pence over go to the two lowest ids",
    mode: "equal",
    amountPence: 1001,
    people: [{ profileId: A }, { profileId: B }, { profileId: C }],
    expected: [
      { profileId: A, pence: 334 },
      { profileId: B, pence: 334 },
      { profileId: C, pence: 333 },
    ],
  },
  {
    name: "equal, input order does not matter",
    mode: "equal",
    amountPence: 1000,
    people: [{ profileId: C }, { profileId: B }, { profileId: A }],
    expected: [
      { profileId: A, pence: 334 },
      { profileId: B, pence: 333 },
      { profileId: C, pence: 333 },
    ],
  },
  {
    name: "equal, 1p between three leaves two with nothing",
    mode: "equal",
    amountPence: 1,
    people: [{ profileId: A }, { profileId: B }, { profileId: C }],
    expected: [
      { profileId: A, pence: 1 },
      { profileId: B, pence: 0 },
      { profileId: C, pence: 0 },
    ],
  },
  {
    name: "equal, five people",
    mode: "equal",
    amountPence: 10_000,
    people: [
      { profileId: A },
      { profileId: B },
      { profileId: C },
      { profileId: D },
      { profileId: E },
    ],
    expected: [
      { profileId: A, pence: 2000 },
      { profileId: B, pence: 2000 },
      { profileId: C, pence: 2000 },
      { profileId: D, pence: 2000 },
      { profileId: E, pence: 2000 },
    ],
  },
  {
    name: "equal, the largest amount",
    mode: "equal",
    amountPence: 1_000_000,
    people: [{ profileId: A }, { profileId: B }, { profileId: C }],
    expected: [
      { profileId: A, pence: 333_334 },
      { profileId: B, pence: 333_333 },
      { profileId: C, pence: 333_333 },
    ],
  },
  {
    name: "equal, one person pays it all",
    mode: "equal",
    amountPence: 3200,
    people: [{ profileId: B }],
    expected: [{ profileId: B, pence: 3200 }],
  },
  {
    name: "percent, half each",
    mode: "percent",
    amountPence: 1000,
    people: [
      { profileId: A, basisPoints: 5000 },
      { profileId: B, basisPoints: 5000 },
    ],
    expected: [
      { profileId: A, pence: 500 },
      { profileId: B, pence: 500 },
    ],
  },
  {
    name: "percent, seventy thirty",
    mode: "percent",
    amountPence: 700,
    people: [
      { profileId: A, basisPoints: 7000 },
      { profileId: B, basisPoints: 3000 },
    ],
    expected: [
      { profileId: A, pence: 490 },
      { profileId: B, pence: 210 },
    ],
  },
  {
    name: "percent, thirds: the penny goes to the biggest remainder",
    mode: "percent",
    amountPence: 1000,
    people: [
      { profileId: A, basisPoints: 3333 },
      { profileId: B, basisPoints: 3333 },
      { profileId: C, basisPoints: 3334 },
    ],
    expected: [
      { profileId: A, pence: 333 },
      { profileId: B, pence: 333 },
      { profileId: C, pence: 334 },
    ],
  },
  {
    name: "percent, two leftover pence go to the two biggest remainders",
    mode: "percent",
    amountPence: 999,
    people: [
      { profileId: A, basisPoints: 3333 },
      { profileId: B, basisPoints: 3333 },
      { profileId: C, basisPoints: 3334 },
    ],
    expected: [
      { profileId: A, pence: 333 },
      { profileId: B, pence: 333 },
      { profileId: C, pence: 333 },
    ],
  },
  {
    name: "percent, a tie on the remainder goes to the lowest id",
    mode: "percent",
    amountPence: 1,
    people: [
      { profileId: B, basisPoints: 5000 },
      { profileId: A, basisPoints: 5000 },
    ],
    expected: [
      { profileId: A, pence: 1 },
      { profileId: B, pence: 0 },
    ],
  },
  {
    name: "percent, one person at 100 percent",
    mode: "percent",
    amountPence: 4321,
    people: [
      { profileId: C, basisPoints: 10_000 },
      { profileId: A, basisPoints: 0 },
    ],
    expected: [
      { profileId: A, pence: 0 },
      { profileId: C, pence: 4321 },
    ],
  },
];
