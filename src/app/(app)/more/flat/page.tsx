import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getMembership } from "@/features/household/membership";
import { InviteCard } from "@/features/household/invite-card";
import { getLiveInviteExpiry } from "@/features/household/live-invite";

export const metadata = { title: "Your flat | FlatMate" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

async function FlatContent() {
  const membership = await getMembership();
  if (!membership) {
    return (
      <Card>
        <CardLabel>No flat yet</CardLabel>
        <p className="mt-3 text-lg">Create your flat, or join one with an invite link.</p>
        <Link
          href="/dashboard"
          className="label-caps mt-4 inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Go to Home
        </Link>
      </Card>
    );
  }

  const canInvite = membership.role === "owner" || membership.role === "admin";
  const activeUntil = canInvite ? await getLiveInviteExpiry() : null;

  return (
    <>
      <Card>
        <CardLabel>Your flat</CardLabel>
        <h2 className="font-display mt-3 text-3xl">{membership.householdName}</h2>
        <p className="text-muted mt-2 text-sm">You are {ROLE_LABEL[membership.role]}.</p>
      </Card>
      {canInvite ? <InviteCard activeUntil={activeUntil} /> : null}
    </>
  );
}

export default function FlatPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Together</p>
        <h1 className="font-display text-5xl sm:text-6xl">Your flat</h1>
      </header>
      <Suspense fallback={<div aria-hidden className="border-line min-h-40 border" />}>
        <FlatContent />
      </Suspense>
    </div>
  );
}
