"use client";

import { useEffect } from "react";

import { logger } from "@/lib/logger";

/**
 * Last-resort boundary for errors in the root layout. It replaces the whole document, so it
 * cannot use the app's fonts or stylesheet and carries minimal inline styles instead.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    logger.error("ui.global_error", { error });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#faf8f5",
          color: "#111111",
          fontFamily: "Georgia, serif",
          textAlign: "center",
        }}
      >
        <main style={{ padding: "1rem", maxWidth: "28rem" }}>
          <h1 style={{ fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ color: "#6b6762" }}>Please try again.</p>
          <button
            onClick={() => retry()}
            style={{
              minHeight: 44,
              padding: "0 1.5rem",
              background: "#111111",
              color: "#faf8f5",
              border: 0,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
