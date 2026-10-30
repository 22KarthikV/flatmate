import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PushError,
  getPushState,
  hasBrowserSubscription,
  readPushEnv,
  subscribeToPush,
  unsubscribeFromPush,
  urlBase64ToUint8Array,
  type PushEnv,
} from "./push-client";

const supported: PushEnv = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  ios: false,
  standalone: false,
};
const on = { configured: true, subscribed: false };

describe("getPushState", () => {
  it("is ready where push is supported and permission can still be asked", () => {
    expect(getPushState(supported, on)).toBe("ready");
  });

  it("is subscribed only when permission is granted and the device is known", () => {
    expect(getPushState({ ...supported, permission: "granted" }, { ...on, subscribed: true })).toBe(
      "subscribed",
    );
    expect(getPushState({ ...supported, permission: "granted" }, on)).toBe("ready");
    expect(getPushState(supported, { ...on, subscribed: true })).toBe("ready");
  });

  it("explains a blocked site", () => {
    expect(getPushState({ ...supported, permission: "denied" }, on)).toBe("denied");
  });

  it.each([
    ["no service worker", { hasServiceWorker: false }],
    ["no push manager", { hasPushManager: false }],
    ["no notifications", { hasNotification: false }],
  ])("is unsupported with %s", (_name, missing) => {
    expect(getPushState({ ...supported, ...missing }, on)).toBe("unsupported");
  });

  it("says to install the app on an iPhone in the browser, whatever else is missing", () => {
    const iosBrowser = { ...supported, ios: true, hasPushManager: false };
    expect(getPushState(iosBrowser, on)).toBe("ios-browser");
  });

  it("treats the installed iPhone app like any supported browser", () => {
    expect(getPushState({ ...supported, ios: true, standalone: true }, on)).toBe("ready");
  });

  it("says push is not set up when the server has no public key", () => {
    expect(getPushState(supported, { configured: false, subscribed: false })).toBe(
      "not-configured",
    );
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url with no padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});

describe("with a fake browser", () => {
  const unsubscribe = vi.fn();
  const subscribe = vi.fn();
  const getSubscription = vi.fn();
  const requestPermission = vi.fn();

  beforeEach(() => {
    for (const fn of [unsubscribe, subscribe, getSubscription, requestPermission]) fn.mockReset();
    vi.stubGlobal("Notification", { requestPermission, permission: "default" });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }) },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("subscribes after permission is granted and returns the keys", async () => {
    requestPermission.mockResolvedValue("granted");
    subscribe.mockResolvedValue({
      toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "pk", auth: "au" } }),
    });

    await expect(subscribeToPush("AQID")).resolves.toEqual({
      endpoint: "https://push.example/abc",
      p256dh: "pk",
      auth: "au",
    });
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
    expect(requestPermission.mock.invocationCallOrder[0]).toBeLessThan(
      subscribe.mock.invocationCallOrder[0],
    );
  });

  it("does not subscribe when permission is refused", async () => {
    requestPermission.mockResolvedValue("denied");
    await expect(subscribeToPush("AQID")).rejects.toMatchObject({ reason: "denied" });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("reports a push service failure as a failure, not a crash", async () => {
    requestPermission.mockResolvedValue("granted");
    subscribe.mockRejectedValue(new Error("push service error"));
    const error = await subscribeToPush("AQID").catch((caught) => caught);
    expect(error).toBeInstanceOf(PushError);
    expect(error.reason).toBe("failed");
  });

  it("rejects a subscription with no keys", async () => {
    requestPermission.mockResolvedValue("granted");
    subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: "https://push.example/abc" }) });
    await expect(subscribeToPush("AQID")).rejects.toMatchObject({ reason: "failed" });
  });

  it("unsubscribes the browser's subscription, if there is one", async () => {
    getSubscription.mockResolvedValue({ unsubscribe: unsubscribe.mockResolvedValue(true) });
    await expect(unsubscribeFromPush()).resolves.toBe(true);

    getSubscription.mockResolvedValue(null);
    await expect(unsubscribeFromPush()).resolves.toBe(false);
  });

  it("knows whether the browser holds a subscription, and treats errors as none", async () => {
    getSubscription.mockResolvedValue({});
    await expect(hasBrowserSubscription()).resolves.toBe(true);
    getSubscription.mockResolvedValue(null);
    await expect(hasBrowserSubscription()).resolves.toBe(false);
    getSubscription.mockRejectedValue(new Error("nope"));
    await expect(hasBrowserSubscription()).resolves.toBe(false);
  });

  it("never asks for permission just by reading the environment", () => {
    vi.stubGlobal("PushManager", class {});
    readPushEnv();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reads support and permission from the browser", () => {
    vi.stubGlobal("PushManager", class {});
    const env = readPushEnv();
    expect(env).toMatchObject({
      hasServiceWorker: true,
      hasPushManager: true,
      hasNotification: true,
      permission: "default",
    });
  });
});
