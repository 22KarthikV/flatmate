import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { MeterForm } from "@/features/meters/meter-form";

export const metadata = { title: "Add a meter | FlatMate" };

async function NewMeterContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/more/meters"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Meter readings
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Add a meter</h1>
      </header>
      {isAdmin ? (
        <Card>
          <MeterForm />
        </Card>
      ) : (
        <Card>
          <CardLabel>Only admins add meters</CardLabel>
          <p className="mt-3 max-w-md">Ask an owner or admin to add the meter you want to read.</p>
        </Card>
      )}
    </div>
  );
}

export default function NewMeterPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <NewMeterContent />
      </RequireFlat>
    </Suspense>
  );
}
