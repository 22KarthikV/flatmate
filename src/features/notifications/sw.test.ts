import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: unknown) => void;

/** Runs public/sw.js against a fake `self`, so the push handlers can be driven directly. */
function loadWorker() {
  const handlers = new Map<string, Handler>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const fake = {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    registration: { showNotification },
    clients: { matchAll, openWindow, claim: vi.fn() },
    location: { origin: "https://flatmate.example" },
    skipWaiting: vi.fn(),
  };
  const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  new Function("self", "caches", "fetch", source)(fake, {}, vi.fn());
  return { handlers, showNotification, matchAll, openWindow };
}

function pushEvent(payload: unknown, raw?: string) {
  const waits: Promise<unknown>[] = [];
  return {
    event: {
      data:
        payload === undefined && raw === undefined
          ? null
          : { json: () => (raw !== undefined ? JSON.parse(raw) : payload) },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    },
    done: () => Promise.all(waits),
  };
}

function clickEvent(data: unknown) {
  const waits: Promise<unknown>[] = [];
  return {
    event: {
      notification: { close: vi.fn(), data },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    },
    done: () => Promise.all(waits),
  };
}

let worker: ReturnType<typeof loadWorker>;
beforeEach(() => {
  worker = loadWorker();
});

describe("service worker push", () => {
  it("shows the title and line it was sent, and remembers where to go", async () => {
    const { event, done } = pushEvent({
      title: "You are now an admin",
      body: "Sam changed it.",
      path: "/more/flat",
    });
    worker.handlers.get("push")!(event);
    await done();

    expect(worker.showNotification).toHaveBeenCalledWith(
      "You are now an admin",
      expect.objectContaining({ body: "Sam changed it.", data: { path: "/more/flat" } }),
    );
  });

  it("falls back to a plain notification when the payload is empty or not JSON", async () => {
    for (const input of [pushEvent(undefined), pushEvent(undefined, "not json")]) {
      worker.handlers.get("push")!(input.event);
      await input.done();
    }
    expect(worker.showNotification).toHaveBeenNthCalledWith(
      1,
      "FlatMate",
      expect.objectContaining({ body: "", data: { path: "/notifications" } }),
    );
    expect(worker.showNotification).toHaveBeenNthCalledWith(
      2,
      "FlatMate",
      expect.objectContaining({ data: { path: "/notifications" } }),
    );
  });

  it("never keeps an off-site path, and trims over-long text", async () => {
    const { event, done } = pushEvent({
      title: "T".repeat(200),
      body: "B".repeat(500),
      path: "https://evil.example",
    });
    worker.handlers.get("push")!(event);
    await done();

    const [title, options] = worker.showNotification.mock.calls[0];
    expect(title).toHaveLength(80);
    expect(options.body).toHaveLength(200);
    expect(options.data.path).toBe("/notifications");
  });
});

describe("service worker notification click", () => {
  it("closes the notification and opens the path when no window is open", async () => {
    const { event, done } = clickEvent({ path: "/more/flat" });
    worker.handlers.get("notificationclick")!(event);
    await done();

    expect(event.notification.close).toHaveBeenCalled();
    expect(worker.openWindow).toHaveBeenCalledWith("/more/flat");
  });

  it("reuses an open window: goes to the path, then brings it forward", async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigated = { focus };
    const navigate = vi.fn().mockResolvedValue(navigated);
    worker.matchAll.mockResolvedValue([{ focus, navigate }]);

    const { event, done } = clickEvent({ path: "/more/flat" });
    worker.handlers.get("notificationclick")!(event);
    await done();

    expect(navigate).toHaveBeenCalledWith("/more/flat");
    expect(focus).toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("still focuses a window that cannot navigate", async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    worker.matchAll.mockResolvedValue([{ focus }]);

    const { event, done } = clickEvent({ path: "/more/flat" });
    worker.handlers.get("notificationclick")!(event);
    await done();

    expect(focus).toHaveBeenCalled();
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    undefined,
  ])("ignores the off-site path %s and opens the inbox", async (path) => {
    const { event, done } = clickEvent({ path });
    worker.handlers.get("notificationclick")!(event);
    await done();
    expect(worker.openWindow).toHaveBeenCalledWith("/notifications");
  });

  it("copes with a notification that has no data at all", async () => {
    const { event, done } = clickEvent(undefined);
    worker.handlers.get("notificationclick")!(event);
    await done();
    expect(worker.openWindow).toHaveBeenCalledWith("/notifications");
  });
});

describe("service worker caching rules", () => {
  it("is the new version and keeps pages network-first", () => {
    const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    expect(source).toContain('const VERSION = "v3"');
    expect(source).toContain('request.mode === "navigate"');
  });
});
