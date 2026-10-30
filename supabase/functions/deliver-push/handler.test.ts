// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  MAX_ATTEMPTS,
  RETRY_DELAYS_SECONDS,
  buildPayload,
  classifyFailure,
  handleDeliverPush,
  minuteBucket,
  type ClaimedPush,
  type DeliverDeps,
} from "./handler";

const push = (over: Partial<ClaimedPush> = {}): ClaimedPush => ({
  outboxId: "o1",
  attempts: 1,
  endpoint: "https://push.example/device-1",
  p256dh: "p256dh-secret",
  auth: "auth-secret",
  title: "You are now an admin",
  body: "Sam changed your role in Flat 4.",
  href: "/more/flat",
  ...over,
});

class PushServiceError extends Error {
  constructor(readonly statusCode: number) {
    super(`push service said ${statusCode}`);
  }
}

function request(init: { secret?: string; body?: unknown; method?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.secret !== undefined) headers["x-scheduler-secret"] = init.secret;
  return new Request("http://localhost/functions/v1/deliver-push", {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
  });
}

function deps(overrides: Partial<DeliverDeps> = {}): DeliverDeps {
  return {
    configured: true,
    verifySecret: vi.fn().mockResolvedValue(true),
    recordRun: vi.fn().mockResolvedValue({ created: true }),
    claim: vi.fn().mockResolvedValueOnce([push()]).mockResolvedValue([]),
    send: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-10-30T09:05:42Z"),
    ...overrides,
  };
}

const call = (d: DeliverDeps, secret = "s3cret") => handleDeliverPush(request({ secret }), d);

describe("minuteBucket", () => {
  it("truncates to the UTC minute", () => {
    expect(minuteBucket(new Date("2026-10-30T09:05:42Z"))).toBe("2026-10-30T09:05");
  });
});

describe("buildPayload", () => {
  it("carries a title, one short line and a path, and nothing else", () => {
    const payload = JSON.parse(buildPayload(push()));
    expect(Object.keys(payload).sort()).toEqual(["body", "path", "title"]);
    expect(payload).toEqual({
      title: "You are now an admin",
      body: "Sam changed your role in Flat 4.",
      path: "/more/flat",
    });
  });

  it("never includes the device endpoint or its keys", () => {
    const text = buildPayload(push());
    for (const secret of ["push.example", "p256dh-secret", "auth-secret", "o1"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("falls back to the inbox for a path that is not inside the app", () => {
    for (const href of ["https://evil.example", "//evil.example", "/\\evil.example", ""]) {
      expect(JSON.parse(buildPayload(push({ href }))).path).toBe("/notifications");
    }
  });

  it("trims over-long text to the limits the database already enforces", () => {
    const payload = JSON.parse(
      buildPayload(push({ title: "T".repeat(300), body: "B".repeat(900) })),
    );
    expect(payload.title).toHaveLength(80);
    expect(payload.body).toHaveLength(200);
  });
});

describe("classifyFailure", () => {
  it.each([404, 410])("a %i means the device is gone", (statusCode) => {
    expect(classifyFailure(1, new PushServiceError(statusCode))).toEqual({ result: "gone" });
    expect(classifyFailure(4, new PushServiceError(statusCode))).toEqual({ result: "gone" });
  });

  it("retries with a growing delay: 1, 5, then 30 minutes", () => {
    expect(RETRY_DELAYS_SECONDS).toEqual([60, 300, 1800]);
    const delays = [1, 2, 3].map((attempt) => {
      const outcome = classifyFailure(attempt, new PushServiceError(503));
      return outcome.result === "retry" ? outcome.retryInSeconds : null;
    });
    expect(delays).toEqual([60, 300, 1800]);
  });

  it("gives up after the last attempt", () => {
    expect(MAX_ATTEMPTS).toBe(4);
    expect(classifyFailure(4, new PushServiceError(503))).toMatchObject({ result: "give_up" });
    expect(classifyFailure(9, new PushServiceError(500))).toMatchObject({ result: "give_up" });
  });

  it.each([429, 500, 502, 503])("treats a %i as worth retrying", (statusCode) => {
    expect(classifyFailure(1, new PushServiceError(statusCode)).result).toBe("retry");
  });

  it("treats a network error with no status as worth retrying", () => {
    expect(classifyFailure(1, new Error("connection reset")).result).toBe("retry");
  });

  it("records a short reason that never contains the endpoint", () => {
    const outcome = classifyFailure(1, new PushServiceError(503));
    expect(outcome).toMatchObject({ error: "HTTP 503" });
    const network = classifyFailure(
      1,
      new Error("connect ECONNREFUSED https://push.example/device-1"),
    );
    expect(JSON.stringify(network)).not.toContain("push.example");
  });
});

describe("handleDeliverPush", () => {
  it("rejects anything but POST", async () => {
    const res = await handleDeliverPush(request({ method: "GET" }), deps());
    expect(res.status).toBe(405);
  });

  it("rejects a missing or wrong secret before touching the outbox", async () => {
    const d = deps();
    expect((await handleDeliverPush(request(), d)).status).toBe(401);

    const wrong = deps({ verifySecret: vi.fn().mockResolvedValue(false) });
    expect((await call(wrong, "nope")).status).toBe(401);
    expect(d.claim).not.toHaveBeenCalled();
    expect(wrong.claim).not.toHaveBeenCalled();
  });

  it("does nothing, and says so, when the VAPID keys are not configured", async () => {
    const d = deps({ configured: false });
    const res = await call(d);
    expect(res.status).toBe(503);
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("skips a minute that has already been handled", async () => {
    const d = deps({ recordRun: vi.fn().mockResolvedValue({ created: false }) });
    const res = await call(d);
    expect(await res.json()).toMatchObject({ ok: true, skipped: true });
    expect(d.claim).not.toHaveBeenCalled();
  });

  it("keys the run by the scheduled minute, falling back to now", async () => {
    const d = deps();
    await handleDeliverPush(
      request({ secret: "s", body: { scheduled_at: "2026-10-30T07:01:30Z" } }),
      d,
    );
    expect(d.recordRun).toHaveBeenCalledWith("deliver-push", "2026-10-30T07:01");

    const e = deps();
    await call(e);
    expect(e.recordRun).toHaveBeenCalledWith("deliver-push", "2026-10-30T09:05");
  });

  it("sends a claimed push and marks it sent", async () => {
    const d = deps();
    const res = await call(d);

    expect(d.send).toHaveBeenCalledWith(push(), buildPayload(push()));
    expect(d.complete).toHaveBeenCalledWith("o1", { result: "sent" });
    expect(await res.json()).toMatchObject({ ok: true, claimed: 1, sent: 1, retried: 0 });
  });

  it("retries a server error with the backoff for that attempt", async () => {
    const d = deps({
      claim: vi
        .fn()
        .mockResolvedValueOnce([push({ attempts: 2 })])
        .mockResolvedValue([]),
      send: vi.fn().mockRejectedValue(new PushServiceError(503)),
    });
    const res = await call(d);

    expect(d.complete).toHaveBeenCalledWith("o1", {
      result: "retry",
      retryInSeconds: 300,
      error: "HTTP 503",
    });
    expect(await res.json()).toMatchObject({ retried: 1, sent: 0 });
  });

  it("stops retrying after the attempt cap", async () => {
    const d = deps({
      claim: vi
        .fn()
        .mockResolvedValueOnce([push({ attempts: 4 })])
        .mockResolvedValue([]),
      send: vi.fn().mockRejectedValue(new PushServiceError(500)),
    });
    const res = await call(d);

    expect(d.complete).toHaveBeenCalledWith("o1", { result: "give_up", error: "HTTP 500" });
    expect(await res.json()).toMatchObject({ gaveUp: 1 });
  });

  it.each([404, 410])("removes the device when the push service says %i", async (statusCode) => {
    const d = deps({ send: vi.fn().mockRejectedValue(new PushServiceError(statusCode)) });
    const res = await call(d);

    expect(d.complete).toHaveBeenCalledWith("o1", { result: "gone" });
    expect(await res.json()).toMatchObject({ gone: 1 });
  });

  it("one failing device does not stop the others", async () => {
    const d = deps({
      claim: vi
        .fn()
        .mockResolvedValueOnce([
          push({ outboxId: "a" }),
          push({ outboxId: "b" }),
          push({ outboxId: "c" }),
        ])
        .mockResolvedValue([]),
      send: vi.fn().mockImplementation(async (item: ClaimedPush) => {
        if (item.outboxId === "b") throw new PushServiceError(503);
      }),
      complete: vi.fn().mockImplementation(async (id: string) => {
        if (id === "a") throw new Error("database hiccup");
      }),
    });
    const res = await call(d);

    expect(d.send).toHaveBeenCalledTimes(3);
    expect(d.complete).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claimed: 3, sent: 1, retried: 1 });
  });

  it("keeps claiming until the outbox is empty, but not forever", async () => {
    const forever = deps({ claim: vi.fn().mockResolvedValue([push()]) });
    const res = await call(forever);
    const body = await res.json();
    expect(forever.claim).toHaveBeenCalledTimes(4);
    expect(body.claimed).toBe(4);

    const two = deps({
      claim: vi
        .fn()
        .mockResolvedValueOnce([push()])
        .mockResolvedValueOnce([push({ outboxId: "o2" })])
        .mockResolvedValue([]),
    });
    await call(two);
    expect(two.claim).toHaveBeenCalledTimes(3);
    expect(two.send).toHaveBeenCalledTimes(2);
  });

  it("answers 500 without leaking details when the outbox cannot be read", async () => {
    const d = deps({
      claim: vi.fn().mockRejectedValue(new Error("password=hunter2 relation missing")),
    });
    const res = await call(d);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
  });
});
