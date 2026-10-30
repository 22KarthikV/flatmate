import Link from "next/link";

import { formatPence } from "@/features/ledger/money";

import { describeSchedule } from "./format";
import type { BillTemplate } from "./templates";

const PAUSE_NOTE: Record<NonNullable<BillTemplate["pausedReason"]>, string> = {
  admin: "Paused by an admin. Nothing new is created until it is resumed.",
  member_left: "Paused because a flatmate left. An admin needs to check it and resume it.",
  payer_left: "Paused because the person who pays it left. An admin needs to choose who pays.",
};

/** The flat's bills, each in a line: who pays, when it is due, and what it is. */
export function TemplateList({
  templates,
  viewerId,
}: {
  templates: BillTemplate[];
  viewerId: string;
}) {
  if (templates.length === 0) {
    return (
      <p className="text-muted max-w-md text-sm">
        No bills are set up yet. An admin can add gas, electricity, Wi-Fi or council tax, and the
        app will create each month by itself.
      </p>
    );
  }

  return (
    <ul className="divide-line divide-y">
      {templates.map((template) => (
        <li key={template.id} className="flex flex-col gap-1 py-4">
          <div className="flex items-start justify-between gap-4">
            <Link
              href={`/money/recurring/${template.id}`}
              className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {template.name}
            </Link>
            <span className="text-muted shrink-0">
              {template.amountPence !== null ? formatPence(template.amountPence) : "Changes"}
            </span>
          </div>
          <p className="text-muted text-sm">
            {template.paidById === viewerId ? "You pay" : `${template.paidByName} pays`} ·{" "}
            {describeSchedule(template)}
          </p>
          {template.paused && template.pausedReason ? (
            <p role="status" className="text-negative text-sm">
              {PAUSE_NOTE[template.pausedReason]}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
