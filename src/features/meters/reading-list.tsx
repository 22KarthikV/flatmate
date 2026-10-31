import { cancelReading } from "./actions";
import { formatAmount, unitLabel, usageBetween, usageText } from "./usage";
import type { MeterReading } from "./meters";

/** Readings newest first, each with the use since the one before it, who entered it and "Cancel". */
export function ReadingList({
  meterId,
  unit,
  readings,
  viewerId,
  isAdmin,
}: {
  meterId: string;
  unit: string;
  readings: MeterReading[];
  viewerId: string;
  isAdmin: boolean;
}) {
  if (readings.length === 0) {
    return <p className="text-muted">No readings yet. Add the first one above.</p>;
  }
  // The use that ends at each reading, found by the reading it ends on.
  const usageEndingAt = new Map(usageBetween(readings).map((gap) => [gap.toId, gap]));

  return (
    <ul>
      {readings.map((reading) => {
        const gap = usageEndingAt.get(reading.id);
        return (
          <li key={reading.id} className="border-line border-b py-3">
            <p className="break-words">
              {formatAmount(reading.value)} {unitLabel(unit)} on {reading.readOn}
              {reading.isReset ? " (new or reset meter)" : ""}
            </p>
            {gap ? <p className="text-sm">{usageText(gap, unit)}</p> : null}
            {reading.note ? <p className="text-muted text-sm break-words">{reading.note}</p> : null}
            <p className="text-muted text-sm">Entered by {reading.recordedByName}</p>
            {reading.recordedBy === viewerId || isAdmin ? (
              <form action={cancelReading}>
                <input type="hidden" name="readingId" value={reading.id} />
                <input type="hidden" name="meterId" value={meterId} />
                <button
                  type="submit"
                  aria-label={`Cancel the reading of ${formatAmount(reading.value)} on ${reading.readOn}`}
                  className="label-caps text-muted focus-visible:outline-ink inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2"
                >
                  Cancel
                </button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
