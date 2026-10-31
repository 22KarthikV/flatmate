import { Suspense, type ReactNode } from "react";

import { logger } from "@/lib/logger";

/** A fixed-height stand-in while a block loads, hidden from screen readers. */
function Placeholder({ height }: { height: string }) {
  return <div aria-hidden className={`border-line border ${height}`} />;
}

interface BlockProps<T> {
  /** Names the log line: `home.<name>_failed`. */
  name: string;
  /** Reads what the block shows. Throw, or return null, when it could not be read. */
  load: () => Promise<T | null>;
  /** Pure: turns what was read into the block. */
  children: (data: T) => ReactNode;
}

/** Loads and renders one block. Any failure becomes one calm line; the real error is only logged. */
export async function BlockBody<T>({ name, load, children }: BlockProps<T>): Promise<ReactNode> {
  try {
    const data = await load();
    if (data === null) throw new Error("no data");
    return children(data);
  } catch (error) {
    logger.error(`home.${name}_failed`, { error });
    return (
      <p className="text-muted text-sm">
        Couldn&rsquo;t load this.{" "}
        {/* A plain link on purpose: it reloads the page and adds no client code. */}
        <a
          href="/dashboard"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Try again
        </a>
      </p>
    );
  }
}

/** One part of the home page: its own loading placeholder and its own error line. */
export function HomeBlock<T>({
  height = "min-h-24",
  ...props
}: BlockProps<T> & { height?: string }) {
  return (
    <Suspense fallback={<Placeholder height={height} />}>
      <BlockBody {...props} />
    </Suspense>
  );
}
