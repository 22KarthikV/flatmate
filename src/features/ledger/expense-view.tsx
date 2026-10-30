import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";

import { categoryLabel } from "./constants";
import type { ExpenseDetail } from "./expenses";
import { formatDay } from "./format";
import { formatPence } from "./money";
import { VoidButton } from "./void-button";

/** One expense: what it was, who paid, each share, what happened to it, and (if allowed) how to change it. */
export function ExpenseView({
  expense,
  viewerId,
  canChange,
}: {
  expense: ExpenseDetail;
  viewerId: string;
  canChange: boolean;
}) {
  const heading = expense.voided ? (expense.replaced ? "Corrected" : "Cancelled") : null;

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardLabel>{heading ?? categoryLabel(expense.category)}</CardLabel>
        <h2
          className={`font-display mt-3 text-3xl ${expense.voided ? "text-muted line-through" : ""}`}
        >
          {expense.description}
        </h2>
        <p className={`mt-2 text-2xl ${expense.voided ? "text-muted line-through" : ""}`}>
          {formatPence(expense.amountPence)}
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Date</dt>
          <dd>{formatDay(expense.occurredOn)}</dd>
          <dt className="text-muted">Paid by</dt>
          <dd>{expense.paidById === viewerId ? "You" : expense.paidByName}</dd>
          <dt className="text-muted">Added by</dt>
          <dd>{expense.createdById === viewerId ? "You" : expense.createdByName}</dd>
          {expense.voided && expense.voidedByName ? (
            <>
              <dt className="text-muted">{expense.replaced ? "Corrected by" : "Cancelled by"}</dt>
              <dd>{expense.voidedByName}</dd>
            </>
          ) : null}
        </dl>
      </Card>

      <Card>
        <CardLabel>Who owes what</CardLabel>
        <ul className="divide-line mt-3 divide-y">
          {expense.shares.map((share) => (
            <li key={share.profileId} className="flex min-h-11 items-center justify-between gap-4">
              <span>{share.profileId === viewerId ? "You" : share.displayName}</span>
              <span>{formatPence(share.pence)}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted mt-3 text-sm">
          {expense.paidById === viewerId ? "You paid, so " : `${expense.paidByName} paid, so `}
          the others owe them their share.
        </p>
      </Card>

      {expense.history.length > 1 ? (
        <Card>
          <CardLabel>History</CardLabel>
          <ol className="divide-line mt-3 divide-y">
            {expense.history.map((version) => (
              <li
                key={version.id}
                className="flex min-h-11 items-center justify-between gap-4 py-2"
              >
                <span className="flex flex-col">
                  <span className={version.voided ? "text-muted line-through" : undefined}>
                    {version.description} · {formatPence(version.amountPence)}
                  </span>
                  <span className="text-muted text-sm">
                    {version.id === expense.id ? "This version" : "Other version"} · added by{" "}
                    {version.createdByName} on {formatDay(version.createdAt.slice(0, 10))}
                  </span>
                </span>
                {version.id !== expense.id ? (
                  <Link
                    href={`/money/expenses/${version.id}`}
                    className="label-caps min-h-11 shrink-0 content-center underline underline-offset-4"
                  >
                    View
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {canChange ? (
        <Card>
          <CardLabel>Change this expense</CardLabel>
          <p className="text-muted mt-3 max-w-md text-sm">
            Correcting keeps the old version in the history and tells everyone it involves.
          </p>
          <div className="mt-4 flex flex-col items-start gap-4">
            <Link
              href={`/money/expenses/${expense.id}/edit`}
              className="label-caps border-ink hover:bg-ink hover:text-paper inline-flex min-h-11 items-center border px-6"
            >
              Correct it
            </Link>
            <VoidButton expenseId={expense.id} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
