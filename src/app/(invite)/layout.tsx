import { Suspense, type ReactNode } from "react";

import { RequireSession } from "@/features/identity/require-session";

/**
 * A focused screen for people following an invite: no tab bar, because the page depends on the
 * link in the address. It still needs a verified session, like everything inside the app.
 */
export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <main className="animate-page-in flex-1">
      <Suspense fallback={null}>
        <RequireSession>{children}</RequireSession>
      </Suspense>
    </main>
  );
}
