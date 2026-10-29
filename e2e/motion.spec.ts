import { expect, test, type Page } from "@playwright/test";

import { test as signedIn } from "./support/signed-in";

async function scrollThroughPage(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  });
}

const featureRows = (page: Page) => page.locator("main section").last().locator("> div");

test.describe("scroll reveals", () => {
  test("every feature row ends fully visible", async ({ page }) => {
    await page.goto("/");
    await scrollThroughPage(page);

    const rows = featureRows(page);
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) {
      await expect(row).toBeVisible();
      await expect.poll(() => row.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    }
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("content is visible immediately and smooth scroll stays off", async ({ page }) => {
    await page.goto("/");

    for (const row of await featureRows(page).all()) {
      await expect(row).toBeVisible();
      expect(await row.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    }
    await expect(page.locator("html")).not.toHaveClass(/lenis/);
  });
});

test.describe("smooth scroll scope", () => {
  test("runs on the landing page only for desktop pointers", async ({ page }) => {
    await page.goto("/");

    if (test.info().project.name === "desktop-chrome") {
      await expect(page.locator("html")).toHaveClass(/lenis/);
    } else {
      // Phones keep native touch scrolling. Give any wrongly started Lenis time to show up.
      await page.waitForTimeout(500);
      await expect(page.locator("html")).not.toHaveClass(/lenis/);
    }
  });

  signedIn("never runs inside the signed-in app", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(500);
    await expect(page.locator("html")).not.toHaveClass(/lenis/);
  });
});
