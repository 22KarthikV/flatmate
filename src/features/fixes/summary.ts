import "server-only";

import { getReports } from "./fixes";

/**
 * "2 problems still open" for an admin (all of them) or for a person chasing some (theirs); null
 * when there is nothing for this person. The Home wiring is a separate change.
 */
export async function getFixSummary(viewer: {
  profileId: string;
  isAdmin: boolean;
}): Promise<{ count: number } | null> {
  const unfinished = (await getReports()).filter((r) => r.status !== "fixed");
  const mine = viewer.isAdmin
    ? unfinished
    : unfinished.filter((r) => r.chaserId === viewer.profileId);
  return mine.length === 0 ? null : { count: mine.length };
}
