import { describe, expect, it } from "vitest";

import { createLogger, type LogRecord } from "./logger";

function capture(level: Parameters<typeof createLogger>[0]["level"] = "debug") {
  const records: LogRecord[] = [];
  const logger = createLogger({
    level,
    now: () => new Date("2026-10-28T10:00:00.000Z"),
    sink: (record) => records.push(record),
  });
  return { logger, records };
}

describe("logger", () => {
  it("emits structured records with level, time, message and fields", () => {
    const { logger, records } = capture();
    logger.info("rota.generated", { householdId: "h1", week: "2026-11-01" });

    expect(records).toEqual([
      {
        level: "info",
        time: "2026-10-28T10:00:00.000Z",
        message: "rota.generated",
        householdId: "h1",
        week: "2026-11-01",
      },
    ]);
  });

  it("drops records below the configured level", () => {
    const { logger, records } = capture("warn");
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(records.map((r) => r.message)).toEqual(["c", "d"]);
  });

  it("redacts secrets at any depth, case-insensitively", () => {
    const { logger, records } = capture();
    logger.info("login", {
      user: "sam",
      password: "hunter2",
      nested: { Authorization: "Bearer abc", apiKey: "k", ok: 1 },
      list: [{ access_token: "t" }],
    });

    const record = records[0]!;
    expect(record.user).toBe("sam");
    expect(record.password).toBe("[redacted]");
    expect(record.nested).toEqual({ Authorization: "[redacted]", apiKey: "[redacted]", ok: 1 });
    expect(record.list).toEqual([{ access_token: "[redacted]" }]);
    expect(JSON.stringify(record)).not.toContain("hunter2");
  });

  it("serialises Error objects instead of emitting {}", () => {
    const { logger, records } = capture();
    logger.error("boom", { error: new TypeError("bad input") });

    const error = records[0]!.error as { name: string; message: string; stack?: string };
    expect(error.name).toBe("TypeError");
    expect(error.message).toBe("bad input");
    expect(error.stack).toContain("TypeError");
  });

  it("survives circular references", () => {
    const { logger, records } = capture();
    const loop: Record<string, unknown> = { name: "loop" };
    loop.self = loop;

    expect(() => logger.info("cycle", { loop })).not.toThrow();
    expect(JSON.stringify(records[0])).toContain("[circular]");
  });

  it("child loggers add context to every record", () => {
    const { logger, records } = capture();
    logger.child({ module: "ledger" }).info("expense.added", { pence: 420 });

    expect(records[0]).toMatchObject({ module: "ledger", pence: 420, message: "expense.added" });
  });

  it("lets call-site fields override child context", () => {
    const { logger, records } = capture();
    logger.child({ module: "ledger" }).info("x", { module: "override" });
    expect(records[0]!.module).toBe("override");
  });
});
