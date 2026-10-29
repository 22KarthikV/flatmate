import { expect, test } from "@playwright/test";

test.describe("sign-in pages", () => {
  test("the sign-in page offers Google and links to the legal pages", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Sign in to FlatMate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("link", { name: "terms", exact: true })).toHaveAttribute(
      "href",
      "/terms",
    );
    await expect(page.getByRole("link", { name: "privacy notice", exact: true })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  test("the button meets the 44px touch target and the page does not scroll sideways", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    const box = await page.getByRole("button", { name: "Continue with Google" }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("a safe next path is carried into the form", async ({ page }) => {
    await page.goto("/sign-in?next=%2Frota");
    await expect(page.locator('input[name="next"]')).toHaveValue("/rota");
  });

  test("an unsafe next path is replaced", async ({ page }) => {
    await page.goto("/sign-in?next=%2F%2Fevil.com");
    await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard");
  });

  test("the sign-in page is not indexed", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("auth callback", () => {
  // Same server for every project, so run once.
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop-chrome", "browser independent");
  });

  test("a callback with no code ends on the neutral error page", async ({ page }) => {
    await page.goto("/auth/callback");

    await expect(page).toHaveURL(/\/auth\/error$/);
    await expect(page.getByRole("heading", { name: /didn.t work/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/sign-in");
  });

  test("a rejected or bogus code never reaches another site", async ({ request }) => {
    const response = await request.get("/auth/callback?code=bogus&next=//evil.com", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(307);
    const location = new URL(response.headers()["location"]);
    expect(location.hostname).toBe("localhost");
    expect(location.pathname).toBe("/auth/error");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  });
});
