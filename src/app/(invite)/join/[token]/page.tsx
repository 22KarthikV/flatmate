import Link from "next/link";
import { Suspense } from "react";

import { Card, CardLabel } from "@/components/ui/card";
import { getRequestSession } from "@/features/identity/session-claims";
import { isInviteToken } from "@/features/household/invite-link";
import { JoinForm } from "@/features/household/join-form";
import { getMembership } from "@/features/household/membership";

export const metadata = {
  title: "Join a flat | FlatMate",
  // The link is a secret: keep it out of search results and out of Referer headers.
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

function Neutral() {
  return (
    <Card>
      <CardLabel>Invite</CardLabel>
      <p className="mt-3 text-lg">This invite link isn&rsquo;t valid any more.</p>
      <p className="text-muted mt-2 max-w-md text-sm">
        It may have expired or been switched off. Ask your flatmate for a new one.
      </p>
      <Link
        href="/dashboard"
        className="label-caps mt-4 inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Go to Home
      </Link>
    </Card>
  );
}

async function JoinContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return <Neutral />;

  // Opening the link only looks. Nobody joins until they press the button.
  const { supabase } = await getRequestSession();
  const { data } = await supabase.rpc("preview_invite", { p_token: token });
  const preview = data?.[0];
  if (!preview) return <Neutral />;

  const membership = await getMembership();
  if (membership) {
    return (
      <Card>
        <CardLabel>Invite</CardLabel>
        <p className="mt-3 text-lg">You are already in {membership.householdName}.</p>
        <p className="text-muted mt-2 max-w-md text-sm">
          You can be in one flat at a time. Leave it first if you want to join{" "}
          {preview.household_name}.
        </p>
        <Link
          href="/more/flat"
          className="label-caps mt-4 inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Go to your flat
        </Link>
      </Card>
    );
  }

  const others = preview.member_count - 1;
  return (
    <Card>
      <CardLabel>You&rsquo;re invited</CardLabel>
      <h2 className="font-display mt-3 text-3xl">{preview.household_name}</h2>
      <p className="text-muted mt-2 text-sm">
        {preview.inviter_name} invited you
        {others > 0 ? `, and ${others} other${others === 1 ? " is" : "s are"} already in.` : "."}
      </p>
      <div className="mt-6">
        <JoinForm token={token} />
      </div>
    </Card>
  );
}

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">Invitation</p>
        <h1 className="font-display text-5xl sm:text-6xl">Join a flat</h1>
      </header>
      <Suspense fallback={<div aria-hidden className="border-line min-h-40 border" />}>
        <JoinContent params={params} />
      </Suspense>
    </div>
  );
}
