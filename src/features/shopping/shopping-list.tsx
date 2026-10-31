import Link from "next/link";

import { Button } from "@/components/ui/button";

import { clearBought, removeItem, setBought } from "./actions";
import { buyHref, groupItems, type ShoppingItem } from "./list";

type RowState = "open" | "bought" | "expense";

function Row({
  item,
  viewerId,
  isAdmin,
  state,
}: {
  item: ShoppingItem;
  viewerId: string;
  isAdmin: boolean;
  state: RowState;
}) {
  const canRemove = state !== "expense" && (item.addedBy === viewerId || isAdmin);
  return (
    <li className="border-line flex min-h-14 items-center justify-between gap-3 border-b py-2">
      <div className="flex min-w-0 items-center gap-3">
        {state === "expense" ? (
          <span aria-hidden className="text-muted size-6 shrink-0 text-center">
            ✓
          </span>
        ) : (
          <form action={setBought}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="bought" value={state === "open" ? "true" : "false"} />
            <button
              type="submit"
              aria-label={
                state === "open"
                  ? `Mark ${item.name} as bought`
                  : `Put ${item.name} back on the list`
              }
              aria-pressed={state === "bought"}
              className="border-ink focus-visible:outline-ink flex size-11 shrink-0 items-center justify-center border focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden>{state === "bought" ? "✓" : ""}</span>
            </button>
          </form>
        )}
        <div className="min-w-0">
          <p className={state === "open" ? "break-words" : "text-muted break-words line-through"}>
            {item.name}
          </p>
          <p className="text-muted text-sm break-words">
            {item.note ? `${item.note} · ` : ""}
            {state === "open"
              ? `Added by ${item.addedByName}`
              : `Bought${item.boughtByName ? ` by ${item.boughtByName}` : ""}`}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {state === "expense" && item.expenseId ? (
          <Link
            href={`/money/expenses/${item.expenseId}`}
            className="label-caps inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Expense
          </Link>
        ) : null}
        {canRemove ? (
          <form action={removeItem}>
            <input type="hidden" name="itemId" value={item.id} />
            <button
              type="submit"
              aria-label={`Remove ${item.name}`}
              className="label-caps text-muted focus-visible:outline-ink inline-flex min-h-11 items-center px-2 underline underline-offset-4 focus-visible:outline-2"
            >
              Remove
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

/** The list in three sections. Ticking and removing are plain forms, so they work before the page has loaded. */
export function ShoppingList({
  items,
  viewerId,
  isAdmin,
}: {
  items: ShoppingItem[];
  viewerId: string;
  isAdmin: boolean;
}) {
  const groups = groupItems(items);
  const href = buyHref(groups.bought);

  if (groups.open.length + groups.bought.length + groups.inExpense.length === 0) {
    return <p className="text-muted">Nothing on the list. Add what the flat needs above.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="to-buy">
        <h2 id="to-buy" className="label-caps text-muted">
          To buy ({groups.open.length})
        </h2>
        {groups.open.length === 0 ? (
          <p className="mt-3">Everything is bought.</p>
        ) : (
          <ul>
            {groups.open.map((item) => (
              <Row key={item.id} item={item} viewerId={viewerId} isAdmin={isAdmin} state="open" />
            ))}
          </ul>
        )}
      </section>

      {groups.bought.length > 0 ? (
        <section aria-labelledby="bought">
          <h2 id="bought" className="label-caps text-muted">
            Bought ({groups.bought.length})
          </h2>
          <ul>
            {groups.bought.map((item) => (
              <Row key={item.id} item={item} viewerId={viewerId} isAdmin={isAdmin} state="bought" />
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {href ? (
              <Link
                href={href}
                className="bg-ink text-paper label-caps inline-flex min-h-11 items-center px-5"
              >
                Turn into an expense
              </Link>
            ) : null}
            <form action={clearBought}>
              <Button type="submit" variant="secondary">
                Clear bought
              </Button>
            </form>
          </div>
        </section>
      ) : null}

      {groups.inExpense.length > 0 ? (
        <section aria-labelledby="in-expense">
          <h2 id="in-expense" className="label-caps text-muted">
            Added to expenses ({groups.inExpense.length})
          </h2>
          <ul>
            {groups.inExpense.map((item) => (
              <Row
                key={item.id}
                item={item}
                viewerId={viewerId}
                isAdmin={isAdmin}
                state="expense"
              />
            ))}
          </ul>
          {groups.bought.length === 0 ? (
            <form action={clearBought} className="mt-4">
              <Button type="submit" variant="secondary">
                Clear bought
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
