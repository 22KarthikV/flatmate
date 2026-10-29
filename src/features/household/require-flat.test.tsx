// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMembership: vi.fn() }));
vi.mock("./membership", () => ({ getMembership: mocks.getMembership }));

import { RequireFlat } from "./require-flat";

beforeEach(() => mocks.getMembership.mockReset());

describe("RequireFlat", () => {
  it("shows the page to a member", async () => {
    mocks.getMembership.mockResolvedValue({
      householdId: "h",
      householdName: "F",
      role: "member",
    });
    const element = await RequireFlat({ children: <p>The rota</p> });
    expect(renderToStaticMarkup(element)).toBe("<p>The rota</p>");
  });

  it("shows the set-up screen, not the page, to someone with no flat", async () => {
    mocks.getMembership.mockResolvedValue(null);
    const html = renderToStaticMarkup(await RequireFlat({ children: <p>The rota</p> }));
    expect(html).not.toContain("The rota");
    expect(html).toContain("Set up your flat first");
    expect(html).toContain('href="/dashboard"');
  });
});
