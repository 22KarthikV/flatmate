// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/household/membership", () => ({ getMembership: vi.fn() }));
vi.mock("@/features/household/live-invite", () => ({ getLiveInviteExpiry: vi.fn() }));
vi.mock("@/features/rota/chores", () => ({ getChores: vi.fn() }));
vi.mock("@/features/rota/weeks", () => ({ getWeeks: vi.fn() }));
vi.mock("@/features/recurring/rent", () => ({ getMyRent: vi.fn() }));
vi.mock("@/features/ledger/balances", () => ({ getBalancesView: vi.fn() }));
vi.mock("@/features/recurring/months", () => ({ getBillMonths: vi.fn() }));
vi.mock("@/features/notifications/inbox", () => ({ getInbox: vi.fn() }));

import { AdminList } from "./admin-extras-block";
import { ComingUpList } from "./coming-up-block";
import { ChoresList } from "./my-chores";
import { MoneyLine } from "./money-summary";
import { RecentList } from "./recent-block";
import { RentCard } from "./my-rent";

describe("home blocks", () => {
  it("chores: rota not ready, none, and a row that is one link", () => {
    expect(renderToStaticMarkup(<ChoresList chores={{ kind: "not_ready" }} />)).toContain(
      "ready yet",
    );
    expect(
      renderToStaticMarkup(<ChoresList chores={{ kind: "ready", rows: [], doneCount: 0 }} />),
    ).toContain("No chores for you this week.");
    const html = renderToStaticMarkup(
      <ChoresList
        chores={{
          kind: "ready",
          doneCount: 2,
          rows: [
            {
              id: "a",
              name: "Bins",
              day: "Today",
              status: "today",
              statusText: "Due today",
              progress: "2 of 5 steps",
              href: "/rota/assignments/a",
            },
          ],
        }}
      />,
    );
    expect(html).toContain('href="/rota/assignments/a"');
    expect(html).toContain("Due today");
    expect(html).toContain("2 of 5 steps");
    expect(html).toContain("2 done");
  });

  it("chores: admins are pointed at the chore manager, members see nothing", () => {
    const html = renderToStaticMarkup(<ChoresList chores={{ kind: "add_chores" }} />);
    expect(html).toContain("Add your chores");
    expect(html).toContain('href="/rota/chores"');
    expect(renderToStaticMarkup(<ChoresList chores={{ kind: "hidden" }} />)).toBe("");
  });

  it("admin section is hidden when empty", () => {
    expect(renderToStaticMarkup(<AdminList items={[]} />)).toBe("");
  });

  it("rent: shows the viewer's own amount and status as words", () => {
    const html = renderToStaticMarkup(
      <RentCard
        rent={{
          amount: "£450.00",
          dueOn: "1 Nov",
          payTo: "Riyon",
          statusText: "Waiting to be confirmed",
          paid: false,
        }}
      />,
    );
    expect(html).toContain("£450.00 due 1 Nov");
    expect(html).toContain("Waiting to be confirmed");
  });

  it("money: one link to Money naming the people", () => {
    const html = renderToStaticMarkup(
      <MoneyLine line={{ text: "You owe £12.40 in total", people: ["Sam"] }} />,
    );
    expect(html).toContain('href="/money"');
    expect(html).toContain("With Sam");
  });

  it("coming up and recent are hidden when empty", () => {
    expect(renderToStaticMarkup(<ComingUpList items={[]} />)).toBe("");
    expect(renderToStaticMarkup(<RecentList items={[]} />)).toBe("");
  });

  it("recent: marks unread with a word and links to the inbox", () => {
    const html = renderToStaticMarkup(
      <RecentList items={[{ id: "1", title: "Sam paid", href: "/money", unread: true }]} />,
    );
    expect(html).toContain("New");
    expect(html).toContain('href="/notifications"');
  });
});
