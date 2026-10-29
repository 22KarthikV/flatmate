import { getMembership } from "@/features/household/membership";

import { LiveInbox } from "./live-inbox";

/** Starts live inbox updates for people who are in a flat (the bell's audience). Nothing otherwise. */
export async function LiveInboxGate() {
  const membership = await getMembership();
  return membership ? <LiveInbox /> : null;
}
