// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { handleAuthCallback } from "./callback";

const call = (query: string, exchange = vi.fn().mockResolvedValue({ error: null })) =>
  handleAuthCallback(new Request(`https://flatmate.test/auth/callback${query}`), {
    exchangeCodeForSession: exchange,
  }).then((response) => ({ response, exchange }));

const location = (response: Response) => new URL(response.headers.get("location")!);

describe("handleAuthCallback", () => {
  it("signs the person in and sends them on to their destination", async () => {
    const { response, exchange } = await call("?code=abc&next=%2Frota");

    expect(exchange).toHaveBeenCalledWith("abc");
    expect(response.status).toBe(307);
    expect(location(response).origin).toBe("https://flatmate.test");
    expect(location(response).pathname).toBe("/rota");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("defaults to the dashboard when no destination was given", async () => {
    const { response } = await call("?code=abc");
    expect(location(response).pathname).toBe("/dashboard");
  });

  it.each(["//evil.com", "https://evil.com", "/%2F%2Fevil.com", "/sign-in"])(
    "ignores the unsafe destination %s",
    async (next) => {
      const { response } = await call(`?code=abc&next=${encodeURIComponent(next)}`);
      expect(location(response).origin).toBe("https://flatmate.test");
      expect(location(response).pathname).toBe("/dashboard");
    },
  );

  it("goes to the error page when there is no code, without calling Supabase", async () => {
    const { response, exchange } = await call("");
    expect(location(response).pathname).toBe("/auth/error");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("goes to the error page when the provider reports a problem", async () => {
    const { response, exchange } = await call(
      "?error=access_denied&error_description=nope&code=abc",
    );
    expect(location(response).pathname).toBe("/auth/error");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("goes to the error page when the code cannot be exchanged, leaking nothing", async () => {
    const exchange = vi.fn().mockResolvedValue({ error: new Error("pkce verifier missing") });
    const { response } = await call("?code=abc", exchange);

    expect(location(response).pathname).toBe("/auth/error");
    expect(location(response).search).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("goes to the error page when Supabase throws", async () => {
    const exchange = vi.fn().mockRejectedValue(new Error("network down"));
    const { response } = await call("?code=abc", exchange);
    expect(location(response).pathname).toBe("/auth/error");
  });
});
