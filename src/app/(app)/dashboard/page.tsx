import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { CreateFlatForm } from "@/features/household/create-flat-form";
import { getMembership } from "@/features/household/membership";

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
            Open the link your flatmate sent you. You&rsquo;ll sign in with Google and can join from
            there.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <Card>
        <CardLabel>Your flat</CardLabel>
        <h2 className="font-display mt-3 text-3xl">{membership.householdName}</h2>
        <p className="text-muted mt-2 text-sm">You are {ROLE_LABEL[membership.role]}.</p>
      </Card>
      <Card>
        <CardLabel>Coming soon</CardLabel>
        <p className="mt-3 text-lg">
          Your chores, what you owe and what&rsquo;s coming up will appear here as each part of
          FlatMate arrives.
        </p>
      </Card>
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
