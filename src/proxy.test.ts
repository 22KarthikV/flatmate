// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ updateSession: vi.fn() }));
vi.mock("@/lib/supabase/session", () => session);

import { proxy } from "./proxy";

const request = (path: string) => new NextRequest(`http://localhost${path}`);

function withSession(signedIn: boolean) {
  const response = NextResponse.next();
  response.cookies.set("sb-abcdef-auth-token", "fresh", { path: "/" });
  session.updateSession.mockResolvedValue({ response, signedIn });
  return response;
}

beforeEach(() => session.updateSession.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("proxy with the guard off (default)", () => {
  it("never redirects, even signed out on a protected page", async () => {
    const response = withSession(false);
    expect(await proxy(request("/dashboard"))).toBe(response);
  });
});

describe("proxy with AUTH_GUARD=on", () => {
  beforeEach(() => vi.stubEnv("AUTH_GUARD", "on"));

  it("sends a signed-out visitor to sign in, with next, and no caching", async () => {
    withSession(false);
    const result = await proxy(request("/rota?week=3"));

    expect(result.status).toBe(307);
    expect(new URL(result.headers.get("location")!).pathname).toBe("/sign-in");
    expect(new URL(result.headers.get("location")!).searchParams.get("next")).toBe("/rota?week=3");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps refreshed session cookies on the redirect", async () => {
    withSession(false);
    const result = await proxy(request("/dashboard"));
    expect(result.cookies.get("sb-abcdef-auth-token")?.value).toBe("fresh");
  });

  it("lets a signed-in person through", async () => {
    const response = withSession(true);
    expect(await proxy(request("/dashboard"))).toBe(response);
  });

  it("lets a visitor see public pages", async () => {
    const response = withSession(false);
    expect(await proxy(request("/privacy"))).toBe(response);
  });

  it("moves a signed-in person off the sign-in page", async () => {
    withSession(true);
    const result = await proxy(request("/sign-in?next=%2Fmoney"));
    expect(new URL(result.headers.get("location")!).pathname).toBe("/money");
  });
});
