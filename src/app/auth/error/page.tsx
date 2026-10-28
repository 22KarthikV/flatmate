import Link from "next/link";

export const metadata = {
  title: "Sign-in problem | FlatMate",
  robots: { index: false, follow: false },
};

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 text-center">
      <p className="label-caps text-muted">Sign in</p>
      <h1 className="font-display text-5xl">That didn&rsquo;t work</h1>
      <p className="text-muted">
        We couldn&rsquo;t sign you in. Nothing has been changed. Please try again.
      </p>
      <div className="pt-2">
        <Link
          href="/sign-in"
          className="label-caps bg-ink text-paper inline-flex min-h-11 items-center px-6"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
