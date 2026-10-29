import Link from "next/link";
import { Suspense } from "react";

import { GoogleButton } from "@/features/identity/google-button";
import { safeNextPath } from "@/features/identity/safe-redirect";

export const metadata = {
  title: "Sign in | FlatMate",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function SignInAction({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = params.next;
  return (
    <div className="flex flex-col gap-4">
      {params.deleted === "1" ? (
        <p role="status" className="border-line border p-4 text-sm">
          Your account has been deleted. Thank you for using FlatMate.
        </p>
      ) : null}
      <GoogleButton next={safeNextPath(typeof raw === "string" ? raw : undefined)} />
    </div>
  );
}

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-10 pb-24 sm:px-8 sm:pt-24">
      <p className="label-caps animate-page-in text-muted">Welcome</p>
      <h1 className="animate-page-in font-display text-5xl leading-[0.95] sm:text-7xl">
        Sign in to FlatMate
      </h1>
      <p className="animate-page-in text-muted max-w-md text-lg">
        One tap with your Google account. We never see or store a password.
      </p>

      <div className="animate-page-in max-w-sm pt-2">
        <Suspense
          fallback={<div aria-hidden className="border-line min-h-12 w-full border sm:w-64" />}
        >
          <SignInAction searchParams={searchParams} />
        </Suspense>
      </div>

      <p className="text-muted max-w-md text-sm">
        By continuing you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-4">
          terms
        </Link>{" "}
        and have read the{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy notice
        </Link>
        .
      </p>
    </main>
  );
}
