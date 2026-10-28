// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  options: undefined as undefined | { cookies: Record<string, (...args: never[]) => unknown> },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => {
    supabase.createServerClient(...args);
    supabase.options = args[2] as typeof supabase.options;
    return { auth: { getClaims: supabase.getClaims } };
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { hasAuthCookie, updateSession } from "./session";

const requestWith = (cookie?: string) =>
  new NextRequest("http://localhost/dashboard", cookie ? { headers: { cookie } } : undefined);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  supabase.createServerClient.mockClear();
  supabase.getClaims.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("hasAuthCookie", () => {
  it("recognises Supabase auth cookies, including chunked ones", () => {
    expect(hasAuthCookie([{ name: "sb-abcdef-auth-token" }])).toBe(true);
    expect(hasAuthCookie([{ name: "sb-abcdef-auth-token.0" }])).toBe(true);
  });

  it("ignores everything else", () => {
    expect(hasAuthCookie([])).toBe(false);
    expect(hasAuthCookie([{ name: "theme" }, { name: "sb-abcdef-auth-token-code-verifier" }])).toBe(
      false,
    );
  });
});

describe("updateSession", () => {
  it("does nothing for anonymous visitors: no client, no network", async () => {
    const response = await updateSession(requestWith());

    expect(response.status).toBe(200);
    expect(supabase.createServerClient).not.toHaveBeenCalled();
    expect(supabase.getClaims).not.toHaveBeenCalled();
  });

  it("refreshes the session for signed-in visitors", async () => {
    await updateSession(requestWith("sb-abcdef-auth-token=old"));

    expect(supabase.createServerClient).toHaveBeenCalledOnce();
    expect(supabase.getClaims).toHaveBeenCalledOnce();
  });

  it("writes refreshed cookies and no-store headers onto the response", async () => {
    supabase.getClaims.mockImplementation(async () => {
      (supabase.options!.cookies.setAll as (...a: unknown[]) => void)(
        [{ name: "sb-abcdef-auth-token", value: "fresh", options: { path: "/" } }],
        { "Cache-Control": "private, no-store" },
      );
      return { data: null, error: null };
    });

    const response = await updateSession(requestWith("sb-abcdef-auth-token=old"));

    expect(response.cookies.get("sb-abcdef-auth-token")?.value).toBe("fresh");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not take the site down when Supabase is unreachable", async () => {
    supabase.getClaims.mockRejectedValue(new Error("network down"));

    const response = await updateSession(requestWith("sb-abcdef-auth-token=old"));

    expect(response.status).toBe(200);
  });
});
