import { expect, test } from "@playwright/test";

test.describe("/api/health", () => {
  // Same server for every project, so run once.
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop-chrome", "browser independent");
  });

  test("reports healthy and is never cached", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.checks.app).toEqual({ status: "ok" });
    expect(body.checks.database).toEqual({ status: "ok" });
  });

  test("is evaluated on every request", async ({ request }) => {
    const first = (await (await request.get("/api/health")).json()).time;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = (await (await request.get("/api/health")).json()).time;

    expect(second).not.toBe(first);
  });

  test("does not leak internals", async ({ request }) => {
    const text = await (await request.get("/api/health")).text();
    expect(text).not.toMatch(/stack|password|secret|token/i);
  });
});
