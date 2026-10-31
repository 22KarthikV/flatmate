import "server-only";

import { londonToday } from "@/features/ledger/form";

import { getBins } from "./bins";
import type { Collection } from "./collections";
import { nextCollections } from "./view";

/**
 * The next `count` collections, for a Home line or the bins screen. The Home wiring is a separate
 * change; this only reads.
 */
export async function getNextBinDays(count = 6): Promise<Collection[]> {
  const { streams, exceptions } = await getBins();
  return nextCollections(streams, exceptions, londonToday()).slice(0, count);
}
