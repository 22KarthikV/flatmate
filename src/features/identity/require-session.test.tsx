// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./session-claims", () => ({ getRequestSession: mocks.getSession }));

import { RequireSession } from "./require-session";

beforeEach(() => mocks.getSession.mockReset());

describe("RequireSession", () => {
  it("renders the page for a verified session", async () => {
    mocks.getSession.mockResolvedValue({ claims: { sub: "user-1" } });
    const element = await RequireSession({ children: <p>Secret chores</p> });
    expect(renderToStaticMarkup(element)).toBe("<p>Secret chores</p>");
  });

  it.each([
    ["no claims", { claims: null }],
    ["empty claims", { claims: {} }],
  ])("sends the visitor to sign in, showing nothing, with %s", async (_label, result) => {
    mocks.getSession.mockResolvedValue(result);
    await expect(RequireSession({ children: <p>Secret chores</p> })).rejects.toThrow(
      "REDIRECT:/sign-in",
    );
  });
});
