import Link from "next/link";

export const metadata = { title: "Offline | FlatMate", robots: { index: false } };

/** Served by the service worker when the network is unavailable. Must stay static. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 text-center">
      <p className="label-caps text-muted">No connection</p>
      <h1 className="font-display text-5xl">You are offline</h1>
      <p className="text-muted">
        FlatMate needs a connection to load your flat. Check your signal and try again.
      </p>
      <div className="pt-2">
        <Link
          href="/dashboard"
          className="label-caps bg-ink text-paper inline-flex min-h-11 items-center px-6"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
