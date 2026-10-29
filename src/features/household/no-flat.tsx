import Link from "next/link";

import { Card, CardLabel } from "@/components/ui/card";

/** Shown on tabs that need a flat to someone who has not created or joined one yet. */
export function NoFlat() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Almost there</p>
        <h1 className="font-display text-5xl sm:text-6xl">Set up your flat first</h1>
        <p className="text-muted max-w-md">
          This part of FlatMate is shared with your flatmates, so it opens once you have a flat.
        </p>
      </header>
      <Card>
        <CardLabel>Next step</CardLabel>
        <p className="mt-3 text-lg">Create your flat, or join one with an invite link.</p>
        <Link
          href="/dashboard"
          className="label-caps mt-4 inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Go to Home
        </Link>
      </Card>
    </div>
  );
}
