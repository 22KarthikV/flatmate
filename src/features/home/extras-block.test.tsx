// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/bins/summary", () => ({ getNextBinDays: vi.fn() }));
vi.mock("@/features/board/summary", () => ({ getPinnedPost: vi.fn() }));
vi.mock("@/features/events/events", () => ({ getEvents: vi.fn() }));
vi.mock("@/features/fixes/summary", () => ({ getFixSummary: vi.fn() }));
vi.mock("@/features/household/membership", () => ({ getMembership: vi.fn() }));
vi.mock("@/features/shopping/items", () => ({ getShoppingItems: vi.fn() }));

import { LinesCard } from "./extras-block";

describe("LinesCard", () => {
  it("renders nothing when there are no lines", () => {
    expect(renderToStaticMarkup(<LinesCard id="x" label="Events" lines={[]} />)).toBe("");
  });

  it("renders each line as one link under the label", () => {
    const html = renderToStaticMarkup(
      <LinesCard
        id="home-extras"
        label="Around the flat"
        lines={[
          { key: "a", text: "4 things on the shopping list", href: "/more/shopping" },
          { key: "b", text: "Tonight: Grey bin out", href: "/more/bins" },
        ]}
      />,
    );
    expect(html).toContain("Around the flat");
    expect(html).toContain('href="/more/shopping"');
    expect(html).toContain("4 things on the shopping list");
    expect(html).toContain('href="/more/bins"');
  });
});
