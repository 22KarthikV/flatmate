// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { handleHeartbeat, hourBucket, type HeartbeatDeps } from "./handler";

function request(init: { secret?: string; body?: unknown; method?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.secret !== undefined) headers["x-scheduler-secret"] = init.secret;
  return new Request("http://localhost/functions/v1/heartbeat", {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
  });
}

function deps(overrides: Partial<HeartbeatDeps> = {}): HeartbeatDeps {
  return {
    verifySecret: vi.fn().mockResolvedValue(true),
    recordRun: vi.fn().mockResolvedValue({ created: true }),
    now: () => new Date("2026-10-28T12:34:56Z"),
    ...overrides,
  };
}

describe("hourBucket", () => {
  it("truncates a timestamp to its UTC hour", () => {
    expect(hourBucket(new Date("2026-10-28T12:34:56Z"))).toBe("2026-10-28T12");
    expect(hourBucket(new Date("2026-10-28T23:59:59Z"))).toBe("2026-10-28T23");
  });
});

describe("handleHeartbeat", () => {
  it("rejects anything but POST", async () => {
    const res = await handleHeartbeat(request({ method: "GET" }), deps());
    expect(res.status).toBe(405);
  });

  it("rejects a missing secret without touching the database", async () => {
    const d = deps();
    const res = await handleHeartbeat(request(), d);
    expect(res.status).toBe(401);
    expect(d.verifySecret).not.toHaveBeenCalled();
    expect(d.recordRun).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const d = deps({ verifySecret: vi.fn().mockResolvedValue(false) });
    const res = await handleHeartbeat(request({ secret: "nope" }), d);
    expect(res.status).toBe(401);
    expect(d.recordRun).not.toHaveBeenCalled();
  });

  it("records one run keyed by the hour of the scheduled time", async () => {
    const d = deps();
    const res = await handleHeartbeat(
      request({ secret: "ok", body: { scheduled_at: "2026-10-28T09:00:00Z" } }),
      d,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: true, idempotencyKey: "2026-10-28T09" });
    expect(d.recordRun).toHaveBeenCalledWith("heartbeat", "2026-10-28T09");
  });

  it("falls back to the current hour when no scheduled time is sent", async () => {
    const d = deps();
    await handleHeartbeat(request({ secret: "ok" }), d);
    expect(d.recordRun).toHaveBeenCalledWith("heartbeat", "2026-10-28T12");
  });

  it("is idempotent: a repeat in the same hour reports created: false", async () => {
    const d = deps({ recordRun: vi.fn().mockResolvedValue({ created: false }) });
    const res = await handleHeartbeat(request({ secret: "ok" }), d);
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);
  });

  it("ignores a malformed scheduled time", async () => {
    const d = deps();
    await handleHeartbeat(request({ secret: "ok", body: { scheduled_at: "garbage" } }), d);
    expect(d.recordRun).toHaveBeenCalledWith("heartbeat", "2026-10-28T12");
  });

  it("answers 500 without leaking details when the database fails", async () => {
    const d = deps({ recordRun: vi.fn().mockRejectedValue(new Error("password=hunter2")) });
    const res = await handleHeartbeat(request({ secret: "ok" }), d);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("hunter2");
  });
});
