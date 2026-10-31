import { Card, CardLabel } from "@/components/ui/card";
import { formatPence } from "@/features/ledger/money";

import type { Totals, TotalsLine, TotalsSide } from "./totals";

function breakdown(line: TotalsLine): string {
  const parts: string[] = [];
  if (line.rentPence > 0) parts.push(`Rent ${formatPence(line.rentPence)}`);
  if (line.billsPence > 0) parts.push(`Bills and expenses ${formatPence(line.billsPence)}`);
  return parts.join(" · ");
}

function Side({
  label,
  side,
  empty,
  pendingNote,
}: {
  label: string;
  side: TotalsSide;
  empty: string;
  pendingNote: string;
}) {
  return (
    <Card>
      <CardLabel>{label}</CardLabel>
      <p className="font-display mt-3 text-3xl">{formatPence(side.totalPence)}</p>
      {side.lines.length === 0 ? (
        <p className="text-muted mt-3 max-w-md text-sm">{empty}</p>
      ) : (
        <ul className="divide-line mt-4 divide-y">
          {side.lines.map((line) => (
            <li key={line.profileId} className="flex flex-col gap-1 py-3">
              <div className="flex items-start justify-between gap-4">
                <span>{line.name}</span>
                <span>{formatPence(line.totalPence)}</span>
              </div>
              <p className="text-muted text-sm">{breakdown(line)}</p>
            </li>
          ))}
        </ul>
      )}
      {side.pendingRentPence > 0 ? (
        <p className="text-muted mt-4 max-w-md text-sm">
          {formatPence(side.pendingRentPence)} {pendingNote}
        </p>
      ) : null}
    </Card>
  );
}

/** What you owe and what you are owed, per person, with rent and bills and expenses together. */
export function TotalsView({ totals }: { totals: Totals }) {
  return (
    <div className="flex flex-col gap-8">
      <Side
        label="You owe"
        side={totals.owe}
        empty="You don’t owe anyone anything right now."
        pendingNote="of rent you said you paid is waiting to be confirmed. It isn’t counted above."
      />
      <Side
        label="Owed to you"
        side={totals.owed}
        empty="Nobody owes you anything right now."
        pendingNote="of rent has been marked as paid and is waiting for you to confirm. It isn’t counted above."
      />
      <p className="text-muted max-w-md text-sm">
        Bills and expenses are the fewest payments that would square the flat up, so they match
        Where you stand on the Money page. Rent is counted separately, and you only ever see your
        own rent and the rent you collect.
      </p>
    </div>
  );
}
