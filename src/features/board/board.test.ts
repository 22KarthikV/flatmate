import { describe, expect, it } from "vitest";

import { boardErrorMessage } from "./errors";
import { canDeletePost, canPin } from "./permissions";
import { parsePostFields, parsePostId } from "./schemas";
import { ageText, disappearsLabel, orderPosts, type BoardPost } from "./view";

const ID = "e0000000-0000-0000-0000-000000000001";

const post = (id: string, over: Partial<BoardPost> = {}): BoardPost => ({
  id,
  body: id,
  authorId: "p-bob",
  authorName: "Bob",
  createdAt: "2026-11-03T10:00:00Z",
  pinned: false,
  expiresAt: "2026-11-10T10:00:00Z",
  ...over,
});

describe("parsePostFields", () => {
  it("trims and reads the expiry", () => {
    expect(parsePostFields({ body: "  Hello ", days: "3", pin: false }, false)).toEqual({
      ok: true,
      value: { body: "Hello", days: 3, pin: false },
    });
  });
  it("refuses an empty or over-long post", () => {
    expect(parsePostFields({ body: " ", days: "7", pin: false }, false)).toMatchObject({
      ok: false,
    });
    expect(parsePostFields({ body: "x".repeat(281), days: "7", pin: false }, false)).toMatchObject({
      ok: false,
    });
    expect(parsePostFields({ body: "x".repeat(280), days: "7", pin: false }, false)).toMatchObject({
      ok: true,
    });
  });
  it("accepts only 1, 3, 7 or 30 days, except when pinning", () => {
    expect(parsePostFields({ body: "a", days: "2", pin: false }, false)).toMatchObject({
      ok: false,
    });
    expect(parsePostFields({ body: "a", days: "30", pin: false }, false)).toMatchObject({
      ok: true,
    });
    expect(parsePostFields({ body: "a", days: "", pin: true }, true)).toMatchObject({ ok: true });
  });
  it("only an admin can pin", () => {
    expect(parsePostFields({ body: "a", days: "7", pin: true }, false)).toMatchObject({
      ok: false,
    });
  });
});

describe("parsePostId", () => {
  it("accepts a uuid and nothing else", () => {
    expect(parsePostId(ID)).toBe(ID);
    expect(parsePostId("x")).toBeNull();
  });
});

describe("permissions", () => {
  it("the author or an admin can delete; only an admin can pin", () => {
    const p = post("a");
    expect(canDeletePost(p, { profileId: "p-bob", isAdmin: false })).toBe(true);
    expect(canDeletePost(p, { profileId: "p-carol", isAdmin: false })).toBe(false);
    expect(canDeletePost(p, { profileId: "p-carol", isAdmin: true })).toBe(true);
    expect(canPin({ profileId: "p-bob", isAdmin: false })).toBe(false);
    expect(canPin({ profileId: "p-alice", isAdmin: true })).toBe(true);
  });
});

describe("orderPosts", () => {
  it("puts pinned posts first, then the newest", () => {
    const ordered = orderPosts([
      post("old", { createdAt: "2026-11-01T10:00:00Z" }),
      post("pin", { pinned: true, expiresAt: null, createdAt: "2026-10-01T10:00:00Z" }),
      post("new", { createdAt: "2026-11-02T10:00:00Z" }),
    ]);
    expect(ordered.pinned.map((p) => p.id)).toEqual(["pin"]);
    expect(ordered.recent.map((p) => p.id)).toEqual(["new", "old"]);
  });
  it("is empty for no posts", () => {
    expect(orderPosts([])).toEqual({ pinned: [], recent: [] });
  });
});

describe("disappearsLabel", () => {
  const now = "2026-11-03T12:00:00Z";
  it("says today, a weekday within a week, or a date", () => {
    expect(disappearsLabel("2026-11-03T20:00:00Z", now)).toBe("disappears today");
    expect(disappearsLabel("2026-11-05T09:00:00Z", now)).toBe("disappears Thursday");
    expect(disappearsLabel("2026-11-20T09:00:00Z", now)).toBe("disappears 20 Nov");
    expect(disappearsLabel(null, now)).toBe("stays up");
  });
  it("uses the London day, not the UTC day", () => {
    // 23:30 UTC on 5 June is 00:30 on the 6th in London.
    expect(disappearsLabel("2026-06-05T23:30:00Z", "2026-06-05T10:00:00Z")).toBe(
      "disappears Saturday",
    );
  });
});

describe("ageText", () => {
  const now = "2026-11-03T12:00:00Z";
  it("reads naturally", () => {
    expect(ageText("2026-11-03T11:59:30Z", now)).toBe("just now");
    expect(ageText("2026-11-03T09:00:00Z", now)).toBe("3 hours ago");
    expect(ageText("2026-11-03T11:00:00Z", now)).toBe("1 hour ago");
    expect(ageText("2026-11-01T12:00:00Z", now)).toBe("2 days ago");
    expect(ageText("2026-11-02T12:00:00Z", now)).toBe("yesterday");
  });
});

describe("boardErrorMessage (board errors)", () => {
  it.each([
    ["posting_too_fast", "You’ve posted 5 notes today. Try again tomorrow."],
    ["too_many_pinned", "Three posts are already pinned. Unpin one first."],
    ["post_not_found", "We couldn’t find that post. It may have been removed."],
    ["not_allowed", "Only an owner or admin can do that."],
  ])("explains %s", (message, text) => {
    expect(boardErrorMessage({ message })).toBe(text);
  });
  it("is general otherwise", () => {
    expect(boardErrorMessage({ message: "x" })).toBe("We couldn’t save that. Please try again.");
  });
});
