import { expect, test } from "@playwright/test";

import { addSessionCookies, newTestUser, signUpAndIn } from "./support/session";

test.describe("a person with no flat", () => {
  test("sees the create-flat screen on Home without sideways scroll", async ({
    page,
    context,
    baseURL,
  }) => {
    const { jar } = await signUpAndIn(newTestUser("noflat"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create your flat" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("is asked to set up a flat on the shared tabs, but can still reach Account", async ({
    page,
    context,
    baseURL,
  }) => {
    const { jar } = await signUpAndIn(newTestUser("noflat-tabs"));
    await addSessionCookies(context, jar, baseURL!);

    for (const path of ["/rota", "/money", "/events"]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: "Set up your flat first" }),
      ).toBeVisible();
    }

    await page.goto("/more/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  });
});

test.describe("creating a flat", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop-chrome", "writes to the shared database once");
  });

  test("makes the person its owner and the tabs open up", async ({ page, context, baseURL }) => {
    const { jar } = await signUpAndIn(newTestUser("creator"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/dashboard");
    await page.getByLabel("Flat name").fill("  Flat   12 ");
    await page.getByRole("button", { name: "Create flat" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Flat 12" })).toBeVisible();
    await expect(page.getByText("You are Owner.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Flat 12" })).toBeVisible();

    await page.goto("/rota");
    await expect(page.getByRole("heading", { level: 1, name: "Rota" })).toBeVisible();
  });

  test("an empty name is refused by the form", async ({ page, context, baseURL }) => {
    const { jar } = await signUpAndIn(newTestUser("emptyflat"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Create flat" }).click();

    const valid = await page
      .getByLabel("Flat name")
      .evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(valid).toBe(false);
    await expect(page.getByRole("heading", { name: "Create your flat" })).toBeVisible();
  });
});
