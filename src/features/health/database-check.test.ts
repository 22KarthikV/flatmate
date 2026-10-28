import { describe, expect, it, vi } from "vitest";

import { createDatabaseCheck } from "./database-check";

const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_abc" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("createDatabaseCheck", () => {
  it("calls health_ping with only the publishable key and resolves when it returns true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(true));
    await expect(createDatabaseCheck(config, fetchMock)()).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:54321/rest/v1/rpc/health_ping");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("sb_publishable_abc");
    expect(init.cache).toBe("no-store");
  });

  it("rejects when the API answers with an error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "boom" }, 500));
    await expect(createDatabaseCheck(config, fetchMock)()).rejects.toThrow(/500/);
  });

  it("rejects when the function does not return true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(false));
    await expect(createDatabaseCheck(config, fetchMock)()).rejects.toThrow(/unexpected/i);
  });

  it("rejects when the database is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createDatabaseCheck(config, fetchMock)()).rejects.toThrow("fetch failed");
  });
});
