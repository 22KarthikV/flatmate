import Link from "next/link";
import { Suspense } from "react";

import { getPreferences } from "@/features/notifications/preferences";
import { PreferencesForm } from "@/features/notifications/preferences-form";
import { PushCard } from "@/features/notifications/push-card";
import { getPushDevices } from "@/features/notifications/push-devices";
import { getEnv } from "@/lib/env";

export const metadata = { title: "Notification settings | FlatMate" };

async function SettingsContent() {
  const [preferences, devices] = await Promise.all([getPreferences(), getPushDevices()]);
  return (
    <>
      <PushCard publicKey={getEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} devices={devices} />
      <PreferencesForm preferences={preferences} />
    </>
  );
}

export default function NotificationSettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link href="/more" className="label-caps text-muted min-h-11 underline underline-offset-4">
          More
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Notifications</h1>
      </header>
      <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
