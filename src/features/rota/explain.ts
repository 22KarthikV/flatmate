// Turns the structured reasons behind an assignment into one plain sentence (SPEC-rota T3, FR-RT-3).
// Pure: no clock, no random, no database.

import { weekdayName } from "./week";

export type Reason =
  | { kind: "solo" }
  | { kind: "owed"; chore: string }
  | { kind: "only_available"; chore: string }
  | { kind: "lowest_load" }
  | { kind: "longest_since"; chore: string; never: boolean }
  | { kind: "turn" }
  | { kind: "moved_day"; from: string; to: string }
  | { kind: "rebalanced"; leaver: string }
  | { kind: "unassigned"; chore: string };

function sentenceFor(reason: Reason): string {
  switch (reason.kind) {
    case "solo":
      return "You are the only flatmate, so every chore is yours.";
    case "owed":
      return `You were passed over for ${reason.chore} last time, so it is your turn.`;
    case "only_available":
      return `You are the only one around for ${reason.chore}.`;
    case "lowest_load":
      return "You have done the least effort lately.";
    case "longest_since":
      return reason.never
        ? `You have not done ${reason.chore} yet.`
        : `You did ${reason.chore} longest ago.`;
    case "turn":
      return "It was your turn in the rotation.";
    case "moved_day":
      return `Moved to ${weekdayName(reason.to)} because you are away on ${weekdayName(reason.from)}.`;
    case "rebalanced":
      return `Moved to you because ${reason.leaver} left.`;
    case "unassigned":
      return `Nobody is around for ${reason.chore} this week.`;
  }
}

/** One sentence for an assignment: why it is yours, then any move of day. Never empty. */
export function explainAssignment(reasons: readonly Reason[]): string {
  const sentences = reasons.map(sentenceFor).filter((text) => text.length > 0);
  return sentences.length > 0 ? sentences.join(" ") : "It was your turn in the rotation.";
}
