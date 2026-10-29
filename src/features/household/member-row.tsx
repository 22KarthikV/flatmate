"use client";

import { useActionState, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import { removeMember, setMemberRole } from "./actions";
import type { HouseholdRole, SimpleState } from "./constants";
import type { MemberActions } from "./permissions";

const ROLE_LABEL: Record<HouseholdRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};
const initial: SimpleState = { status: "idle" };

export interface MemberRowProps {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  role: HouseholdRole;
  isSelf: boolean;
  tone: 1 | 2 | 3 | 4 | 5;
  actions: MemberActions;
}

export function MemberRow({
  profileId,
  displayName,
  avatarUrl,
  role,
  isSelf,
  tone,
  actions,
}: MemberRowProps) {
  const [roleState, roleAction, changing] = useActionState(setMemberRole, initial);
  const [removeState, removeAction, removing] = useActionState(removeMember, initial);
  const [confirming, setConfirming] = useState(false);
  const error =
    roleState.status === "error"
      ? roleState.message
      : removeState.status === "error"
        ? removeState.message
        : null;

  return (
    <li className="border-line flex flex-col gap-3 border-t py-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-4">
        <Avatar name={displayName} tone={tone} src={avatarUrl ?? undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg">
            {displayName}
            {isSelf ? <span className="text-muted"> (you)</span> : null}
          </p>
          <p className="label-caps text-muted">{ROLE_LABEL[role]}</p>
        </div>
      </div>

      {actions.canMakeAdmin || actions.canMakeMember || actions.canRemove ? (
        <div className="flex flex-wrap items-center gap-3">
          {actions.canMakeAdmin || actions.canMakeMember ? (
            <form action={roleAction}>
              <input type="hidden" name="profileId" value={profileId} />
              <input type="hidden" name="role" value={actions.canMakeAdmin ? "admin" : "member"} />
              <Button type="submit" variant="secondary" disabled={changing}>
                {actions.canMakeAdmin ? "Make admin" : "Make member"}
              </Button>
            </form>
          ) : null}

          {actions.canRemove && !confirming ? (
            <Button variant="ghost" className="text-negative" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      {confirming ? (
        <form action={removeAction} className="border-negative flex flex-col gap-3 border p-4">
          <input type="hidden" name="profileId" value={profileId} />
          <p className="max-w-md text-sm">
            Remove {displayName} from the flat? They keep their past expenses in your history, and
            their upcoming chores are shared out among the rest of you.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="bg-negative" disabled={removing}>
              {removing ? "Removing" : `Remove ${displayName}`}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-negative text-sm">
          {error}
        </p>
      ) : null}
    </li>
  );
}
