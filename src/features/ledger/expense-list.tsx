import Link from "next/link";

import { categoryLabel } from "./constants";
import type { ExpenseRow } from "./expenses";
import { formatDay, groupByMonth } from "./format";
import { formatPence } from "./money";

function status(item: ExpenseRow): string | null {
  if (!item.voided) return null;
  return item.replaced ? "Corrected" : "Cancelled";
}

/** The flat's expenses, newest first, grouped by month. Cancelled and corrected ones are struck through. */
export function ExpenseList({ items, viewerId }: { items: ExpenseRow[]; viewerId: string }) {
  if (items.length === 0) {
    return (
      <p className="text-muted max-w-md text-sm">
        No expenses yet. Add the first one and everyone it involves will be told.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groupByMonth(items).map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="label-caps text-muted">{group.label}</h3>
          <ul className="divide-line mt-2 divide-y">
            {group.items.map((item) => {
              const label = status(item);
              return (
                <li key={item.id}>
                  <Link
                    href={`/money/expenses/${item.id}`}
                    className="flex min-h-11 items-start justify-between gap-4 py-3"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className={item.voided ? "text-muted line-through" : undefined}>
                        {item.description}
                      </span>
                      <span className="text-muted text-sm">
                        {categoryLabel(item.category)} ·{" "}
                        {item.paidById === viewerId ? "You paid" : `${item.paidByName} paid`} ·{" "}
                        {formatDay(item.occurredOn)}
                        {label ? ` · ${label}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={item.voided ? "text-muted line-through" : undefined}>
                        {formatPence(item.amountPence)}
                      </span>
                      {item.myShare !== null ? (
                        <span className="text-muted text-sm">
                          Your share {formatPence(item.myShare)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
