import { expect, test } from "@playwright/test";

for (const [path, heading] of [
  ["/privacy", "What we keep, and why"],
  ["/terms", "The ground rules"],
] as const) {
  test.describe(path, () => {
    test("is public and readable", async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText(/last updated/i)).toBeVisible();
    });

    test("does not scroll sideways", async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test("the sign-in page links to both documents, which open", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "privacy notice", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goBack();
  await page.getByRole("link", { name: "terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
});

test("the footer links to both documents", async ({ page }) => {
  await page.goto("/");
  const legal = page.getByRole("navigation", { name: "Legal" });
  await expect(legal.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(legal.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
});
