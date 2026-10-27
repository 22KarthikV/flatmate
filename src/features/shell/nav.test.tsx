import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isActive, navItems } from "./nav-items";
import { BottomNav, SideNav } from "./nav";

const pathname = vi.hoisted(() => ({ value: "/rota" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

describe("isActive", () => {
  it("matches the exact path and nested paths only", () => {
    expect(isActive("/rota", "/rota")).toBe(true);
    expect(isActive("/rota/swap", "/rota")).toBe(true);
    expect(isActive("/rotation", "/rota")).toBe(false);
  });
});

describe("navigation", () => {
  it("renders one link per module in the bottom bar", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link")).toHaveLength(navItems.length);
  });

  it("marks only the current page with aria-current", () => {
    render(<SideNav />);
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Rota");
  });

  it("gives every link a touch target of at least 44px", () => {
    render(<BottomNav />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toMatch(/min-h-14|min-h-11/);
    }
  });
});
