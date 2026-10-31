import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { FixTimeline } from "@/features/fixes/fix-timeline";
import { getReport } from "@/features/fixes/fixes";
import { parseFixId } from "@/features/fixes/schemas";
import { StatusControls } from "@/features/fixes/status-controls";
import { ageText, chasingText, statusLabel } from "@/features/fixes/view";

export const metadata = { title: "Problem | FlatMate" };

async function FixContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;

  const id = parseFixId((await params).id);
  const found = id ? await getReport(id) : null;
  if (!found) redirect("/more/fixes");
  const { report, updates } = found;

  const members = await getMembers();
  const now = new Date().toISOString();
  const viewer = {
    profileId: membership.profileId,
    isAdmin: membership.role === "owner" || membership.role === "admin",
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/more/fixes"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Fix-it log
        </Link>
        <h1 className="font-display text-4xl break-words sm:text-5xl">{report.title}</h1>
        <p className="text-muted">
          {statusLabel(report.status)}
          {report.location ? ` · ${report.location}` : ""} · {chasingText(report)}
        </p>
        <p className="text-muted text-sm">
          Reported by {report.reporterName}, {ageText(report.createdAt, now)}
        </p>
      </header>
      {report.details ? (
        <Card>
          <p className="break-words whitespace-pre-line">{report.details}</p>
        </Card>
      ) : null}
      <section aria-labelledby="timeline">
        <h2 id="timeline" className="label-caps text-muted">
          What has happened
        </h2>
        <FixTimeline updates={updates} now={now} />
      </section>
      <StatusControls
        report={report}
        viewer={viewer}
        people={members.map(({ profileId, displayName }) => ({ profileId, displayName }))}
      />
    </div>
  );
}

export default function FixPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <FixContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
