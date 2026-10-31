import Link from "next/link";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RequireFlat } from "@/features/household/require-flat";
import { getMembership } from "@/features/household/membership";
import { PostForm } from "@/features/board/post-form";
import { PostList } from "@/features/board/post-list";
import { getPosts } from "@/features/board/posts";

export const metadata = { title: "Noticeboard | FlatMate" };

async function BoardContent() {
  const membership = await getMembership();
  if (!membership) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const posts = await getPosts();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/more"
          className="label-caps text-muted inline-flex min-h-11 items-center underline underline-offset-4"
        >
          More
        </Link>
        <h1 className="font-display text-5xl sm:text-6xl">Noticeboard</h1>
        <p className="text-muted max-w-md">
          Short notes for {membership.householdName}. They disappear by themselves unless an admin
          pins them.
        </p>
      </header>
      <Card>
        <PostForm isAdmin={isAdmin} />
      </Card>
      <PostList
        posts={posts}
        viewer={{ profileId: membership.profileId, isAdmin }}
        now={new Date().toISOString()}
      />
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <RequireFlat>
        <BoardContent />
      </RequireFlat>
    </Suspense>
  );
}
