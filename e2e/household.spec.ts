import { expect, test } from "@playwright/test";

import { addSessionCookies, createFlat, newTestUser, signUpAndIn } from "./support/session";

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

test.describe("invite links", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop-chrome", "two people in the shared database");
  });

  test("opening the link joins nobody; pressing Join does; revoking ends it", async ({
    browser,
    baseURL,
  }) => {
    // The host makes a flat and a link.
    const host = await signUpAndIn(newTestUser("host"));
    await createFlat(host.supabase, "Join Flat");
    const hostContext = await browser.newContext({ baseURL });
    await addSessionCookies(hostContext, host.jar, baseURL!);
    const hostPage = await hostContext.newPage();

    await hostPage.goto("/more/flat");
    await expect(hostPage.getByText("There is no working link right now.")).toBeVisible();
    await hostPage.getByRole("button", { name: "Make a link" }).click();
    const link = await hostPage.getByLabel("Your link").inputValue();
    expect(link).toMatch(/\/join\/[A-Za-z0-9_-]{43}$/);

    const activeMembers = async () => {
      const { count } = await host.supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .is("left_at", null);
      return count;
    };
    expect(await activeMembers()).toBe(1);

    // A signed-out visitor is sent to sign in and brought back to the same link.
    const visitor = await browser.newContext({ baseURL });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(link);
    await expect(visitorPage).toHaveURL(/\/sign-in\?next=%2Fjoin%2F/);
    await visitor.close();

    // The joiner opens the link: they see the flat, and nothing has changed yet.
    const joiner = await signUpAndIn(newTestUser("joiner"));
    const joinerContext = await browser.newContext({ baseURL });
    await addSessionCookies(joinerContext, joiner.jar, baseURL!);
    const joinerPage = await joinerContext.newPage();

    await joinerPage.goto(link);
    await expect(joinerPage.getByRole("heading", { level: 2, name: "Join Flat" })).toBeVisible();
    await joinerPage.reload();
    expect(await activeMembers()).toBe(1);

    await joinerPage.getByRole("button", { name: "Join" }).click();
    await expect(joinerPage).toHaveURL(/\/dashboard$/);
    await expect(joinerPage.getByRole("heading", { level: 2, name: "Join Flat" })).toBeVisible();
    await expect(joinerPage.getByText("You are Member.")).toBeVisible();
    expect(await activeMembers()).toBe(2);

    // A plain member sees the flat but not the invite controls.
    await joinerPage.goto("/more/flat");
    await expect(joinerPage.getByRole("heading", { level: 2, name: "Join Flat" })).toBeVisible();
    await expect(joinerPage.getByText("Invite flatmates")).toHaveCount(0);

    // Already in a flat: the link now just says so.
    await joinerPage.goto(link);
    await expect(joinerPage.getByText("You are already in Join Flat.")).toBeVisible();

    // The host switches the link off; a third person gets the neutral message and can paste too.
    await hostPage.getByRole("button", { name: "Switch link off" }).click();
    await expect(hostPage.getByText("There is no working link right now.")).toBeVisible();

    const third = await signUpAndIn(newTestUser("third"));
    const thirdContext = await browser.newContext({ baseURL });
    await addSessionCookies(thirdContext, third.jar, baseURL!);
    const thirdPage = await thirdContext.newPage();
    await thirdPage.goto(link);
    await expect(thirdPage.getByText("This invite link isn’t valid any more.")).toBeVisible();

    await thirdPage.goto("/dashboard");
    await thirdPage.getByLabel("Paste the link here").fill(link);
    await thirdPage.getByRole("button", { name: "Open invite" }).click();
    await expect(thirdPage).toHaveURL(/\/join\//);
    await expect(thirdPage.getByText("This invite link isn’t valid any more.")).toBeVisible();

    await thirdPage.goto("/dashboard");
    await thirdPage.getByLabel("Paste the link here").fill("https://evil.example/hello");
    await thirdPage.getByRole("button", { name: "Open invite" }).click();
    await expect(thirdPage.getByText("That doesn’t look like an invite link.")).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close(), thirdContext.close()]);
  });
});
