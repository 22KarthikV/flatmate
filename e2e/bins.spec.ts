import { expect, test } from "@playwright/test";

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

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

test.describe("bin days", () => {
  test("an admin sets up bins, a member sees the dates, a skip removes one, a member cannot manage", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("bins-admin"));
    await createFlat(host.supabase, "Bins Flat");
    const joiner = await signUpAndIn(newTestUser("bins-member"));
    await joinFlat(host.supabase, joiner.supabase);

    const pages = [];
    for (const person of [host, joiner]) {
      const context = await browser.newContext({ baseURL: baseURL! });
      await addSessionCookies(context, person.jar, baseURL!);
      pages.push(await context.newPage());
    }
    const [adminPage, memberPage] = pages;

    // Empty state for a member.
    await memberPage.goto("/more/bins");
    await expect(memberPage.getByText(/Ask an admin to add them/)).toBeVisible();

    // The admin adds two bins collected from today.
    await adminPage.goto("/more/bins/manage");
    const addCard = adminPage.locator("form").filter({ hasText: "Add bin" }).last();
    await addCard.getByLabel("Name").fill("Grey bin");
    await addCard.getByLabel("A date it was collected").fill(isoDate(0));
    await addCard.getByRole("button", { name: "Add bin" }).click();
    await expect(adminPage.getByText("Grey bin").first()).toBeVisible();

    const addAgain = adminPage.locator("form").filter({ hasText: "Add bin" }).last();
    await addAgain.getByLabel("Name").fill("Blue box");
    await addAgain.getByLabel("Colour").selectOption("blue");
    await addAgain.getByLabel("How often").selectOption("2");
    await addAgain.getByLabel("A date it was collected").fill(isoDate(0));
    await addAgain.getByRole("button", { name: "Add bin" }).click();
    await expect(adminPage.locator("p", { hasText: "Every 2 weeks" })).toBeVisible();

    // The member sees both, with today in words.
    await memberPage.goto("/more/bins");
    await expect(memberPage.getByText("Today")).toBeVisible();
    await expect(memberPage.getByText("Grey bin").first()).toBeVisible();
    await expect(memberPage.getByText("Blue box").first()).toBeVisible();
    const greyBefore = await memberPage.getByText("Grey bin").count();

    // The admin skips the next week's grey bin collection.
    await adminPage.goto("/more/bins/manage");
    await adminPage.getByLabel("Which bin").selectOption({ label: "Grey bin" });
    await adminPage.getByLabel("Which collection").selectOption({ index: 1 });
    await adminPage.getByRole("button", { name: "Save change" }).click();
    await expect(adminPage.getByText("not collected")).toBeVisible();

    await memberPage.goto("/more/bins");
    expect(await memberPage.getByText("Grey bin").count()).toBe(greyBefore - 1);

    // A member cannot reach the set-up controls.
    await memberPage.goto("/more/bins/manage");
    await expect(memberPage.getByText("Only admins set up bins")).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Add bin" })).toHaveCount(0);
  });
});
