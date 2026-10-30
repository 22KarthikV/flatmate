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
  const host = await signUpAndIn(newTestUser("rota-host"));
  await createFlat(host.supabase, "Rota Flat");
  const second = await signUpAndIn(newTestUser("rota-two"));
  await joinFlat(host.supabase, second.supabase);
  const third = await signUpAndIn(newTestUser("rota-three"));
  await joinFlat(host.supabase, third.supabase);

  const pages: Page[] = [];
  for (const person of [host, second, third]) {
    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, person.jar, baseURL);
    pages.push(await context.newPage());
  }
  return pages as [Page, Page, Page];
}

test.describe("the rota", () => {
  test("an admin defines chores, the week is given out with reasons, and a checklist is ticked to done", async ({
    browser,
    baseURL,
  }) => {
    const [hostPage, secondPage, thirdPage] = await threeFlatmates(browser, baseURL!);

    // The admin starts from the usual five.
    await hostPage.goto("/rota/chores");
    await hostPage.getByRole("button", { name: "Load the usual five" }).click();
    for (const name of ["Bins", "Kitchen", "Living room", "Bathroom", "Hallway"]) {
      await expect(hostPage.getByRole("heading", { name })).toBeVisible();
    }
    await expect(hostPage.getByText("Effort 4 of 5")).toBeVisible();

    // Everyone sees the deadline in plain words. If the window happens to be open, answer too.
    for (const page of [secondPage, thirdPage]) {
      await page.goto("/rota/availability");
      await expect(
        page.getByText(
          /Answer by Saturday 6pm\. If you do not, you will be treated as available every day/,
        ),
      ).toBeVisible();
      const save = page.getByRole("button", { name: "Save my days" });
      if (await save.isVisible()) {
        await save.click();
        await expect(page.getByText(/Saved\./)).toBeVisible();
      }
    }

    // The admin gives out next week.
    await hostPage.goto("/rota/chores");
    await hostPage.getByRole("button", { name: "Give out the week" }).click();
    await expect(hostPage.getByText(/The week is ready and everyone has been told/)).toBeVisible();

    // Everyone sees the week, with a reason on every chore they can see.
    for (const page of [hostPage, secondPage, thirdPage]) {
      await page.goto("/rota");
      await expect(page.getByRole("heading", { name: "Next week" })).toBeVisible();
      await expect(page.getByText("Your chores").first()).toBeVisible();
      await expect(
        page
          .getByText(
            /turn in the rotation|least effort lately|longest ago|not done .* yet|only one around/,
          )
          .first(),
      ).toBeVisible();
    }

    // Whoever has a chore opens it and ticks every step; it is done when the last one is ticked.
    let worker: Page | undefined;
    for (const page of [hostPage, secondPage, thirdPage]) {
      await page.goto("/rota");
      if ((await page.locator('a[href^="/rota/assignments/"]').count()) > 0) {
        worker = page;
        break;
      }
    }
    expect(worker, "someone has a chore").toBeDefined();
    await worker!.locator('a[href^="/rota/assignments/"]').first().click();
    await expect(worker!).toHaveURL(/\/rota\/assignments\/[0-9a-f-]{36}$/);
    await expect(worker!.getByText(/^Why: /)).toBeVisible();

    const steps = worker!.locator("ol").getByRole("button", { pressed: false });
    const total = await steps.count();
    expect(total).toBeGreaterThan(0);
    for (let done = 0; done < total; done++) {
      await steps.first().click();
      await expect(worker!.locator("ol").getByRole("button", { pressed: true })).toHaveCount(
        done + 1,
      );
    }
    await expect(worker!.getByRole("status")).toContainText("Done");

    // A flatmate who is not an admin and has not been given this chore cannot tick it.
    const url = worker!.url();
    const other = [secondPage, thirdPage].find((page) => page !== worker)!;
    await other.goto(url);
    await expect(other.getByText(/^Why: /)).toBeVisible();
    await expect(other.locator("ol").getByRole("button")).toHaveCount(0);
  });
});
