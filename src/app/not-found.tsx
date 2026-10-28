import Link from "next/link";

export const metadata = { title: "Not found | FlatMate" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 text-center">
      <p className="label-caps text-muted">404</p>
      <h1 className="font-display text-5xl">Page not found</h1>
      <p className="text-muted">That page doesn&rsquo;t exist, or it has moved.</p>
      <div className="pt-2">
        <Link
          href="/dashboard"
          className="label-caps bg-ink text-paper inline-flex min-h-11 items-center px-6"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
