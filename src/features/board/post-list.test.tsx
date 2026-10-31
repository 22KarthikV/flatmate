import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ deletePost: vi.fn(), setPinned: vi.fn(), postNote: vi.fn() }));

import { PostForm } from "./post-form";
import { PostList } from "./post-list";
import type { BoardPost } from "./view";

const NOW = "2026-11-03T12:00:00Z";
const post = (id: string, over: Partial<BoardPost> = {}): BoardPost => ({
  id,
  body: `Body of ${id}`,
  authorId: "p-bob",
  authorName: "Bob",
  createdAt: "2026-11-03T09:00:00Z",
  pinned: false,
  expiresAt: "2026-11-05T09:00:00Z",
  ...over,
});

describe("PostList", () => {
  it("shows an empty state", () => {
    render(<PostList posts={[]} viewer={{ profileId: "p-bob", isAdmin: false }} now={NOW} />);
    expect(screen.getByText(/Nothing on the board/)).toBeInTheDocument();
  });

  it("shows pinned posts under their own heading, with author, age and expiry", () => {
    render(
      <PostList
        posts={[post("a"), post("rule", { pinned: true, expiresAt: null })]}
        viewer={{ profileId: "p-carol", isAdmin: false }}
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { name: "Pinned and house rules" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent" })).toBeInTheDocument();
    expect(screen.getByText(/Bob, 3 hours ago · disappears Thursday/)).toBeInTheDocument();
    expect(screen.getByText(/stays up/)).toBeInTheDocument();
  });

  it("shows delete to the author and admins, and pin only to admins", () => {
    const posts = [post("a")];
    const { rerender } = render(
      <PostList posts={posts} viewer={{ profileId: "p-carol", isAdmin: false }} now={NOW} />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    rerender(<PostList posts={posts} viewer={{ profileId: "p-bob", isAdmin: false }} now={NOW} />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    rerender(<PostList posts={posts} viewer={{ profileId: "p-alice", isAdmin: true }} now={NOW} />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin" })).toBeInTheDocument();
  });
});

describe("PostForm", () => {
  it("offers the pin box to admins only, and the four expiry choices", () => {
    const { rerender } = render(<PostForm isAdmin={false} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("option", { name: "1 week" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
    rerender(<PostForm isAdmin />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });
});
