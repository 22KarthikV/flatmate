import type { ReactNode } from "react";

import { BottomNav, SideNav } from "@/features/shell/nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1">
      <SideNav />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
