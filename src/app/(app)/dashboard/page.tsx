import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { CreateFlatForm } from "@/features/household/create-flat-form";
import { getMembers } from "@/features/household/members";
import { getMembership } from "@/features/household/membership";
import { SetupChecklist } from "@/features/household/setup-checklist";
import { buildChecklist } from "@/features/household/setup-steps";
import { WaitingOnYou } from "@/features/home/waiting-on-you";
import { OpenInviteForm } from "@/features/household/open-invite-form";

export const metadata = { title: "Home | FlatMate" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

async function HomeContent() {
  const membership = await getMembership();

  if (!membership) {
    return (
      <>
        <Card>
          <CardLabel>Start here</CardLabel>
          <h2 className="font-display mt-3 text-3xl">Create your flat</h2>
          <p className="text-muted mt-2 max-w-md text-sm">
            You&rsquo;ll be its owner. Next you can invite your flatmates with a link.
          </p>
          <div className="mt-6">
            <CreateFlatForm />
          </div>
        </Card>
        <Card>
          <CardLabel>Got an invite?</CardLabel>
          <p className="mt-3 max-w-md text-sm">
            Open the link your flatmate sent you, or paste it below.
          </p>
          <div className="mt-4">
            <OpenInviteForm />
          </div>
        </Card>
      </>
    );
  }

  const members = await getMembers();
  const checklist = buildChecklist(membership.role, { memberCount: members.length });
  const alone = members.length < 2;

  return (
    <>
      <p className="text-muted -mt-4 text-sm">
        {membership.householdName} &middot; You are {ROLE_LABEL[membership.role]}.
      </p>
      <SetupChecklist checklist={checklist} />
      {alone ? (
        <Card>
          <CardLabel>Get started</CardLabel>
          <h2 className="font-display mt-3 text-3xl">Invite your flatmates to get started</h2>
          <p className="text-muted mt-2 max-w-md text-sm">
            Chores, rent and bills show up here once there is more than one of you.
          </p>
          <Link
            href="/more/flat"
            className="label-caps bg-ink text-paper mt-4 inline-flex min-h-11 items-center px-6 hover:opacity-85"
          >
            Invite flatmates
          </Link>
        </Card>
      ) : (
        <WaitingOnYou />
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Today</p>
        <h1 className="font-display text-5xl sm:text-6xl">Home</h1>
        <p className="text-muted max-w-md">
          Your chores, what you owe and what&rsquo;s coming up, in one place.
        </p>
      </header>
      <Suspense fallback={<div aria-hidden className="border-line min-h-40 border" />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}
