import Link from "next/link";

import { meterTitle } from "./constants";
import type { Meter } from "./meters";
import { formatAmount, unitLabel, usageBetween, usageText } from "./usage";

/** One meter: the latest reading and date, and the last use line. Links to its page. */
export function MeterCard({ meter }: { meter: Meter }) {
  const latest = meter.readings[0];
  const gaps = usageBetween(meter.readings);
  const last = gaps.at(-1);

  return (
    <Link
      href={`/more/meters/${meter.id}`}
      className="border-line flex min-h-14 flex-col gap-1 border p-4"
    >
      <span className="font-display text-2xl break-words">{meterTitle(meter)}</span>
      {latest ? (
        <span>
          {formatAmount(latest.value)} {unitLabel(meter.unit)} on {latest.readOn}
        </span>
      ) : (
        <span className="text-muted">No readings yet</span>
      )}
      {last ? <span className="text-muted text-sm">{usageText(last, meter.unit)}</span> : null}
      <span className="label-caps mt-1 underline underline-offset-4">Add a reading</span>
    </Link>
  );
}
