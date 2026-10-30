import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";

// Three people in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "several people in the shared database");
});

async function threeFlatmates(browser: Browser, baseURL: string) {
  const host = await signUpAndIn(newTestUser("swap-host"));
  await createFlat(host.supabase, "Swap Flat");
  const second = await signUpAndIn(newTestUser("swap-two"));
  await joinFlat(host.supabase, second.supabase);
  const third = await signUpAndIn(newTestUser("swap-three"));
  await joinFlat(host.supabase, third.supabase);

  const pages: Page[] = [];
  for (const person of [host, second, third]) {
    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, person.jar, baseURL);
    pages.push(await context.newPage());
  }
  return pages as [Page, Page, Page];
}

test.describe("swaps", () => {
  test("a flatmate asks another to take a chore, the other accepts, and the old one is marked replaced", async ({
    browser,
    baseURL,
  }) => {
    const pages = await threeFlatmates(browser, baseURL!);
    const [hostPage] = pages;

    await hostPage.goto("/rota/chores");
    await hostPage.getByRole("button", { name: "Load the usual five" }).click();
    await expect(hostPage.getByRole("heading", { name: "Kitchen" })).toBeVisible();
    await hostPage.getByRole("button", { name: "Give out the week" }).click();
    await expect(hostPage.getByText(/The week is ready/)).toBeVisible();

    // Someone with a chore asks for a swap, with nothing in return.
    let asker: Page | undefined;
    for (const page of pages) {
      await page.goto("/rota");
      if ((await page.locator('a[href^="/rota/assignments/"]').count()) > 0) {
        asker = page;
        break;
      }
    }
    expect(asker, "someone has a chore").toBeDefined();
    await asker!.locator('a[href^="/rota/assignments/"]').first().click();
    await expect(asker!).toHaveURL(/\/rota\/assignments\/[0-9a-f-]{36}$/);
    const assignmentUrl = asker!.url();
    await asker!.getByRole("button", { name: "Ask to swap" }).click();
    await expect(asker!.getByText(/nothing changes until they accept/)).toBeVisible();

    // Someone else sees the request and accepts it.
    let recipient: Page | undefined;
    for (const page of pages) {
      if (page === asker) continue;
      await page.goto("/rota");
      const accept = page.getByRole("button", { name: /Accept .*swap/ }).first();
      const seen = await accept
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (seen) {
        recipient = page;
        break;
      }
    }
    expect(recipient, "someone was asked").toBeDefined();
    await recipient!
      .getByRole("button", { name: /Accept .*swap/ })
      .first()
      .click();
    await expect(recipient!.getByRole("button", { name: /Accept .*swap/ })).toHaveCount(0);

    // The asker's old assignment is kept but replaced, and can no longer be swapped or ticked.
    await asker!.goto(assignmentUrl);
    await expect(asker!.getByText(/replaced/i).first()).toBeVisible();
    await expect(asker!.getByRole("button", { name: "Ask to swap" })).toHaveCount(0);
  });
});
