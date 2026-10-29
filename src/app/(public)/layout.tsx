import Link from "next/link";
import type { ReactNode } from "react";

import { SmoothScroll } from "@/components/fx/smooth-scroll";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-8">
        <Link href="/" className="font-display text-2xl">
          FlatMate
        </Link>
        <Link
          href="/dashboard"
          className="label-caps min-h-11 content-center underline underline-offset-4"
        >
          Open app
        </Link>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-line mx-auto w-full max-w-5xl border-t px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="label-caps text-muted">FlatMate · Shared flat life, sorted</p>
          <nav aria-label="Legal" className="label-caps flex gap-6">
            <Link href="/privacy" className="min-h-11 content-center underline underline-offset-4">
              Privacy
            </Link>
            <Link href="/terms" className="min-h-11 content-center underline underline-offset-4">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
