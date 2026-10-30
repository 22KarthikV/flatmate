import { expect, test, type Page } from "@playwright/test";

import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";

// Two people in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "two people in the shared database");
});

async function twoFlatmates(browser: import("@playwright/test").Browser, baseURL: string) {
  const host = await signUpAndIn(newTestUser("payer"));
  await createFlat(host.supabase, "Money Flat");
  const joiner = await signUpAndIn(newTestUser("sharer"));
  await joinFlat(host.supabase, joiner.supabase);

  const hostContext = await browser.newContext({ baseURL });
  await addSessionCookies(hostContext, host.jar, baseURL);
  const joinerContext = await browser.newContext({ baseURL });
  await addSessionCookies(joinerContext, joiner.jar, baseURL);

  return {
    host,
    joiner,
    hostContext,
    joinerContext,
    hostPage: await hostContext.newPage(),
    joinerPage: await joinerContext.newPage(),
  };
}

async function addEqualExpense(page: Page, amount: string, description: string) {
  await page.goto("/money/add");
  await page.getByLabel("Amount (£)").fill(amount);
  await page.getByLabel("What was it for?").fill(description);
  await page.getByLabel("Category").selectOption("household");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page).toHaveURL(/\/money\/expenses\/[0-9a-f-]{36}$/);
}

test.describe("balances", () => {
  test("both flatmates see the same, correct positions and the same suggested payment", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );

    // A new flat has nothing to settle.
    await hostPage.goto("/money");
    await expect(hostPage.getByText("Everyone is square")).toBeVisible();

    // The host pays 10.00 for both of them; the flatmate pays 4.00 for both.
    await addEqualExpense(hostPage, "10", "Shared shopping");
    await addEqualExpense(joinerPage, "4", "Light bulbs");

    // The flatmate owes 5.00 and is owed 2.00: net they owe 3.00, and the host is owed 3.00.
    await hostPage.goto("/money");
    await expect(hostPage.getByText("You are owed £3.00")).toBeVisible();
    await expect(hostPage.getByText(/pays you £3\.00/)).toBeVisible();
    await expect(hostPage.getByText("owes £3.00")).toBeVisible();

    await joinerPage.goto("/money");
    await expect(joinerPage.getByText("You owe £3.00")).toBeVisible();
    await expect(joinerPage.getByText(/You pay .* £3\.00/)).toBeVisible();
    await expect(joinerPage.getByText("is owed £3.00")).toBeVisible();

    // Cancelling the larger expense moves everyone.
    await hostPage.goto("/money");
    await hostPage.getByRole("link", { name: /Shared shopping/ }).click();
    await hostPage.getByRole("button", { name: "Cancel this expense" }).click();
    await hostPage.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(hostPage).toHaveURL(/\/money$/);
    await expect(hostPage.getByText("You owe £2.00")).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("an open Money screen updates when a flatmate adds an expense, without navigating", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );

    await joinerPage.goto("/money");
    await expect(joinerPage.getByText("Everyone is square")).toBeVisible();
    // Give the live updates a moment to connect, as the notification tests do.
    await joinerPage.waitForTimeout(3000);

    await addEqualExpense(hostPage, "8", "Live update");

    await expect(joinerPage.getByText("You owe £4.00")).toBeVisible({ timeout: 20_000 });
    await expect(joinerPage.getByRole("link", { name: /Live update/ })).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });
});

test.describe("expenses", () => {
  test("adding an expense tells the other flatmate, who sees their share", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );

    await hostPage.goto("/money");
    await expect(hostPage.getByText(/No expenses yet/)).toBeVisible();
    await hostPage.getByRole("link", { name: "Add expense" }).click();

    await hostPage.getByLabel("Amount (£)").fill("10");
    await hostPage.getByLabel("What was it for?").fill("Kitchen roll");
    await hostPage.getByLabel("Category").selectOption("household");
    // Ten pounds between two is five each; the preview says so before anything is saved.
    const preview = hostPage.getByText("Each share").locator("..");
    await expect(preview).toContainText("£5.00");
    await hostPage.getByRole("button", { name: "Add expense" }).click();

    await expect(hostPage).toHaveURL(/\/money\/expenses\/[0-9a-f-]{36}$/);
    await expect(hostPage.getByRole("heading", { level: 2, name: "Kitchen roll" })).toBeVisible();
    await expect(hostPage.getByText("£10.00").first()).toBeVisible();
    await expect(hostPage.getByText("Who owes what")).toBeVisible();

    // The flatmate is told, with their share, and sees it in the list.
    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText(/added Kitchen roll/)).toBeVisible();
    await expect(joinerPage.getByText("Your share is £5.00.")).toBeVisible();

    await joinerPage.goto("/money");
    const row = joinerPage.getByRole("link", { name: /Kitchen roll/ });
    await expect(row).toContainText("Your share £5.00");
    await expect(row).toContainText("paid");

    // The person who added it is not told about their own expense.
    await hostPage.goto("/notifications");
    await expect(hostPage.getByText(/added Kitchen roll/)).toHaveCount(0);

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("the split can be by amounts, by percentages or onto one person", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, hostContext, joinerContext } = await twoFlatmates(browser, baseURL!);

    // By percentages: 70 / 30 of £10.00.
    await hostPage.goto("/money/add");
    await hostPage.getByLabel("Amount (£)").fill("10");
    await hostPage.getByLabel("What was it for?").fill("Split by percent");
    await hostPage.getByRole("radio", { name: "By percentages" }).check({ force: true });
    const percentInputs = hostPage.locator('input[name^="percent:"]');
    await percentInputs.nth(0).fill("70");
    await expect(hostPage.getByText(/must add up to 100%/)).toBeVisible();
    await percentInputs.nth(1).fill("30");
    await hostPage.getByRole("button", { name: "Add expense" }).click();
    await expect(hostPage).toHaveURL(/\/money\/expenses\//);
    await expect(hostPage.getByText("£7.00").filter({ visible: true })).toBeVisible();
    await expect(hostPage.getByText("£3.00").filter({ visible: true })).toBeVisible();

    // By amounts, with a mistake first.
    await hostPage.goto("/money/add");
    await hostPage.getByLabel("Amount (£)").fill("9");
    await hostPage.getByLabel("What was it for?").fill("Split by amounts");
    await hostPage.getByRole("radio", { name: "By amounts" }).check({ force: true });
    const amountInputs = hostPage.locator('input[name^="exact:"]');
    await amountInputs.nth(0).fill("5");
    await amountInputs.nth(1).fill("3");
    await hostPage.getByRole("button", { name: "Add expense" }).click();
    await expect(hostPage.locator('p[role="alert"]')).toContainText("The amounts add up to £8.00");
    await amountInputs.nth(1).fill("4");
    await hostPage.getByRole("button", { name: "Add expense" }).click();
    await expect(hostPage).toHaveURL(/\/money\/expenses\//);

    // Onto one person: only they are told.
    await hostPage.goto("/money/add");
    await hostPage.getByLabel("Amount (£)").fill("4.50");
    await hostPage.getByLabel("What was it for?").fill("Bought for you");
    await hostPage.getByRole("radio", { name: "One person" }).check({ force: true });
    // The owner is listed first, so the flatmate who joined is the last choice.
    await hostPage.locator('input[name="one"]').last().check({ force: true });
    await hostPage.getByRole("button", { name: "Add expense" }).click();
    await expect(hostPage).toHaveURL(/\/money\/expenses\//);
    await expect(hostPage.getByText("£4.50").first()).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("an expense can be corrected and cancelled, and the history stays", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );
    await addEqualExpense(hostPage, "10", "Bin bags");
    const original = hostPage.url();

    // The flatmate, who did not add it, cannot change it.
    await joinerPage.goto(original);
    await expect(joinerPage.getByRole("heading", { level: 2, name: "Bin bags" })).toBeVisible();
    await expect(joinerPage.getByRole("link", { name: "Correct it" })).toHaveCount(0);
    await expect(joinerPage.getByRole("button", { name: "Cancel this expense" })).toHaveCount(0);
    await joinerPage.goto(`${original}/edit`);
    await expect(joinerPage).toHaveURL(original);

    // The person who added it corrects the amount.
    await hostPage.getByRole("link", { name: "Correct it" }).click();
    // Next keeps the page we came from in the DOM, hidden, so look only at what is showing.
    const amount = hostPage.getByLabel("Amount (£)").filter({ visible: true });
    await expect(amount).toHaveValue("10.00");
    await amount.fill("12");
    await hostPage.getByRole("button", { name: "Save correction" }).click();

    await expect(hostPage).toHaveURL(/\/money\/expenses\/[0-9a-f-]{36}$/);
    expect(hostPage.url()).not.toBe(original);
    await expect(hostPage.getByText("£12.00").first()).toBeVisible();
    await expect(
      hostPage.getByText("History", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(hostPage.getByText(/This version/).filter({ visible: true })).toBeVisible();

    // The old version is still there, marked as corrected.
    await hostPage.goto(original);
    await expect(hostPage.getByText("Corrected", { exact: false }).first()).toBeVisible();
    await expect(hostPage.getByRole("link", { name: "Correct it" })).toHaveCount(0);

    // The flatmate was told about the correction, with their new share.
    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText(/changed Bin bags/)).toBeVisible();
    await expect(joinerPage.getByText("Your share is now £6.00.")).toBeVisible();

    // Cancel the corrected one, after a confirmation.
    await hostPage.goto("/money");
    await hostPage
      .getByRole("link", { name: /Bin bags.*£12\.00/ })
      .first()
      .click();
    await hostPage.getByRole("button", { name: "Cancel this expense" }).click();
    await expect(hostPage.getByText(/stops counting towards anyone/)).toBeVisible();
    await hostPage.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(hostPage).toHaveURL(/\/money$/);
    await expect(hostPage.getByText("Cancelled").first()).toBeVisible();

    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText(/cancelled Bin bags/)).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("an admin can correct someone else's expense; another flat sees nothing", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );
    // The flatmate adds one; the owner (an admin by role) can change it.
    await addEqualExpense(joinerPage, "6", "Washing powder");
    const url = joinerPage.url();
    await hostPage.goto(url);
    await expect(hostPage.getByRole("link", { name: "Correct it" })).toBeVisible();
    await expect(hostPage.getByRole("button", { name: "Cancel this expense" })).toBeVisible();

    // Someone in another flat cannot even tell it exists.
    const stranger = await signUpAndIn(newTestUser("stranger"));
    await createFlat(stranger.supabase, "Other Flat");
    const strangerContext = await browser.newContext({ baseURL: baseURL! });
    await addSessionCookies(strangerContext, stranger.jar, baseURL!);
    const strangerPage = await strangerContext.newPage();
    await strangerPage.goto(url);
    await expect(strangerPage.getByText("We couldn’t find that expense.")).toBeVisible();
    await strangerPage.goto("/money");
    await expect(strangerPage.getByText(/No expenses yet/)).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close(), strangerContext.close()]);
  });

  test("the add form fits a phone: no sideways scroll, touch-sized controls", async ({
    browser,
    baseURL,
  }) => {
    const user = await signUpAndIn(newTestUser("phone"));
    await createFlat(user.supabase, "Phone Flat");
    const context = await browser.newContext({
      baseURL: baseURL!,
      viewport: { width: 360, height: 740 },
    });
    await addSessionCookies(context, user.jar, baseURL!);
    const page = await context.newPage();

    for (const path of ["/money", "/money/add"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }

    await page.goto("/money/add");
    for (const control of [
      page.getByRole("button", { name: "Add expense" }),
      page.getByLabel("Amount (£)"),
      page.getByLabel("Category"),
      page.getByRole("checkbox").first(),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    }
    const submit = await page.getByRole("button", { name: "Add expense" }).boundingBox();
    expect(submit?.height ?? 0).toBeGreaterThanOrEqual(44);
    await context.close();
  });
});
