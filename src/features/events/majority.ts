// The majority rule, for display and for the tests that keep it honest. The database enforces it
// (private.events_evaluate); both are tested against the same vectors in parity-vectors.ts.
// Kept free of server-only imports so client components can use it.

export type Answer = "yes" | "maybe" | "no";

export interface OptionTally {
  optionId: string;
  yes: number;
  maybe: number;
  no: number;
}

export interface VoteRow {
  optionId: string;
  profileId: string;
  answer: Answer;
}

/** More than half of the current members: `yes * 2 > n`, in whole numbers so nothing is rounded. */
export function hasMajority(yes: number, members: number): boolean {
  return members > 0 && yes * 2 > members;
}

/** The yes votes a date needs to be confirmed early: 3 of 5, 3 of 4, 2 of 3, 2 of 2, 1 of 1. */
export function yesNeeded(members: number): number {
  return Math.floor(members / 2) + 1;
}

/** How many more yes votes confirm the date. Never negative. */
export function yesStillNeeded(yes: number, members: number): number {
  return Math.max(0, yesNeeded(members) - yes);
}

/** Counts per date, using only the current members' votes. A leaver's vote counts for nothing. */
export function tallyOptions(
  optionIds: readonly string[],
  votes: readonly VoteRow[],
  memberIds: ReadonlySet<string>,
): OptionTally[] {
  return optionIds.map((optionId) => {
    const tally: OptionTally = { optionId, yes: 0, maybe: 0, no: 0 };
    for (const vote of votes) {
      if (vote.optionId === optionId && memberIds.has(vote.profileId)) tally[vote.answer] += 1;
    }
    return tally;
  });
}

export type Decision =
  | { kind: "wait" }
  | { kind: "confirm"; optionId: string; by: "majority" | "deadline" }
  | { kind: "tiebreak"; optionIds: string[] }
  | { kind: "cancel" };

/** The dates with the most yes votes, as long as that is at least one. */
export function leadingOptions(tallies: readonly OptionTally[]): string[] {
  const top = Math.max(0, ...tallies.map((tally) => tally.yes));
  if (top === 0) return [];
  return tallies.filter((tally) => tally.yes === top).map((tally) => tally.optionId);
}

/**
 * What should happen to an event that is still being voted on.
 * Early: a date with a majority is confirmed (the one with more yes if two cross at once, else the
 * organiser breaks the tie). At the deadline: the most yes wins, a tie goes to the organiser, and no
 * yes at all cancels. Before the deadline with no majority, nothing happens.
 */
export function decide(
  tallies: readonly OptionTally[],
  members: number,
  deadlinePassed: boolean,
): Decision {
  if (members <= 0) return { kind: "wait" };
  const leaders = leadingOptions(tallies);
  const first = leaders[0];
  const top = first === undefined ? 0 : (tallies.find((t) => t.optionId === first)?.yes ?? 0);
  if (first !== undefined && hasMajority(top, members)) {
    return leaders.length === 1
      ? { kind: "confirm", optionId: first, by: "majority" }
      : { kind: "tiebreak", optionIds: leaders };
  }
  if (!deadlinePassed) return { kind: "wait" };
  if (first === undefined) return { kind: "cancel" };
  return leaders.length === 1
    ? { kind: "confirm", optionId: first, by: "deadline" }
    : { kind: "tiebreak", optionIds: leaders };
}

/** A plain line about what a date still needs ("One more yes confirms this date"). */
export function needsLine(yes: number, members: number): string {
  if (hasMajority(yes, members)) return "This date has the majority.";
  const more = yesStillNeeded(yes, members);
  if (more === 1) return "One more yes confirms this date.";
  return `${more} more yes votes confirm this date.`;
}
