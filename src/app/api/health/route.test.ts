import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns 200 when the app and the database are up, and is never cached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("true", { status: 200 })));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.status).toBe("ok");
    expect(body.checks.app).toEqual({ status: "ok" });
    expect(body.checks.database).toEqual({ status: "ok" });
    expect(typeof body.time).toBe("string");
  });

  it("returns 503 when the database is down, without leaking error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("connect ECONNREFUSED 10.0.0.5")),
    );

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text).checks.database).toEqual({ status: "down" });
    expect(JSON.parse(text).checks.app).toEqual({ status: "ok" });
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("10.0.0.5");
  });

  it("returns 503 when the Supabase settings are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).checks.database).toEqual({ status: "down" });
  });
});
