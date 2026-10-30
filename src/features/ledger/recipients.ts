import "server-only";

import { getMembers } from "@/features/household/members";

import { getBalancesView } from "./balances";
import type { Person } from "./expense-form";

export interface SettlementRecipients {
  /** The other people in the flat. */
  current: Person[];
  /** People who have left but are still owed money, so a payment to them can be recorded. */
  former: Person[];
}

/** Who the signed-in person can record a payment to. */
export async function getSettlementRecipients(
  householdId: string,
  viewerId: string,
): Promise<SettlementRecipients> {
  const [members, view] = await Promise.all([getMembers(), getBalancesView(householdId, viewerId)]);
  return {
    current: members
      .filter((member) => member.profileId !== viewerId)
      .map(({ profileId, displayName }) => ({ profileId, displayName })),
    former: (view?.former ?? [])
      .filter((person) => person.status === "owed")
      .map(({ profileId, displayName }) => ({ profileId, displayName })),
  };
}
