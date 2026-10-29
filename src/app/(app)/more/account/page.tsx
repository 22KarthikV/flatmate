import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { signOut, signOutEverywhere } from "@/features/identity/actions";
import { getCurrentProfile } from "@/features/identity/current-profile";
import { RenameForm } from "@/features/identity/rename-form";

export const metadata = { title: "Account | FlatMate" };

async function AccountContent() {
  const me = await getCurrentProfile();
  if (!me) redirect("/sign-in?next=%2Fmore%2Faccount");

  return (
    <>
      <Card className="flex items-center gap-4">
        <Avatar
          name={me.displayName}
          tone={1}
          src={me.avatarUrl ?? undefined}
          className="size-14"
        />
        <div className="min-w-0">
          <p className="truncate text-lg">{me.displayName}</p>
          {me.email ? <p className="text-muted truncate text-sm">{me.email}</p> : null}
        </div>
      </Card>

      <Card>
        <CardLabel>Profile</CardLabel>
        <div className="mt-4">
          <RenameForm currentName={me.displayName} />
        </div>
      </Card>

      <Card>
        <CardLabel>Sign out</CardLabel>
        <p className="text-muted mt-3 max-w-md text-sm">
          Lost a phone? Signing out everywhere ends every session. Other devices are signed out as
          soon as their session next refreshes, which is within the hour.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <form action={signOut}>
            <Button type="submit" variant="secondary" className="w-full sm:w-auto">
              Sign out
            </Button>
          </form>
          <form action={signOutEverywhere}>
            <Button type="submit" variant="ghost" className="w-full sm:w-auto">
              Sign out everywhere
            </Button>
          </form>
        </div>
      </Card>
    </>
  );
}

export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="label-caps text-muted">You</p>
        <h1 className="font-display text-5xl sm:text-6xl">Account</h1>
      </header>
      <Suspense fallback={<div aria-hidden className="border-line min-h-40 border" />}>
        <AccountContent />
      </Suspense>
    </div>
  );
}
