/**
 * Majority cases shared by two checks: the TypeScript rule in majority.ts (Vitest, here) and the SQL
 * function private.events_evaluate (pgTAP). Each case lists the yes count per date for a flat of
 * `members` people and says what should happen, before the deadline and at it. The SQL test file
 * copies these numbers; change both together.
 */

export type Outcome = "wait" | "confirm" | "tiebreak" | "cancel";

export interface ParityVector {
  name: string;
  members: number;
  /** Yes votes per date, in date order. */
  yes: number[];
  early: { outcome: Outcome; dates: number[] };
  atDeadline: { outcome: Outcome; dates: number[] };
}

export const PARITY_VECTORS: readonly ParityVector[] = [
  {
    name: "1 of 1 is a majority",
    members: 1,
    yes: [1, 0],
    early: { outcome: "confirm", dates: [0] },
    atDeadline: { outcome: "confirm", dates: [0] },
  },
  {
    name: "1 of 2 is not a majority",
    members: 2,
    yes: [1, 0],
    early: { outcome: "wait", dates: [] },
    atDeadline: { outcome: "confirm", dates: [0] },
  },
  {
    name: "2 of 2 is a majority",
    members: 2,
    yes: [0, 2],
    early: { outcome: "confirm", dates: [1] },
    atDeadline: { outcome: "confirm", dates: [1] },
  },
  {
    name: "2 of 3 is a majority",
    members: 3,
    yes: [2, 1],
    early: { outcome: "confirm", dates: [0] },
    atDeadline: { outcome: "confirm", dates: [0] },
  },
  {
    name: "2 of 4 is not a majority",
    members: 4,
    yes: [2, 1],
    early: { outcome: "wait", dates: [] },
    atDeadline: { outcome: "confirm", dates: [0] },
  },
  {
    name: "3 of 4 is a majority",
    members: 4,
    yes: [1, 3],
    early: { outcome: "confirm", dates: [1] },
    atDeadline: { outcome: "confirm", dates: [1] },
  },
  {
    name: "3 of 5 is a majority",
    members: 5,
    yes: [3, 2],
    early: { outcome: "confirm", dates: [0] },
    atDeadline: { outcome: "confirm", dates: [0] },
  },
  {
    name: "2 of 5 is not, and the deadline picks the most yes",
    members: 5,
    yes: [1, 2, 0],
    early: { outcome: "wait", dates: [] },
    atDeadline: { outcome: "confirm", dates: [1] },
  },
  {
    name: "a tie at the deadline goes to the organiser",
    members: 6,
    yes: [2, 2, 1],
    early: { outcome: "wait", dates: [] },
    atDeadline: { outcome: "tiebreak", dates: [0, 1] },
  },
  {
    name: "nobody said yes cancels at the deadline",
    members: 3,
    yes: [0, 0],
    early: { outcome: "wait", dates: [] },
    atDeadline: { outcome: "cancel", dates: [] },
  },
  {
    name: "two dates crossing at once with more yes on one",
    members: 3,
    yes: [2, 3],
    early: { outcome: "confirm", dates: [1] },
    atDeadline: { outcome: "confirm", dates: [1] },
  },
  {
    name: "two dates crossing at once and level goes to the organiser",
    members: 3,
    yes: [2, 2],
    early: { outcome: "tiebreak", dates: [0, 1] },
    atDeadline: { outcome: "tiebreak", dates: [0, 1] },
  },
];
