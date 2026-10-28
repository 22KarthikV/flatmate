"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

function digestOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const { digest } = error as { digest: unknown };
    return typeof digest === "string" ? digest : undefined;
  }
  return undefined;
}

/** Catches errors in any page or nested layout. The raw message is never shown to users. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    logger.error("ui.unhandled_error", { error, digest: digestOf(error) });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 text-center">
      <p className="label-caps text-muted">Error</p>
      <h1 className="font-display text-5xl">Something went wrong</h1>
      <p className="text-muted">
        That was our fault, not yours. Try again, and if it keeps happening, let your flat admin
        know.
      </p>
      <div className="flex justify-center pt-2">
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </main>
  );
}
