import Link from "next/link";

import { COLOURS } from "./constants";
import type { Collection } from "./collections";
import { dayWord, groupByDate } from "./view";

export function ColourDot({ colour }: { colour: string }) {
  const hex = COLOURS.find((c) => c.id === colour)?.hex ?? "#bdbdbd";
  return (
    <span
      aria-hidden
      className="border-ink inline-block size-4 shrink-0 border"
      style={{ backgroundColor: hex }}
    />
  );
}

/**
 * The next bin days by date. The day is a word and each bin keeps its name beside its colour, so
 * colour never carries the meaning alone.
 */
export function BinDays({
  collections,
  today,
  isAdmin,
  hasBins,
}: {
  collections: Collection[];
  today: string;
  isAdmin: boolean;
  hasBins: boolean;
}) {
  if (!hasBins) {
    return (
      <div className="flex flex-col gap-4">
        <p>
          No bin days yet. {isAdmin ? "Add your bins to get started." : "Ask an admin to add them."}
        </p>
        {isAdmin ? (
          <Link
            href="/more/bins/manage"
            className="bg-ink text-paper label-caps inline-flex min-h-11 w-fit items-center px-5"
          >
            Set up bins
          </Link>
        ) : null}
      </div>
    );
  }
  if (collections.length === 0) {
    return <p className="text-muted">No collections in the next six weeks.</p>;
  }

  return (
    <ul className="flex flex-col">
      {groupByDate(collections).map((group) => (
        <li key={group.date} className="border-line border-b py-3">
          <p className="label-caps">{dayWord(group.date, today)}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={`${item.streamId}-${item.date}`} className="flex items-center gap-3">
                <ColourDot colour={item.colour} />
                <span className="break-words">{item.name}</span>
                {item.moved ? <span className="text-muted text-sm">(moved)</span> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
