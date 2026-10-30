import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { RequireFlat } from "@/features/household/require-flat";
import { Checklist } from "@/features/rota/checklist";
import { parseChoreId } from "@/features/rota/schemas";
import { STATUS_TEXT, dayLabel, statusOf } from "@/features/rota/week-model";
import { londonDate } from "@/features/rota/week";
import { getAssignment, getWeeks } from "@/features/rota/weeks";
import { buildSwapOptions } from "@/features/rota/swap-options";
import { ReassignForm, SwapSheet } from "@/features/rota/swap-sheet";
import { getAwayDays } from "@/features/rota/swaps";

export const metadata = { title: "Chore | FlatMate" };

function NotFound() {
  return (
    <Card>
      <CardLabel>Chore</CardLabel>
      <p className="mt-3 text-lg">We couldn&rsquo;t find that chore.</p>
      <p className="text-muted mt-2 max-w-md text-sm">
        It may belong to another flat, or the link may be wrong.
      </p>
    </Card>
  );
}

async function AssignmentContent({ params }: { params: Promise<{ id: string }> }) {
  const membership = await getMembership();
  if (!membership) return null;

  const id = parseChoreId((await params).id);
  const detail = id ? await getAssignment(id) : null;
  const today = londonDate(new Date());

  const open = Boolean(detail?.current && detail.assignment.completedAt === null);
  const mine = detail?.assignment.assigneeId === membership.profileId;
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  let swapOptions: ReturnType<typeof buildSwapOptions> = [];
  let movePeople: { profileId: string; displayName: string }[] = [];
  if (detail && open && (mine || isAdmin)) {
    const [members, away, weeks] = await Promise.all([
      getMembers(),
      getAwayDays(detail.weekStart),
      getWeeks([detail.weekStart]),
    ]);
    swapOptions = buildSwapOptions({
      assignment: detail.assignment,
      viewerId: membership.profileId,
      people: members,
      away,
      weekAssignments: weeks[0]?.assignments ?? [],
      today,
    });
    movePeople = members.filter((member) => member.profileId !== detail.assignment.assigneeId);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/rota"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Rota
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">
          {detail ? detail.assignment.choreName : "Chore"}
        </h1>
      </header>

      {detail ? (
        <>
          <Card>
            <CardLabel>
              {STATUS_TEXT[statusOf(detail.assignment, today)]}
              {detail.current ? "" : ", replaced"}
            </CardLabel>
            <p className="mt-3 text-lg">
              {detail.assignment.assigneeName
                ? detail.assignment.assigneeId === membership.profileId
                  ? "Yours"
                  : detail.assignment.assigneeName
                : "Nobody was around"}
              , {dayLabel(detail.assignment.dueOn, today)}
            </p>
            <p className="text-muted mt-2 max-w-md">Why: {detail.assignment.explanation}</p>
            {!detail.current ? (
              <p className="text-muted mt-2 max-w-md text-sm">
                The rota was rebuilt after this was given out, so it can no longer be ticked.
              </p>
            ) : null}
          </Card>

          <Card>
            <CardLabel>Checklist</CardLabel>
            <div className="mt-4">
              <Checklist
                assignment={detail.assignment}
                canTick={
                  detail.current &&
                  (detail.assignment.assigneeId === membership.profileId ||
                    membership.role === "owner" ||
                    membership.role === "admin")
                }
                canSignOff={
                  detail.current &&
                  detail.assignment.needsSignoff &&
                  detail.assignment.completedAt !== null &&
                  detail.assignment.signedOffBy === null &&
                  detail.assignment.assigneeId !== membership.profileId
                }
              />
            </div>
          </Card>

          {open && mine ? (
            <Card>
              <CardLabel>Swap this chore</CardLabel>
              <div className="mt-4">
                <SwapSheet assignmentId={detail.assignment.id} options={swapOptions} />
              </div>
            </Card>
          ) : null}

          {open && isAdmin && movePeople.length > 0 ? (
            <Card>
              <CardLabel>Move it (admins)</CardLabel>
              <div className="mt-4">
                <ReassignForm assignmentId={detail.assignment.id} people={movePeople} />
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <NotFound />
      )}
    </div>
  );
}

export default function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <AssignmentContent params={params} />
      </RequireFlat>
    </Suspense>
  );
}
