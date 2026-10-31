import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { archiveBin, clearException } from "@/features/bins/actions";
import { ColourDot } from "@/features/bins/bin-days";
import { BinForm } from "@/features/bins/bin-form";
import { getBins } from "@/features/bins/bins";
import { EVERY_WEEKS } from "@/features/bins/constants";
import { ExceptionForm } from "@/features/bins/exception-form";
import { dayWord } from "@/features/bins/view";
import { londonToday } from "@/features/ledger/form";

export const metadata = { title: "Set up bins | FlatMate" };

async function ManageContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const today = londonToday();

  const header = (
    <header className="flex flex-col gap-2">
      <Link
        href="/more/bins"
        className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Bin days
      </Link>
      <h1 className="font-display text-5xl sm:text-6xl">Set up bins</h1>
    </header>
  );

  if (!isAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
        {header}
        <Card>
          <CardLabel>Only admins set up bins</CardLabel>
          <p className="mt-3 max-w-md">
            Ask an owner or admin if a bin or a collection should change.
          </p>
        </Card>
      </div>
    );
  }

  const { streams, exceptions } = await getBins();
  const nameOf = (id: string) => streams.find((s) => s.id === id)?.name ?? "A bin";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      {header}

      <section aria-labelledby="your-bins" className="flex flex-col gap-4">
        <h2 id="your-bins" className="label-caps text-muted">
          Your bins
        </h2>
        {streams.map((stream) => (
          <Card key={stream.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <ColourDot colour={stream.colour} />
                <div className="min-w-0">
                  <p className="break-words">{stream.name}</p>
                  <p className="text-muted text-sm">
                    {EVERY_WEEKS.find((e) => e.id === stream.everyWeeks)?.label}
                  </p>
                </div>
              </div>
              <form action={archiveBin}>
                <input type="hidden" name="binId" value={stream.id} />
                <Button type="submit" variant="secondary" aria-label={`Remove ${stream.name}`}>
                  Remove
                </Button>
              </form>
            </div>
            <details className="mt-3">
              <summary className="label-caps inline-flex min-h-11 cursor-pointer items-center underline underline-offset-4">
                Edit {stream.name}
              </summary>
              <div className="mt-3">
                <BinForm
                  bin={{
                    id: stream.id,
                    name: stream.name,
                    colour: stream.colour,
                    anchorOn: stream.anchorOn,
                    everyWeeks: stream.everyWeeks,
                  }}
                  today={today}
                />
                <p className="text-muted mt-2 text-sm">
                  Changing the pattern removes any skipped or moved collections that no longer match
                  it.
                </p>
              </div>
            </details>
          </Card>
        ))}
        <Card>
          <CardLabel>Add a bin</CardLabel>
          <div className="mt-4">
            <BinForm today={today} />
          </div>
        </Card>
      </section>

      {streams.length > 0 ? (
        <section aria-labelledby="changes" className="flex flex-col gap-4">
          <h2 id="changes" className="label-caps text-muted">
            When the council changes a collection
          </h2>
          <Card>
            <ExceptionForm streams={streams} today={today} />
          </Card>
          {exceptions.length > 0 ? (
            <ul>
              {exceptions.map((e) => (
                <li
                  key={e.id}
                  className="border-line flex min-h-14 items-center justify-between gap-3 border-b py-2"
                >
                  <p className="break-words">
                    {nameOf(e.streamId)}, {dayWord(e.originalOn, today)}:{" "}
                    {e.kind === "skip"
                      ? "not collected"
                      : `moved to ${dayWord(e.movedTo ?? e.originalOn, today)}`}
                    {e.note ? ` (${e.note})` : ""}
                  </p>
                  <form action={clearException}>
                    <input type="hidden" name="exceptionId" value={e.id} />
                    <Button type="submit" variant="secondary">
                      Clear
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default function ManageBinsPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <ManageContent />
      </RequireFlat>
    </Suspense>
  );
}
