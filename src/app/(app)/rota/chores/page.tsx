import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { ChoresManager } from "@/features/rota/chores-manager";
import { getChores } from "@/features/rota/chores";

export const metadata = { title: "Chores | FlatMate" };

async function ChoresContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const chores = await getChores();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/rota"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Rota
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Chores</h1>
        <p className="text-muted max-w-md">
          What needs doing in {membership.householdName}, how hard it is, and the steps that make it
          done.
        </p>
      </header>

      {isAdmin ? (
        <ChoresManager chores={chores} />
      ) : (
        <>
          <Card>
            <CardLabel>Only admins edit chores</CardLabel>
            <p className="mt-3 max-w-md">
              Ask an owner or admin if a chore or a step should change.
            </p>
          </Card>
          {chores.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {chores.map((chore) => (
                <li key={chore.id}>
                  <Card>
                    <h2 className="font-display text-2xl">{chore.name}</h2>
                    <ul className="mt-3 list-disc pl-5 text-sm">
                      {chore.items.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function ChoresPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <ChoresContent />
      </RequireFlat>
    </Suspense>
  );
}
