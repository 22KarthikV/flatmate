import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { parseExpenseId } from "@/features/ledger/form";
import { londonToday } from "@/features/ledger/form";
import { TemplateDetailView } from "@/features/recurring/template-detail";
import { skippableMonths } from "@/features/recurring/template-values";
import { getTemplateDetail } from "@/features/recurring/templates";

export const metadata = { title: "Rent or bill | FlatMate" };

function NotFound() {
  return (
    <Card>
      <CardLabel>Rent or bill</CardLabel>
      <p className="mt-3 text-lg">We couldn&rsquo;t find that.</p>
      <p className="text-muted mt-2 max-w-md text-sm">
        It may belong to another flat, or the link may be wrong.
      </p>
    </Card>
  );
}

async function TemplateContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;

  const id = parseExpenseId((await params).id);
  // A rent template cannot be read by a member, so this is "not found" for them, exactly as if the
  // link were wrong: the page never says that a rent exists.
  const detail = id ? await getTemplateDetail(id) : null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money/recurring"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Rent and bills
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">{detail ? detail.name : "Not found"}</h1>
      </header>
      {detail ? (
        <TemplateDetailView
          detail={detail}
          viewerId={membership.profileId}
          viewerIsAdmin={isAdmin}
          skippable={
            isAdmin && !detail.ended
              ? skippableMonths({
                  today: londonToday(),
                  dueDay: detail.dueDay,
                  activeMonths: detail.activeMonths,
                  existing: detail.months.map((month) => month.period),
                })
              : []
          }
        />
      ) : (
        <NotFound />
      )}
    </div>
  );
}

export default function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <TemplateContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
