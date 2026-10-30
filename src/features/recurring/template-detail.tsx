import { Card, CardLabel } from "@/components/ui/card";
import { formatDay } from "@/features/ledger/format";
import { formatPence } from "@/features/ledger/money";

import { describeSchedule, instanceStatusLabel, monthLabel } from "./format";
import { TemplateActions } from "./template-actions";
import type { TemplateDetail } from "./templates";

const PAUSE_NOTE: Record<NonNullable<TemplateDetail["pausedReason"]>, string> = {
  admin: "Paused by an admin. Nothing new is created until it is resumed.",
  member_left:
    "Paused because a flatmate left. Check the rooms or shares for who is left, then resume it. Nothing new is created until then.",
  payer_left:
    "Paused because the person who collects or pays it left. Choose who does, then resume it. Nothing new is created until then.",
};

const CHANGE_LABEL: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  paused: "Paused",
  resumed: "Resumed",
  skipped: "Skipped a month",
  ended: "Ended",
};

/** One rent or bill: its rules, who is on it, its months and its change log. */
export function TemplateDetailView({
  detail,
  viewerId,
  viewerIsAdmin,
  skippable,
}: {
  detail: TemplateDetail;
  viewerId: string;
  viewerIsAdmin: boolean;
  skippable: string[];
}) {
  const isRent = detail.kind === "rent";
  const rentTotal = detail.rooms.reduce((sum, room) => sum + room.rentPence, 0);

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardLabel>{isRent ? "Rent" : "Bill"}</CardLabel>
        <h2 className="font-display mt-2 text-3xl">{detail.name}</h2>
        <p className="text-muted mt-2 text-sm">
          {describeSchedule(detail)} ·{" "}
          {isRent
            ? `${detail.paidById === viewerId ? "You collect" : `${detail.paidByName} collects`} it`
            : `${detail.paidById === viewerId ? "You pay" : `${detail.paidByName} pays`}`}
          {detail.amountPence !== null ? ` · ${formatPence(detail.amountPence)}` : ""}
        </p>
        {detail.ended ? (
          <p className="text-muted mt-3 text-sm">This has ended. It is kept as history.</p>
        ) : detail.paused && detail.pausedReason ? (
          <p role="status" className="text-negative mt-3 text-sm">
            {PAUSE_NOTE[detail.pausedReason]}
          </p>
        ) : null}
      </Card>

      {viewerIsAdmin ? (
        <Card>
          <CardLabel>Manage</CardLabel>
          <div className="mt-4">
            <TemplateActions
              templateId={detail.id}
              paused={detail.paused}
              ended={detail.ended}
              skippable={skippable}
            />
          </div>
        </Card>
      ) : null}

      {isRent ? (
        <Card>
          <CardLabel>Rooms and who pays what</CardLabel>
          <p className="text-muted mt-2 max-w-md text-sm">
            Only the owner, admins and the person who collects the rent can see this. Everyone else
            sees only their own rent.
          </p>
          <ul className="divide-line mt-4 divide-y">
            {detail.rooms.map((room) => (
              <li key={room.id} className="flex flex-col gap-2 py-4">
                <div className="flex items-start justify-between gap-4">
                  <span>{room.name}</span>
                  <span className="text-muted">{formatPence(room.rentPence)}</span>
                </div>
                <ul className="text-muted flex flex-col gap-1 text-sm">
                  {detail.shares
                    .filter((share) => share.roomId === room.id)
                    .map((share) => (
                      <li key={share.profileId} className="flex justify-between gap-4">
                        <span>
                          {share.displayName}
                          {share.profileId === detail.paidById ? " (collects)" : ""}
                        </span>
                        <span>{formatPence(share.shareValue ?? 0)}</span>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between gap-4 text-sm">
            <span className="text-muted">Total each month</span>
            <span>{formatPence(rentTotal)}</span>
          </p>
        </Card>
      ) : (
        <Card>
          <CardLabel>Shared by</CardLabel>
          {detail.shares.length === 0 ? (
            <p className="mt-3">Everyone in the flat.</p>
          ) : (
            <ul className="divide-line mt-2 divide-y">
              {detail.shares.map((share) => (
                <li key={share.profileId} className="flex justify-between gap-4 py-3">
                  <span>{share.displayName}</span>
                  {share.shareValue !== null ? (
                    <span className="text-muted">{share.shareValue / 100}%</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <CardLabel>Months</CardLabel>
        {detail.months.length === 0 ? (
          <p className="text-muted mt-3 text-sm">
            No month has been created yet. The first appears a{" "}
            {detail.amountMode === "variable" && !isRent ? "fortnight" : "week"} before it is due.
          </p>
        ) : (
          <ul className="divide-line mt-2 divide-y">
            {[...detail.months]
              .sort((a, b) => b.period.localeCompare(a.period))
              .map((month) => (
                <li key={month.period} className="flex justify-between gap-4 py-3">
                  <span>{monthLabel(month.period)}</span>
                  <span className="text-muted">{instanceStatusLabel(month.status)}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {detail.log.length > 0 ? (
        <Card>
          <CardLabel>What has changed</CardLabel>
          <ul className="divide-line mt-2 divide-y">
            {detail.log.map((entry) => (
              <li key={entry.id} className="flex justify-between gap-4 py-3 text-sm">
                <span>
                  {CHANGE_LABEL[entry.change] ?? entry.change} · {entry.changedByName}
                </span>
                <span className="text-muted">{formatDay(entry.createdAt.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
