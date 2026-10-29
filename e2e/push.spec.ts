import { expect, test } from "@playwright/test";

import { countPushDevices } from "./support/database";
import { addSessionCookies, newTestUser, signUpAndIn } from "./support/session";

/**
 * Chromium cannot reach a real push service from a test, so the browser's PushManager is replaced
 * with a fake that behaves like one. Everything else (the page, the server action, the database,
 * row-level security) is the real thing.
 */
const FAKE_PUSH = () => {
  let current: { endpoint: string; toJSON(): unknown; unsubscribe(): Promise<boolean> } | null =
    null;
  let permission: NotificationPermission = "default";
  const w = window as unknown as { __permissionRequests: number };
  w.__permissionRequests = 0;

  Object.defineProperty(Notification, "permission", { configurable: true, get: () => permission });
  Notification.requestPermission = async () => {
    w.__permissionRequests += 1;
    permission = "granted";
    return permission;
  };
  PushManager.prototype.getSubscription = async () => current as unknown as PushSubscription;
  PushManager.prototype.subscribe = async () => {
    const endpoint = `https://push.example/e2e-${Math.random().toString(36).slice(2)}`;
    current = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: "BPkE2E_p256dh_key", auth: "e2e_auth_key" } }),
      unsubscribe: async () => {
        current = null;
        return true;
      },
    };
    return current as unknown as PushSubscription;
  };
};

test.describe("push on this device", () => {
  test("a browser without push gets an explanation and no switch", async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(test.info().project.name !== "desktop-chrome", "one browser is enough");
    const { jar } = await signUpAndIn(newTestUser("push-none"));
    await addSessionCookies(context, jar, baseURL!);
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, "PushManager");
    });

    await page.goto("/more/notifications");
    await expect(page.getByText(/can’t receive push notifications/)).toBeVisible();
    await expect(page.getByRole("button", { name: /turn on push/i })).toHaveCount(0);
    await expect(page.getByRole("switch")).toHaveCount(0);
    // The rest of the page still works.
    await expect(page.getByRole("form", { name: "Your role changes" })).toBeVisible();
  });

  test("an iPhone in Safari is told to install the app first", async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(test.info().project.name !== "mobile-safari", "needs the iPhone browser profile");
    const { jar } = await signUpAndIn(newTestUser("push-ios"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/more/notifications");
    await expect(page.getByText(/push works from the Home Screen app/)).toBeVisible();
    await expect(page.getByRole("button", { name: /turn on push/i })).toHaveCount(0);
  });

  test("turning push on stores the device and turning it off removes it; no prompt on load", async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(test.info().project.name !== "desktop-chrome", "writes to the shared database once");
    const user = newTestUser("push-on");
    const { jar } = await signUpAndIn(user);
    await addSessionCookies(context, jar, baseURL!);
    await page.addInitScript(FAKE_PUSH);

    await page.goto("/more/notifications");
    const turnOn = page.getByRole("button", { name: "Turn on push on this device" });
    await expect(turnOn).toBeVisible();

    // Showing the page asked for nothing.
    expect(
      await page.evaluate(
        () => (window as unknown as { __permissionRequests: number }).__permissionRequests,
      ),
    ).toBe(0);
    expect(countPushDevices(user.email)).toBe(0);

    await turnOn.click();
    await expect(page.getByText("Push is on for this device.")).toBeVisible();
    expect(countPushDevices(user.email)).toBe(1);
    expect(
      await page.evaluate(
        () => (window as unknown as { __permissionRequests: number }).__permissionRequests,
      ),
    ).toBe(1);

    const devices = page.getByText("Your devices").locator("..").getByRole("listitem");
    await expect(devices).toHaveCount(1);
    await expect(devices.getByText("This device")).toBeVisible();
    await expect(devices.getByText(/Chrome on/)).toBeVisible();

    await page.getByRole("button", { name: "Turn off push on this device" }).click();
    await expect(page.getByRole("button", { name: "Turn on push on this device" })).toBeVisible();
    await expect(page.getByText("Your devices")).toHaveCount(0);
    expect(countPushDevices(user.email)).toBe(0);
  });
});
