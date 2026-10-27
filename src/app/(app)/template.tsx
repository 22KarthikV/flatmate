import type { ReactNode } from "react";

/** Re-mounts on every navigation, so the page-in animation (CSS only, no JS) replays. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
