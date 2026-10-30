import { groupByMonth } from "./format";
import { formatDay } from "./format";
import { describePaymentHistory, type PaymentHistoryItem } from "./history";

/** Payments that have been decided, newest first, grouped by month. */
export function PaymentHistoryList({
  items,
  viewerId,
}: {
  items: PaymentHistoryItem[];
  viewerId: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted max-w-md text-sm">
        No payments yet. When someone records a payment and it is confirmed, it appears here.
      </p>
    );
  }

  const dated = items.map((item) => ({ ...item, occurredOn: item.when.slice(0, 10) }));

  return (
    <div className="flex flex-col gap-6">
      {groupByMonth(dated).map((group) => (
        <section key={group.key} aria-label={`Payments, ${group.label}`}>
          <h3 className="label-caps text-muted">{group.label}</h3>
          <ul className="divide-line mt-2 divide-y">
            {group.items.map((item) => {
              const text = describePaymentHistory(item, viewerId);
              return (
                <li key={item.id} className="flex min-h-11 flex-col gap-1 py-3">
                  <span
                    className={item.status === "confirmed" ? undefined : "text-muted line-through"}
                  >
                    {text.headline}
                  </span>
                  <span className="text-muted text-sm">
                    {text.status} · {formatDay(item.occurredOn)}
                    {text.detail ? ` · ${text.detail}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
