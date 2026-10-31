// Decides which buttons to show. The database enforces the same rules; this only hides the rest.

export interface Viewer {
  profileId: string;
  isAdmin: boolean;
}

interface Ownership {
  reportedBy: string;
  chaserId: string | null;
}

/** The reporter, the person chasing, or an admin. */
export function canChangeStatus(report: Ownership, viewer: Viewer): boolean {
  return (
    viewer.isAdmin || report.reportedBy === viewer.profileId || report.chaserId === viewer.profileId
  );
}

/** "I'll chase this": anyone, but only while nobody is. */
export function canTakeChase(report: { chaserId: string | null }): boolean {
  return report.chaserId === null;
}

/** The current chaser hands over; an admin can assign anyone. */
export function canHandOver(report: { chaserId: string | null }, viewer: Viewer): boolean {
  return viewer.isAdmin || (report.chaserId !== null && report.chaserId === viewer.profileId);
}

export function canHide(viewer: Viewer): boolean {
  return viewer.isAdmin;
}
