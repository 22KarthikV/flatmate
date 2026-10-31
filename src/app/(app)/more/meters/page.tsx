import Link from "next/link";
import { Suspense } from "react";

import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { MeterCard } from "@/features/meters/meter-card";
import { getMeters } from "@/features/meters/meters";

export const metadata = { title: "Meter readings | FlatMate" };

async function MetersContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const meters = await getMeters();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/more"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          More
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Meter readings</h1>
        <p className="text-muted max-w-md">
          Gas, electricity and water readings for {membership.householdName}, and what the flat used
          between them. No costs are shown.
        </p>
        {isAdmin ? (
          <Link
            href="/more/meters/new"
            className="bg-ink text-paper label-caps inline-flex min-h-11 w-fit items-center px-5"
          >
            Add a meter
          </Link>
        ) : null}
      </header>
      {meters.length === 0 ? (
        <p>
          No meters yet. {isAdmin ? "Add your first meter above." : "Ask an admin to add them."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {meters.map((meter) => (
            <li key={meter.id}>
              <MeterCard meter={meter} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MetersPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <MetersContent />
      </RequireFlat>
    </Suspense>
  );
}
