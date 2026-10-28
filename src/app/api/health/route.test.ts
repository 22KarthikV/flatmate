import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns 200 with app status and is never cached", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.status).toBe("ok");
    expect(body.checks.app).toEqual({ status: "ok" });
    expect(typeof body.time).toBe("string");
  });
});
