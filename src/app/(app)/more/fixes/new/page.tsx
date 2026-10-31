import Link from "next/link";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { FixForm } from "@/features/fixes/fix-form";

export const metadata = { title: "Report a problem | FlatMate" };

export default function NewFixPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
          <header className="flex flex-col gap-2">
            <Link
              href="/more/fixes"
              className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Fix-it log
            </Link>
            <h1 className="font-display text-5xl sm:text-6xl">Report a problem</h1>
            <p className="text-muted max-w-md">
              Your flatmates are told. No photos are stored; describe it in words.
            </p>
          </header>
          <Card>
            <FixForm />
          </Card>
        </div>
      </RequireFlat>
    </Suspense>
  );
}
