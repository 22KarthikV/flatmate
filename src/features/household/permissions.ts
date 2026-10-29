import type { HouseholdRole } from "./constants";

export interface MemberActions {
  canMakeAdmin: boolean;
  canMakeMember: boolean;
  canRemove: boolean;
}

const NONE: MemberActions = { canMakeAdmin: false, canMakeMember: false, canRemove: false };

/**
 * What the viewer may do to one person in the list. This only decides which buttons to show; the
 * database functions make the same decision again and are the real enforcement (SPEC-household H5).
 */
export function memberActions(
  viewer: HouseholdRole,
  target: HouseholdRole,
  isSelf: boolean,
): MemberActions {
  if (isSelf || viewer === "member" || target === "owner") return NONE;
  return {
    canMakeAdmin: target === "member",
    canMakeMember: target === "admin",
    canRemove: target === "member" || viewer === "owner",
  };
}
