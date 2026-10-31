import { describe, expect, it } from "vitest";

import { recentItems } from "./recent";

const n = (id: number, readAt: string | null = null) => ({
  id: String(id),
  title: `T${id}`,
  href: "/x",
  createdAt: `2026-11-0${id}T10:00:00Z`,
  readAt,
});

describe("recentItems", () => {
  it("returns the newest five, marking unread", () => {
    const items = recentItems([n(1), n(2), n(3), n(4, "r"), n(5), n(6), n(7)]);
    expect(items.map((i) => i.id)).toEqual(["7", "6", "5", "4", "3"]);
    expect(items.find((i) => i.id === "4")?.unread).toBe(false);
  });

  it("is empty for an empty inbox", () => {
    expect(recentItems([])).toEqual([]);
  });
});
