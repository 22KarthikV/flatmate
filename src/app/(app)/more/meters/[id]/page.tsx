import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { londonToday } from "@/features/ledger/form";
import { archiveMeter } from "@/features/meters/actions";
import { meterTitle } from "@/features/meters/constants";
import { getMeter } from "@/features/meters/meters";
import { ReadingForm } from "@/features/meters/reading-form";
import { ReadingList } from "@/features/meters/reading-list";
import { parseMeterId } from "@/features/meters/schemas";

export const metadata = { title: "Meter | FlatMate" };

async function MeterContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;

  const id = parseMeterId((await params).id);
  const meter = id ? await getMeter(id) : null;
  if (!id || !meter) redirect("/more/meters");
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
        <h1 className="font-display text-4xl break-words sm:text-5xl">{meterTitle(meter)}</h1>
      </header>
      <Card>
        <ReadingForm meterId={meter.id} unit={meter.unit} today={londonToday()} />
      </Card>
      <section aria-labelledby="readings">
        <h2 id="readings" className="label-caps text-muted">
          Readings, newest first
        </h2>
        <ReadingList
          meterId={meter.id}
          unit={meter.unit}
          readings={meter.readings}
          viewerId={membership.profileId}
          isAdmin={isAdmin}
        />
      </section>
      {isAdmin ? (
        <form action={archiveMeter}>
          <input type="hidden" name="meterId" value={meter.id} />
          <Button type="submit" variant="secondary">
            Remove this meter
          </Button>
          <p className="text-muted mt-2 text-sm">Its readings are kept.</p>
        </form>
      ) : null}
    </div>
  );
}

export default function MeterPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <MeterContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
