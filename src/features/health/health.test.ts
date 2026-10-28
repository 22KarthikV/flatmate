import { describe, expect, it } from "vitest";

import { runHealthChecks } from "./health";

describe("runHealthChecks", () => {
  it("is ok when every check passes", async () => {
    const result = await runHealthChecks({ app: async () => {}, db: async () => {} });
    expect(result.status).toBe("ok");
    expect(result.httpStatus).toBe(200);
    expect(result.checks).toEqual({ app: { status: "ok" }, db: { status: "ok" } });
  });

  it("is unhealthy with 503 when any check throws, and reports which one", async () => {
    const result = await runHealthChecks({
      app: async () => {},
      db: async () => {
        throw new Error("connection refused");
      },
    });
    expect(result.status).toBe("unhealthy");
    expect(result.httpStatus).toBe(503);
    expect(result.checks.app).toEqual({ status: "ok" });
    expect(result.checks.db).toEqual({ status: "down" });
  });

  it("does not leak error details into the public response", async () => {
    const result = await runHealthChecks({
      db: async () => {
        throw new Error("password=hunter2 host=db.internal");
      },
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("treats a check that never settles as down", async () => {
    const result = await runHealthChecks(
      { slow: () => new Promise<void>(() => {}) },
      { timeoutMs: 20 },
    );
    expect(result.checks.slow).toEqual({ status: "down" });
    expect(result.httpStatus).toBe(503);
  });
});
