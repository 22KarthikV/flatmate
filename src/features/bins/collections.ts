// Bin-day maths with no server imports. The SQL `private.bin_collections_on` follows the same
// rules and the shared vectors in parity-vectors.ts keep the two in step.

export interface BinStream {
  id: string;
  name: string;
  colour: string;
  /** A real collection date, yyyy-mm-dd. */
  anchorOn: string;
  everyWeeks: number;
}

export interface BinException {
  streamId: string;
  originalOn: string;
  kind: "skip" | "move";
  movedTo: string | null;
  note: string | null;
}

export interface Collection {
  date: string;
  streamId: string;
  name: string;
  colour: string;
  /** True when this is a collection moved here from another day. */
  moved: boolean;
  /** The date the pattern said, which differs from `date` only when moved. */
  originalOn: string;
  note: string | null;
}

const DAY_MS = 86_400_000;

/** Whole days since 1970-01-01 for a yyyy-mm-dd date. Calendar dates only, so clocks cannot matter. */
export function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

/** Whether the pattern collects on this date, before exceptions. */
export function isPatternDay(stream: BinStream, date: string): boolean {
  const period = 7 * stream.everyWeeks;
  return (((dayNumber(date) - dayNumber(stream.anchorOn)) % period) + period) % period === 0;
}

/**
 * Every collection from `from` to `to` (both included), after skips and moves, in date order then
 * by bin name.
 */
export function collectionsBetween(
  streams: BinStream[],
  exceptions: BinException[],
  from: string,
  to: string,
): Collection[] {
  const found: Collection[] = [];
  const first = dayNumber(from);
  const last = dayNumber(to);

  for (const stream of streams) {
    const mine = exceptions.filter((e) => e.streamId === stream.id);
    for (let day = first; day <= last; day++) {
      const date = fromDayNumber(day);
      const exception = mine.find((e) => e.originalOn === date);
      if (isPatternDay(stream, date) && !exception) {
        found.push({
          date,
          streamId: stream.id,
          name: stream.name,
          colour: stream.colour,
          moved: false,
          originalOn: date,
          note: null,
        });
      }
    }
    for (const e of mine) {
      if (e.kind === "move" && e.movedTo && e.movedTo >= from && e.movedTo <= to) {
        found.push({
          date: e.movedTo,
          streamId: stream.id,
          name: stream.name,
          colour: stream.colour,
          moved: true,
          originalOn: e.originalOn,
          note: e.note,
        });
      }
    }
  }

  return found.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
}
