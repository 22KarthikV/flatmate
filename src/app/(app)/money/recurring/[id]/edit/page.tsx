import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { parseExpenseId } from "@/features/ledger/form";
import { TemplateFormLazy } from "@/features/recurring/template-form-lazy";
import { valuesFromTemplate } from "@/features/recurring/template-values";
import { getTemplateDetail } from "@/features/recurring/templates";

export const metadata = { title: "Edit | FlatMate" };

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  const id = parseExpenseId((await params).id);
  const detail = isAdmin && id ? await getTemplateDetail(id) : null;
  const members = detail ? await getMembers() : [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href={id ? `/money/recurring/${id}` : "/money/recurring"}
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Back
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Edit</h1>
      </header>
      {detail && !detail.ended ? (
        <Card>
          <CardLabel>{detail.name}</CardLabel>
          <div className="mt-4">
            <TemplateFormLazy
              people={members.map((m) => ({
                profileId: m.profileId,
                displayName: m.displayName,
                isAdmin: m.role === "owner" || m.role === "admin",
              }))}
              initial={valuesFromTemplate(detail)}
              templateId={detail.id}
              lockKind
            />
          </div>
        </Card>
      ) : (
        <Card>
          <CardLabel>Edit</CardLabel>
          <p className="mt-3 max-w-md text-lg">
            {isAdmin
              ? "We couldn’t find that, or it has ended."
              : "Only the owner and admins can edit this."}
          </p>
        </Card>
      )}
    </div>
  );
}

export default function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <EditContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
