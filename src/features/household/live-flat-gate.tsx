import { LiveFlat } from "./live-flat";
import { getMembership } from "./membership";

/** Starts live updates for people who are in a flat. Nothing for everyone else. */
export async function LiveFlatGate() {
  const membership = await getMembership();
  return membership ? <LiveFlat householdId={membership.householdId} /> : null;
}
