import { deletePost, setPinned } from "./actions";
import { canDeletePost, canPin, type Viewer } from "./permissions";
import { ageText, disappearsLabel, orderPosts, type BoardPost } from "./view";

const linkButton =
  "label-caps text-muted focus-visible:outline-ink inline-flex min-h-11 items-center px-2 underline underline-offset-4 focus-visible:outline-2";

function PostRow({ post, viewer, now }: { post: BoardPost; viewer: Viewer; now: string }) {
  return (
    <li className="border-line border-b py-4">
      <p className="break-words whitespace-pre-line">{post.body}</p>
      <p className="text-muted mt-1 text-sm">
        {post.authorName}, {ageText(post.createdAt, now)} &middot;{" "}
        {disappearsLabel(post.expiresAt, now)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {canPin(viewer) ? (
          <form action={setPinned}>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="pinned" value={post.pinned ? "false" : "true"} />
            <button type="submit" className={linkButton}>
              {post.pinned ? "Unpin" : "Pin"}
            </button>
          </form>
        ) : null}
        {canDeletePost(post, viewer) ? (
          <form action={deletePost}>
            <input type="hidden" name="postId" value={post.id} />
            <button type="submit" className={linkButton}>
              Delete
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

/** Pinned posts and house rules on top, then recent posts. Delete and pin are plain forms. */
export function PostList({
  posts,
  viewer,
  now,
}: {
  posts: BoardPost[];
  viewer: Viewer;
  now: string;
}) {
  const { pinned, recent } = orderPosts(posts);
  if (posts.length === 0) {
    return <p className="text-muted">Nothing on the board. Post the first note above.</p>;
  }
  return (
    <div className="flex flex-col gap-8">
      {pinned.length > 0 ? (
        <section aria-labelledby="pinned">
          <h2 id="pinned" className="label-caps text-muted">
            Pinned and house rules
          </h2>
          <ul>
            {pinned.map((post) => (
              <PostRow key={post.id} post={post} viewer={viewer} now={now} />
            ))}
          </ul>
        </section>
      ) : null}
      {recent.length > 0 ? (
        <section aria-labelledby="recent">
          <h2 id="recent" className="label-caps text-muted">
            Recent
          </h2>
          <ul>
            {recent.map((post) => (
              <PostRow key={post.id} post={post} viewer={viewer} now={now} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
