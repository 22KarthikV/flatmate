import type { ReactNode } from "react";

import { InstallPrompt } from "@/features/pwa/install-prompt";
import { BottomNav, SideNav } from "@/features/shell/nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1">
      <SideNav />
      <main className="flex-1 pb-20 md:pb-0">
        <InstallPrompt />
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
