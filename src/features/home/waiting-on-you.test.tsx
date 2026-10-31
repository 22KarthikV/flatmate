// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/household/membership", () => ({ getMembership: vi.fn() }));
vi.mock("@/features/ledger/settlements", () => ({ getPendingSettlements: vi.fn() }));
vi.mock("@/features/recurring/months", () => ({ getBillMonths: vi.fn() }));
vi.mock("@/features/rota/availability", () => ({ getWeekAvailability: vi.fn() }));
vi.mock("@/features/rota/swaps", () => ({ getPendingSwaps: vi.fn() }));

import { WaitingList } from "./waiting-on-you";

describe("WaitingList", () => {
  it("says nothing needs you when the list is empty", () => {
    expect(renderToStaticMarkup(<WaitingList waiting={{ items: [], more: 0 }} />)).toContain(
      "Nothing needs you right now.",
    );
  });

  it("makes each line one link and links the overflow to notifications", () => {
    const html = renderToStaticMarkup(
      <WaitingList
        waiting={{
          items: [{ key: "a", text: "Sam says they paid you. Please confirm", href: "/money" }],
          more: 2,
        }}
      />,
    );
    expect(html).toContain('<a class="');
    expect(html).toContain('href="/money"');
    expect(html).toContain("and 2 more");
    expect(html).toContain('href="/notifications"');
  });
});
