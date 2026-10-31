import Link from "next/link";

import { PlaceholderPage } from "@/features/shell/placeholder-page";

export const metadata = { title: "More | FlatMate" };

export default function MorePage() {
  return (
    <PlaceholderPage
      eyebrow="Everything else"
      title="More"
      description="Shopping list, meter readings, bin days, house notes and settings."
      module="extras"
    >
      <Link
        href="/more/shopping"
        className="border-line flex min-h-14 items-center justify-between border px-6"
      >
        <span className="label-caps">Shopping list</span>
        <span aria-hidden className="text-muted">
          &rarr;
        </span>
      </Link>
      <Link
        href="/more/bins"
        className="border-line flex min-h-14 items-center justify-between border px-6"
      >
        <span className="label-caps">Bin days</span>
        <span aria-hidden className="text-muted">
          &rarr;
        </span>
      </Link>
      <Link
        href="/more/board"
        className="border-line flex min-h-14 items-center justify-between border px-6"
      >
        <span className="label-caps">Noticeboard</span>
        <span aria-hidden className="text-muted">
          &rarr;
        </span>
      </Link>
      <Link
        href="/more/flat"
        className="border-line flex min-h-14 items-center justify-between border px-6"
      >
        <span className="label-caps">Your flat</span>
        <span aria-hidden className="text-muted">
          &rarr;
        </span>
      </Link>
      <Link
        href="/more/notifications"
        className="border-line flex min-h-14 items-center justify-between border px-6"
      >
        <span className="label-caps">Notifications</span>
        <span aria-hidden className="text-muted">
          &rarr;
        </span>
      </Link>
      <Link
        href="/more/account"
        className="border-line flex min-h-14 items-center justify-between border px-6"
      >
        <span className="label-caps">Account</span>
        <span aria-hidden className="text-muted">
          &rarr;
        </span>
      </Link>
    </PlaceholderPage>
  );
}
