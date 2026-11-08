"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/cn";

import { describePayment, type PersonRow, type SuggestedPayment } from "./balance-view";
import { formatDay, groupByMonth } from "./format";
import { formatPence } from "./money";
import { ledgerTotal, type LedgerItem } from "./person-ledger";

type Mode = "history" | "fewest";

const MODES: { value: Mode; label: string }[] = [
  { value: "history", label: "What adds up" },
  { value: "fewest", label: "Fewest payments" },
];

const NOT_COUNTED: Record<string, string> = {
  cancelled: "Cancelled",
  pending: "Waiting to be confirmed",
  declined: "Declined",
};

function signed(pence: number): string {
  return pence > 0 ? `+${formatPence(pence)}` : formatPence(pence);
}

function position(person: PersonRow): string {
  const who = person.isYou ? "You" : person.displayName;
  const amount = formatPence(person.pence);
  if (person.status === "owed") return `${who} ${person.isYou ? "are" : "is"} owed ${amount}`;
  if (person.status === "owes") return `${who} ${person.isYou ? "owe" : "owes"} ${amount}`;
  return `${who} ${person.isYou ? "are" : "is"} square`;
}

function ItemRow({ item, person, isYou }: { item: LedgerItem; person: PersonRow; isYou: boolean }) {
  const subject = isYou ? "You" : person.displayName;
  const struck = item.counts ? undefined : "text-muted line-through";
  const note = item.counts ? null : (NOT_COUNTED[item.status] ?? item.status);

  let title: string;
  let detail: string;
  if (item.kind === "expense") {
    const payer = item.otherId === person.profileId ? subject : item.otherName;
    title = item.description;
    detail = `${payer} paid ${formatPence(item.amountPence)}`;
    if (item.sharePence > 0) {
      detail += ` · ${isYou ? "Your" : "Their"} share ${formatPence(item.sharePence)}`;
    }
  } else {
    title =
      item.effectPence > 0
        ? `${subject} paid ${item.otherName}`
        : `${item.otherName} paid ${subject}`;
    detail = `Payment of ${formatPence(item.amountPence)}`;
  }
  detail += ` · ${formatDay(item.occurredOn)}`;
  if (note) detail += ` · ${note}`;

  const body = (
    <>
      <span className="flex min-w-0 flex-col gap-1">
        <span className={struck}>{title}</span>
        <span className="text-muted text-sm">{detail}</span>
      </span>
      <span className={cn("shrink-0", struck)}>{signed(item.effectPence)}</span>
    </>
  );
  const layout = "flex min-h-11 items-start justify-between gap-4 py-3";

  return (
    <li>
      {item.kind === "expense" ? (
        <Link href={`/money/expenses/${item.id}`} className={layout}>
          {body}
        </Link>
      ) : (
        <div className={layout}>{body}</div>
      )}
    </li>
  );
}

function History({
  items,
  person,
  isYou,
}: {
  items: LedgerItem[];
  person: PersonRow;
  isYou: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const hidden = items.filter((item) => !item.counts).length;
  const shown = showAll ? items : items.filter((item) => item.counts);
  const total = ledgerTotal(items);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted max-w-md text-sm">
        Each line shows what it adds to what {isYou ? "you are" : "they are"} owed (+) or what it
        adds to what {isYou ? "you owe" : "they owe"} (−). Rent is private and is not in here.
      </p>

      {shown.length === 0 ? (
        <p className="text-muted max-w-md text-sm">Nothing yet.</p>
      ) : (
        groupByMonth(shown).map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h3 className="label-caps text-muted">{group.label}</h3>
            <ul className="divide-line mt-2 divide-y">
              {group.items.map((item) => (
                <ItemRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  person={person}
                  isYou={isYou}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <div className="border-ink flex items-start justify-between gap-4 border-t pt-3">
        <span className="label-caps">Adds up to</span>
        <span>
          {total === 0
            ? "Square"
            : total > 0
              ? `${formatPence(total)} owed`
              : `${formatPence(-total)} owing`}
        </span>
      </div>

      {hidden > 0 ? (
        <button
          type="button"
          aria-pressed={showAll}
          onClick={() => setShowAll((value) => !value)}
          className="label-caps min-h-11 self-start underline underline-offset-4"
        >
          {showAll ? "Hide" : "Show"} {hidden} cancelled or unconfirmed
        </button>
      ) : null}
    </div>
  );
}

function Fewest({
  payments,
  person,
  isYou,
  inconsistent,
}: {
  payments: SuggestedPayment[];
  person: PersonRow;
  isYou: boolean;
  inconsistent: boolean;
}) {
  if (inconsistent) {
    return (
      <p role="alert" className="text-negative max-w-md text-sm">
        The flat&rsquo;s balances don&rsquo;t add up, so payments can&rsquo;t be suggested.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted max-w-md text-sm">
        The fewest payments that would square the whole flat up. They are worked out for everyone
        together, so they can differ from the items for one person.
      </p>
      {payments.length === 0 ? (
        <p className="text-muted max-w-md text-sm">
          {isYou ? "You don’t" : `${person.displayName} doesn’t`} need to pay anyone, or be paid,
          right now.
        </p>
      ) : (
        <ul className="divide-line divide-y">
          {payments.map((payment) => (
            <li
              key={`${payment.fromId}-${payment.toId}`}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 py-2"
            >
              <span>{describePayment(payment)}</span>
              {payment.youPay ? (
                <Link
                  href={`/money/settle?to=${payment.toId}&amount=${(payment.pence / 100).toFixed(2)}`}
                  className="label-caps inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  Record this payment
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What adds up to one person's balance, with a switch to the fewest payments that would square the flat. */
export function PersonLedgerView({
  person,
  items,
  payments,
  inconsistent,
}: {
  person: PersonRow;
  items: LedgerItem[];
  payments: SuggestedPayment[];
  inconsistent: boolean;
}) {
  const [mode, setMode] = useState<Mode>("history");

  return (
    <div className="flex flex-col gap-6">
      <p className="font-display text-3xl">{position(person)}</p>
      <div role="group" aria-label="Show" className="flex gap-2">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
            className={cn(
              "label-caps border-ink min-h-11 flex-1 border px-3 transition-colors duration-200",
              mode === option.value
                ? "bg-ink text-paper"
                : "text-ink hover:bg-ink hover:text-paper",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {mode === "history" ? (
        <History items={items} person={person} isYou={person.isYou} />
      ) : (
        <Fewest
          payments={payments}
          person={person}
          isYou={person.isYou}
          inconsistent={inconsistent}
        />
      )}
    </div>
  );
}
