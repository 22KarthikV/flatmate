import Link from "next/link";

import { formatBadge } from "./format";

/** The bell link. `unread` is left out while the count is still loading. */
export function BellLink({ unread }: { unread?: number }) {
  const badge = formatBadge(unread ?? 0);
  const label = unread && unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="text-ink relative inline-flex size-11 items-center justify-center"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
        <path
          d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {badge ? (
        <span
          data-testid="bell-badge"
          aria-hidden="true"
          className="bg-ink text-paper absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center px-1 text-[0.625rem] leading-none"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
