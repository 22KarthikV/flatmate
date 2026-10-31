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
  test.skip(test.info().project.name !== "desktop-chrome", "several people in the shared database");
});

test.describe("the shopping list", () => {
  test("one person adds, another ticks and turns the items into an expense, a stranger sees nothing", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("shop-a"));
    await createFlat(host.supabase, "Shopping Flat");
    const joiner = await signUpAndIn(newTestUser("shop-b"));
    await joinFlat(host.supabase, joiner.supabase);
    const stranger = await signUpAndIn(newTestUser("shop-c"));
    await createFlat(stranger.supabase, "Other Flat");

    const pages = [];
    for (const person of [host, joiner, stranger]) {
      const context = await browser.newContext({ baseURL: baseURL! });
      await addSessionCookies(context, person.jar, baseURL!);
      pages.push(await context.newPage());
    }
    const [hostPage, joinerPage, strangerPage] = pages;

    await hostPage.goto("/more/shopping");
    for (const name of ["Milk", "Bin bags"]) {
      await hostPage.getByLabel("What does the flat need?").fill(name);
      await hostPage.getByRole("button", { name: "Add to list" }).click();
      await expect(hostPage.getByText(name, { exact: true })).toBeVisible();
    }

    await joinerPage.goto("/more/shopping");
    await expect(joinerPage.getByText("Milk", { exact: true })).toBeVisible();
    await expect(joinerPage.getByText("Bin bags", { exact: true })).toBeVisible();
    await joinerPage.getByRole("button", { name: "Mark Milk as bought" }).click();
    await expect(joinerPage.getByRole("heading", { name: "Bought (1)" })).toBeVisible();
    await joinerPage.getByRole("button", { name: "Mark Bin bags as bought" }).click();
    await expect(joinerPage.getByRole("heading", { name: "Bought (2)" })).toBeVisible();

    await joinerPage.getByRole("link", { name: "Turn into an expense" }).click();
    await expect(joinerPage.getByLabel("What was it for?")).toHaveValue(/^Shopping: /);
    await joinerPage.getByLabel("Amount (£)").fill("6");
    await joinerPage.getByRole("button", { name: "Add expense" }).click();
    await expect(joinerPage).toHaveURL(/\/money\/expenses\/[0-9a-f-]{36}$/);

    // The host is told by the ledger's normal message and owes £3.00.
    await hostPage.goto("/money");
    await expect(hostPage.getByText("You owe £3.00")).toBeVisible();
    await hostPage.goto("/notifications");
    await expect(hostPage.getByText(/added Shopping: /)).toBeVisible();

    await joinerPage.goto("/more/shopping");
    await expect(joinerPage.getByRole("heading", { name: "Added to expenses (2)" })).toBeVisible();
    await expect(joinerPage.getByRole("link", { name: "Expense" }).first()).toBeVisible();

    // Another flat sees none of it.
    await strangerPage.goto("/more/shopping");
    await expect(strangerPage.getByText(/Nothing on the list/)).toBeVisible();
    await expect(strangerPage.getByText("Milk", { exact: true })).toHaveCount(0);

    // Asking for the buy page with another flat's ids goes back to the list.
    await strangerPage.goto("/more/shopping/buy?items=b0000000-0000-0000-0000-000000000001");
    await expect(strangerPage).toHaveURL(/\/more\/shopping$/);
  });
});
