import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { parseExpenseId } from "@/features/ledger/form";
import { formatDay } from "@/features/ledger/format";
import { AmountForm } from "@/features/recurring/amount-form";
import { getBillMonth } from "@/features/recurring/months";
import { getBillSharers, getBillTemplates } from "@/features/recurring/templates";

export const metadata = { title: "Enter an amount | FlatMate" };

function Message({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardLabel>This month&rsquo;s amount</CardLabel>
      <p className="mt-3 max-w-md text-lg">{children}</p>
    </Card>
  );
}

async function AmountContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;

  const id = parseExpenseId((await params).id);
  const month = id ? await getBillMonth(id) : null;
  const template = month ? (await getBillTemplates()).find((t) => t.id === month.templateId) : null;

  let body: React.ReactNode;
  if (!month || !template) {
    body = <Message>We couldn&rsquo;t find that bill.</Message>;
  } else if (month.payerId !== membership.profileId) {
    body = <Message>Only {month.payerName} enters the amount for this bill.</Message>;
  } else if (month.status !== "awaiting_amount") {
    body = <Message>The amount for this month has already been entered.</Message>;
  } else {
    const sharers = await getBillSharers(template.id, template.splitMode);
    body = (
      <Card>
        <CardLabel>
          {template.name} · due {formatDay(month.dueOn)}
        </CardLabel>
        <div className="mt-4">
          <AmountForm
            instanceId={month.id}
            billName={template.name}
            splitMode={template.splitMode}
            sharers={sharers}
          />
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/money/recurring"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Rent and bills
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Enter an amount</h1>
      </header>
      {body}
    </div>
  );
}

export default function AmountPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <AmountContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
