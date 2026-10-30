import type { HouseholdRole } from "@/features/household/constants";

/**
 * Whether the viewer is offered "Correct" and "Cancel" on an expense: the person who added it, or an
 * owner or admin, and only while it still counts. This decides which buttons to show; the database
 * functions make the same decision again and are the real enforcement.
 */
export function canChangeExpense(
  expense: { createdBy: string; voided: boolean },
  viewer: { profileId: string; role: HouseholdRole },
): boolean {
  if (expense.voided) return false;
  return (
    expense.createdBy === viewer.profileId || viewer.role === "owner" || viewer.role === "admin"
  );
}
