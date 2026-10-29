import { Card, CardLabel } from "@/components/ui/card";

import type { HouseholdRole } from "./constants";
import { MemberRow } from "./member-row";
import type { Member } from "./members";
import { memberActions } from "./permissions";

const TONES = [1, 2, 3, 4, 5] as const;

export function MembersCard({
  members,
  viewerProfileId,
  viewerRole,
}: {
  members: Member[];
  viewerProfileId: string;
  viewerRole: HouseholdRole;
}) {
  return (
    <Card>
      <CardLabel>Members · {members.length}</CardLabel>
      <ul className="mt-4 flex flex-col">
        {members.map((member, index) => {
          const isSelf = member.profileId === viewerProfileId;
          return (
            <MemberRow
              key={member.profileId}
              {...member}
              isSelf={isSelf}
              tone={TONES[index % TONES.length]}
              actions={memberActions(viewerRole, member.role, isSelf)}
            />
          );
        })}
      </ul>
    </Card>
  );
}
