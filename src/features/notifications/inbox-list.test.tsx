import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ openNotification: vi.fn(), markAllRead: vi.fn() }));

import { InboxList } from "./inbox-list";
import type { InboxItem } from "./inbox";

const NOW = new Date("2026-10-29T12:00:00Z");

const item = (over: Partial<InboxItem>): InboxItem => ({
  id: "n1",
  type: "member_joined",
  title: "Sam joined Flat 4",
  body: "",
  href: "/more/flat",
  createdAt: "2026-10-29T11:00:00Z",
  readAt: null,
  ...over,
});

describe("InboxList", () => {
  it("explains an empty inbox", () => {
    render(<InboxList items={[]} unread={0} now={NOW} />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark all read/i })).toBeNull();
  });

  it("groups by day and marks unread ones", () => {
    render(
      <InboxList
        items={[
          item({ id: "a" }),
          item({ id: "b", title: "Older", createdAt: "2026-10-28T10:00:00Z", readAt: "x" }),
        ]}
        unread={1}
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
    const unreadRow = screen.getByRole("button", { name: /Sam joined Flat 4/ });
    expect(within(unreadRow).getByText("Unread")).toBeInTheDocument();
    const readRow = screen.getByRole("button", { name: /Older/ });
    expect(within(readRow).queryByText("Unread")).toBeNull();
  });

  it("offers Mark all read only while something is unread", () => {
    const { rerender } = render(<InboxList items={[item({})]} unread={1} now={NOW} />);
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeInTheDocument();
    rerender(<InboxList items={[item({ readAt: "x" })]} unread={0} now={NOW} />);
    expect(screen.queryByRole("button", { name: /mark all read/i })).toBeNull();
  });
});
