import Link from "next/link";

import { PlaceholderPage } from "@/features/shell/placeholder-page";

export const metadata = { title: "More | FlatMate" };

export default function MorePage() {
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-8">
        <Link
          href="/more/account"
          className="border-line flex min-h-14 items-center justify-between border px-6"
        >
          <span className="label-caps">Account</span>
          <span aria-hidden className="text-muted">
            &rarr;
          </span>
        </Link>
      </div>
      <PlaceholderPage
        eyebrow="Everything else"
        title="More"
        description="Shopping list, meter readings, bin days, house notes and settings."
        module="extras"
      />
    </>
  );
}
