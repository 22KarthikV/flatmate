import { Suspense, type ReactNode } from "react";

import { LiveFlatGate } from "@/features/household/live-flat-gate";
import { NotificationBell } from "@/features/notifications/bell";
import { BellLink } from "@/features/notifications/bell-link";
import { RequireSession } from "@/features/identity/require-session";
import { InstallPrompt } from "@/features/pwa/install-prompt";
import { BottomNav, SideNav } from "@/features/shell/nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1">
      <SideNav />
      <main className="flex-1 pb-20 md:pb-0">
        <div className="flex justify-end px-4 pt-2 sm:px-8">
          <Suspense fallback={<BellLink />}>
            <NotificationBell />
          </Suspense>
        </div>
        <InstallPrompt />
        <Suspense fallback={null}>
          <RequireSession>{children}</RequireSession>
          <LiveFlatGate />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}
