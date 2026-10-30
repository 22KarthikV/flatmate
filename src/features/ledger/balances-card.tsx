import { Card, CardLabel } from "@/components/ui/card";

import { describePayment, type BalancesView, type PersonRow } from "./balance-view";
import { formatPence } from "./money";

function headline(view: BalancesView): string {
  const { kind, pence } = view.summary;
  if (kind === "owed") return `You are owed ${formatPence(pence)}`;
  if (kind === "owes") return `You owe ${formatPence(pence)}`;
  return view.settled ? "Everyone is square" : "You are all square";
}

function position(row: PersonRow): string {
  if (row.status === "owed") return `is owed ${formatPence(row.pence)}`;
  if (row.status === "owes") return `owes ${formatPence(row.pence)}`;
  return "is square";
}

function PeopleList({ rows }: { rows: PersonRow[] }) {
  return (
    <ul className="divide-line divide-y">
      {rows.map((row) => (
        <li key={row.profileId} className="flex min-h-11 items-center justify-between gap-4 py-2">
          <span>{row.isYou ? `${row.displayName} (you)` : row.displayName}</span>
          <span className={row.status === "square" ? "text-muted" : undefined}>
            {position(row)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Where everyone stands, and the fewest payments that would square the flat up. */
export function BalancesCard({ view }: { view: BalancesView }) {
  return (
    <Card>
      <CardLabel>Where you stand</CardLabel>
      <p className="font-display mt-3 text-3xl">{headline(view)}</p>

      {view.inconsistent ? (
        <p role="alert" className="text-negative mt-3 max-w-md text-sm">
          The flat&rsquo;s balances don&rsquo;t add up, so payments can&rsquo;t be suggested. This
          shouldn&rsquo;t happen; please tell whoever runs FlatMate.
        </p>
      ) : null}

      <div className="mt-4">
        <PeopleList rows={view.people} />
      </div>

      {view.payments.length > 0 ? (
        <div className="mt-6">
          <h3 className="label-caps text-muted">Suggested payments</h3>
          <p className="text-muted mt-1 max-w-md text-sm">
            The fewest payments that would square everyone up.
          </p>
          <ul className="divide-line mt-2 divide-y">
            {view.payments.map((payment) => (
              <li
                key={`${payment.fromId}-${payment.toId}`}
                className={`flex min-h-11 items-center py-2 ${payment.involvesYou ? "" : "text-muted"}`}
              >
                {describePayment(payment)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.former.length > 0 ? (
        <div className="mt-6">
          <h3 className="label-caps text-muted">Former flatmates</h3>
          <p className="text-muted mt-1 max-w-md text-sm">
            They have left the flat, but money is still open with them.
          </p>
          <div className="mt-2">
            <PeopleList rows={view.former} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
