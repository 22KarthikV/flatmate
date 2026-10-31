import { expect, test } from "@playwright/test";

import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";

// Two people (and a stranger) in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "two people in the shared database");
});

test.describe("the fix-it log", () => {
  test("A reports, B takes the chase and sets it in progress, A marks it fixed, both see the timeline in order, a stranger cannot open it", async ({
    browser,
    baseURL,
  }) => {
    const first = await signUpAndIn(newTestUser("fix-a"));
    await createFlat(first.supabase, "Fix Flat");
    const second = await signUpAndIn(newTestUser("fix-b"));
    await joinFlat(first.supabase, second.supabase);
    const stranger = await signUpAndIn(newTestUser("fix-c"));
    await createFlat(stranger.supabase, "Other Fix Flat");

    const pages = [];
    for (const person of [first, second, stranger]) {
      const context = await browser.newContext({ baseURL: baseURL! });
      await addSessionCookies(context, person.jar, baseURL!);
      pages.push(await context.newPage());
    }
    const [pageA, pageB, pageStranger] = pages;

    // A reports a problem and lands on it.
    await pageA.goto("/more/fixes/new");
    await pageA.getByLabel("What is wrong?").fill("Bathroom extractor fan not working");
    await pageA.getByLabel("Room (optional)").fill("Bathroom");
    await pageA.getByRole("button", { name: "Report problem" }).click();
    await expect(pageA).toHaveURL(/\/more\/fixes\/[0-9a-f-]{36}$/);
    const reportUrl = pageA.url();
    await expect(pageA.getByText(/Nobody chasing/)).toBeVisible();

    // B sees it in the list and in the inbox, and takes the chase.
    await pageB.goto("/notifications");
    await expect(pageB.getByText(/reported a problem/)).toBeVisible();
    await pageB.goto("/more/fixes");
    await expect(pageB.getByRole("heading", { name: "Open (1)" })).toBeVisible();
    await pageB.goto(reportUrl);
    await pageB.getByRole("button", { name: /chase this/ }).click();
    await expect(
      pageB.getByRole("listitem").filter({ hasText: "is chasing the landlord" }),
    ).toBeVisible();

    // B sets it in progress.
    await pageB.getByLabel("Status").selectOption("in_progress");
    await pageB.getByRole("button", { name: "Save status" }).click();
    await expect(pageB.getByText(/set it to In progress/)).toBeVisible();

    // A is told and marks it fixed.
    await pageA.goto("/notifications");
    await expect(pageA.getByText(/set "Bathroom extractor fan not working"/)).toBeVisible();
    await pageA.goto(reportUrl);
    await pageA.getByLabel("Status").selectOption("fixed");
    await pageA.getByRole("button", { name: "Save status" }).click();
    await expect(pageA.getByText(/set it to Fixed/)).toBeVisible();

    // Both see the timeline in order.
    for (const page of [pageA, pageB]) {
      await page.goto(reportUrl);
      const text = await page
        .getByRole("list")
        .filter({ hasText: "chasing the landlord" })
        .innerText();
      expect(text.indexOf("is chasing the landlord")).toBeLessThan(text.indexOf("In progress"));
      expect(text.indexOf("In progress")).toBeLessThan(text.indexOf("Fixed"));
    }

    // A person from another flat is sent away.
    await pageStranger.goto(reportUrl);
    await expect(pageStranger).toHaveURL(/\/more\/fixes$/);
    await expect(pageStranger.getByText("Bathroom extractor fan not working")).toHaveCount(0);
  });
});
