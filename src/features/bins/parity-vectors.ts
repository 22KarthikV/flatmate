/**
 * Bin-day cases shared by two checks: the TypeScript `collectionsBetween` (Vitest) and the SQL
 * `private.bin_collections_on` the reminder uses (pgTAP). Each case is one bin with its pattern and
 * exceptions, and says whether it is collected on one date. The SQL test copies these cases;
 * change both together.
 */

export interface ParityException {
  originalOn: string;
  kind: "skip" | "move";
  movedTo?: string;
}

export interface ParityVector {
  name: string;
  /** A real collection date (yyyy-mm-dd). */
  anchor: string;
  everyWeeks: 1 | 2 | 3 | 4;
  exceptions: ParityException[];
  date: string;
  collected: boolean;
}

const weekly = { anchor: "2026-11-03", everyWeeks: 1 as const, exceptions: [] };
const fortnightly = { anchor: "2026-11-03", everyWeeks: 2 as const, exceptions: [] };
const threeWeekly = { anchor: "2026-11-03", everyWeeks: 3 as const, exceptions: [] };

export const PARITY_VECTORS: readonly ParityVector[] = [
  { name: "weekly, the anchor itself", ...weekly, date: "2026-11-03", collected: true },
  { name: "weekly, a later week", ...weekly, date: "2026-11-10", collected: true },
  { name: "weekly, the next day", ...weekly, date: "2026-11-11", collected: false },
  { name: "weekly, before the anchor", ...weekly, date: "2026-10-27", collected: true },
  { name: "fortnightly, the off week", ...fortnightly, date: "2026-11-10", collected: false },
  { name: "fortnightly, the on week", ...fortnightly, date: "2026-11-17", collected: true },
  { name: "fortnightly, two weeks before", ...fortnightly, date: "2026-10-20", collected: true },
  { name: "fortnightly, one week before", ...fortnightly, date: "2026-10-27", collected: false },
  { name: "3-weekly, three weeks on", ...threeWeekly, date: "2026-11-24", collected: true },
  { name: "3-weekly, two weeks on", ...threeWeekly, date: "2026-11-17", collected: false },
  { name: "3-weekly, three weeks before", ...threeWeekly, date: "2026-10-13", collected: true },
  {
    name: "4-weekly, across the spring clock change (off week)",
    anchor: "2026-10-06",
    everyWeeks: 4,
    exceptions: [],
    date: "2027-03-30",
    collected: false,
  },
  {
    name: "weekly, across the spring clock change",
    anchor: "2026-10-06",
    everyWeeks: 1,
    exceptions: [],
    date: "2027-03-30",
    collected: true,
  },
  {
    name: "weekly, across the autumn clock change",
    anchor: "2026-10-20",
    everyWeeks: 1,
    exceptions: [],
    date: "2026-10-27",
    collected: true,
  },
  {
    name: "weekly, over the year end",
    anchor: "2026-12-29",
    everyWeeks: 1,
    exceptions: [],
    date: "2027-01-05",
    collected: true,
  },
  {
    name: "a skipped collection is not collected",
    ...weekly,
    exceptions: [{ originalOn: "2026-11-10", kind: "skip" }],
    date: "2026-11-10",
    collected: false,
  },
  {
    name: "the week after a skip is still collected",
    ...weekly,
    exceptions: [{ originalOn: "2026-11-10", kind: "skip" }],
    date: "2026-11-17",
    collected: true,
  },
  {
    name: "a moved collection is not on its old date",
    ...weekly,
    exceptions: [{ originalOn: "2026-11-17", kind: "move", movedTo: "2026-11-19" }],
    date: "2026-11-17",
    collected: false,
  },
  {
    name: "a moved collection is on its new date",
    ...weekly,
    exceptions: [{ originalOn: "2026-11-17", kind: "move", movedTo: "2026-11-19" }],
    date: "2026-11-19",
    collected: true,
  },
];
