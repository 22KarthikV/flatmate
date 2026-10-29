import { expect, test, type Page } from "@playwright/test";

import { test as signedIn } from "./support/signed-in";

const appRoutes = [
  { label: "Home", path: "/dashboard", heading: "Home" },
  { label: "Rota", path: "/rota", heading: "Rota" },
  { label: "Money", path: "/money", heading: "Money" },
  { label: "Events", path: "/events", heading: "Events" },
  { label: "More", path: "/more", heading: "More" },
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test.describe("landing page", () => {
  test("loads with the app name and no console errors", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");

    await expect(page).toHaveTitle("FlatMate");
    await expect(page.getByRole("heading", { level: 1, name: "FlatMate" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test("Get started opens the sign-in page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Get started" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to FlatMate" }),
    ).toBeVisible();
  });
});

test.describe("route guard", () => {
  test("a signed-out visitor to the app is sent to sign in and brought back", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
  });
});

signedIn.describe("app shell", () => {
  signedIn("shows exactly one main navigation for the current screen size", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(1);
  });

  for (const route of appRoutes) {
    signedIn(`navigates to ${route.label} and marks it current`, async ({ page }) => {
      await page.goto("/dashboard");
      const nav = page.getByRole("navigation", { name: "Main" });

      await nav.getByRole("link", { name: route.label }).click();

      await expect(page).toHaveURL(new RegExp(`${route.path}$`));
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(nav.getByRole("link", { name: route.label })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  }

  signedIn("More lists Account below its heading, not above", async ({ page }) => {
    await page.goto("/more");
    const heading = await page.getByRole("heading", { level: 1, name: "More" }).boundingBox();
    const account = await page.getByRole("link", { name: "Account" }).boundingBox();
    expect(account!.y).toBeGreaterThan(heading!.y);
  });

  signedIn("navigation targets are at least 44px", async ({ page }) => {
    await page.goto("/dashboard");
    const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");

    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  for (const path of ["/", ...appRoutes.map((r) => r.path), "/offline"]) {
    signedIn(`${path} has no horizontal scroll`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

signedIn.describe("error handling", () => {
  signedIn("unknown pages get the custom 404", async ({ page }) => {
    const response = await page.goto("/definitely-missing");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("a signed-out visitor to an unknown page is sent to sign in, not told what exists", async ({
    page,
  }) => {
    await page.goto("/definitely-missing");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdefinitely-missing$/);
  });

  signedIn("the dev-only design page does not exist in production", async ({ page }) => {
    const response = await page.goto("/design");
    expect(response?.status()).toBe(404);
  });
});
