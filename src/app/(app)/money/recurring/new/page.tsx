import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { TemplateFormLazy } from "@/features/recurring/template-form-lazy";
import { emptyValues } from "@/features/recurring/template-input";

export const metadata = { title: "Add rent or a bill | FlatMate" };

async function NewContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const members = isAdmin ? await getMembers() : [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money/recurring"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Rent and bills
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Add rent or a bill</h1>
        <p className="text-muted max-w-md">
          Set it up once and the app creates it every month by itself, tells the right people and
          reminds anyone who has not paid.
        </p>
      </header>
      {isAdmin ? (
        <Card>
          <CardLabel>Details</CardLabel>
          <div className="mt-4">
            <TemplateFormLazy
              people={members.map((m) => ({
                profileId: m.profileId,
                displayName: m.displayName,
                isAdmin: m.role === "owner" || m.role === "admin",
              }))}
              initial={emptyValues("bill", { profileId: membership.profileId })}
            />
          </div>
        </Card>
      ) : (
        <Card>
          <CardLabel>Admins only</CardLabel>
          <p className="mt-3 max-w-md text-lg">
            Only the owner and admins can add rent or a bill. Ask one of them.
          </p>
        </Card>
      )}
    </div>
  );
}

export default function NewTemplatePage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <NewContent />
      </RequireFlat>
    </Suspense>
  );
}
