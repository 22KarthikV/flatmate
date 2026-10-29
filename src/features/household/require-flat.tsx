import type { ReactNode } from "react";

import { getMembership } from "./membership";
import { NoFlat } from "./no-flat";

/** Wraps a tab that belongs to a flat. People without one see the set-up screen instead. */
export async function RequireFlat({ children }: { children: ReactNode }) {
  const membership = await getMembership();
  if (!membership) return <NoFlat />;
  return <>{children}</>;
}
