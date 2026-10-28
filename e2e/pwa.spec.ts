import { expect, test } from "@playwright/test";

test.describe("manifest and icons", () => {
  test("manifest is valid and installable", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();

    expect(manifest.name).toBe("FlatMate");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/dashboard");

    const icons = manifest.icons as { sizes: string; purpose: string; src: string }[];
    expect(icons.some((i) => i.sizes === "192x192" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });

  test("every manifest icon is a real PNG", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();

    for (const icon of manifest.icons as { src: string }[]) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"], icon.src).toContain("image/png");
    }
  });

  test("pages declare the manifest, theme colour and Apple icon", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).not.toHaveCount(0);
  });
});

test.describe("service worker", () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== "chromium", "service worker is verified on Chromium");
  });

  test("is served uncached and registers with root scope", async ({ page, request }) => {
    const sw = await request.get("/sw.js");
    expect(sw.headers()["cache-control"]).toContain("no-store");
    expect(sw.headers()["content-type"]).toContain("javascript");

    await page.goto("/");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);

    // `ready` resolves while the worker may still be activating, so wait for it to finish.
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
      .toBe("activated");
  });

  test("precaches the offline page and icons", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const cached = await Promise.all(
            ["/offline", "/icons/192", "/icons/512"].map((url) => caches.match(url)),
          );
          return cached.map(Boolean);
        }),
      )
      .toEqual([true, true, true]);
  });

  test("shows the offline page when the network is gone", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => page.evaluate(async () => Boolean(await caches.match("/offline"))))
      .toBe(true);
    await page.reload(); // make sure the worker controls the page

    await context.setOffline(true);
    await page.goto("/rota").catch(() => {});

    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  });
});
