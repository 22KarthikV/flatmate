// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));

import { RequireSession } from "./require-session";

beforeEach(() => mocks.getClaims.mockReset());

describe("RequireSession", () => {
  it("renders the page for a verified session", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    const element = await RequireSession({ children: <p>Secret chores</p> });
    expect(renderToStaticMarkup(element)).toBe("<p>Secret chores</p>");
  });

  it.each([
    ["no claims", { data: null }],
    ["empty claims", { data: { claims: {} } }],
    ["an error", { data: null, error: new Error("down") }],
  ])("sends the visitor to sign in, showing nothing, with %s", async (_label, result) => {
    mocks.getClaims.mockResolvedValue(result);
    await expect(RequireSession({ children: <p>Secret chores</p> })).rejects.toThrow(
      "REDIRECT:/sign-in",
    );
  });
});
