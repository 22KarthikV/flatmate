import { expect, test } from "@playwright/test";

import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";

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

  test("Share sends a message naming the flat, and pasting that whole message opens the invite", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("sharer"));
    await createFlat(host.supabase, "The Old Bakery");
    const hostContext = await browser.newContext({ baseURL });
    await addSessionCookies(hostContext, host.jar, baseURL!);
    const hostPage = await hostContext.newPage();
    // Chrome on desktop has no share sheet, so stand in for one and keep what it was given.
    await hostPage.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          (window as unknown as { __shared: ShareData }).__shared = data;
        },
      });
    });

    await hostPage.goto("/more/flat");
    await hostPage.getByRole("button", { name: "Make a link" }).click();
    const link = await hostPage.getByLabel("Your link").inputValue();
    await hostPage.getByRole("button", { name: "Share", exact: true }).click();
    const shared = await hostPage.evaluate(
      () => (window as unknown as { __shared: ShareData }).__shared,
    );
    expect(shared.title).toBe("Join The Old Bakery on FlatMate");
    expect(shared.text).toContain("chosen for The Old Bakery");
    expect(shared.url).toBe(link);

    // What a chat app shows the flatmate is the text and the link together. Pasting all of it works.
    const joiner = await signUpAndIn(newTestUser("pasted"));
    const joinerContext = await browser.newContext({ baseURL });
    await addSessionCookies(joinerContext, joiner.jar, baseURL!);
    const joinerPage = await joinerContext.newPage();
    await joinerPage.goto("/dashboard");
    await joinerPage.getByLabel("Paste the link here").fill(`${shared.text}\n${shared.url}\n`);
    await joinerPage.getByRole("button", { name: "Open invite" }).click();
    await expect(joinerPage).toHaveURL(/\/join\/[A-Za-z0-9_-]{43}$/);
    await expect(
      joinerPage.getByRole("heading", { level: 2, name: "The Old Bakery" }),
    ).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });
});

test.describe("members and roles", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== "desktop-chrome",
      "several people in the shared database",
    );
  });

  test("the owner promotes, demotes and removes; the removed person starts over", async ({
    browser,
    baseURL,
  }) => {
    const owner = await signUpAndIn(newTestUser("owner"));
    await createFlat(owner.supabase, "Roles Flat");
    const ben = await signUpAndIn(newTestUser("ben"));
    const cat = await signUpAndIn(newTestUser("cat"));
    await joinFlat(owner.supabase, ben.supabase);
    await joinFlat(owner.supabase, cat.supabase);

    const ownerContext = await browser.newContext({ baseURL });
    await addSessionCookies(ownerContext, owner.jar, baseURL!);
    const page = await ownerContext.newPage();
    await page.goto("/more/flat");

    await expect(page.getByText("Members · 3")).toBeVisible();
    const rows = page.getByText("Members · 3").locator("..").getByRole("listitem");
    const benName = ben.user.email.split("@")[0];
    const catName = cat.user.email.split("@")[0];
    const benRow = rows.filter({ hasText: benName });
    const catRow = rows.filter({ hasText: catName });

    // The owner has no controls on themselves.
    await expect(rows.filter({ hasText: "(you)" }).getByRole("button")).toHaveCount(0);

    await benRow.getByRole("button", { name: "Make admin" }).click();
    await expect(benRow.getByText("Admin")).toBeVisible();
    await benRow.getByRole("button", { name: "Make member" }).click();
    await expect(benRow.getByText("Member")).toBeVisible();

    await catRow.getByRole("button", { name: "Remove" }).click();
    await catRow.getByRole("button", { name: `Remove ${catName}` }).click();
    await expect(page.getByText("Members · 2")).toBeVisible();
    await expect(page.getByText(catName)).toHaveCount(0);

    // The removed person is back to the start: create or join.
    const catContext = await browser.newContext({ baseURL });
    await addSessionCookies(catContext, cat.jar, baseURL!);
    const catPage = await catContext.newPage();
    await catPage.goto("/dashboard");
    await expect(catPage.getByRole("heading", { name: "Create your flat" })).toBeVisible();
    await catPage.goto("/rota");
    await expect(
      catPage.getByRole("heading", { level: 1, name: "Set up your flat first" }),
    ).toBeVisible();

    await Promise.all([ownerContext.close(), catContext.close()]);
  });

  test("a plain member sees the list but no controls", async ({ browser, baseURL }) => {
    const owner = await signUpAndIn(newTestUser("owner2"));
    await createFlat(owner.supabase, "Quiet Flat");
    const dee = await signUpAndIn(newTestUser("dee"));
    await joinFlat(owner.supabase, dee.supabase);

    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, dee.jar, baseURL!);
    const page = await context.newPage();
    await page.goto("/more/flat");

    await expect(page.getByText("Members · 2")).toBeVisible();
    await expect(page.getByText("Members · 2").locator("..").getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /Make|Remove/ })).toHaveCount(0);
    await context.close();
  });
});

test.describe("leaving a flat", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== "desktop-chrome",
      "several people in the shared database",
    );
  });

  test("a member leaves and can rejoin; the owner hands over, then closes when alone", async ({
    browser,
    baseURL,
  }) => {
    const owner = await signUpAndIn(newTestUser("lowner"));
    await createFlat(owner.supabase, "Leaving Flat");
    const finn = await signUpAndIn(newTestUser("finn"));
    await joinFlat(owner.supabase, finn.supabase);

    const finnContext = await browser.newContext({ baseURL });
    await addSessionCookies(finnContext, finn.jar, baseURL!);
    const finnPage = await finnContext.newPage();
    await finnPage.goto("/more/flat");

    // A member leaves after confirming, and lands on create-or-join.
    await finnPage.getByRole("button", { name: "Leave flat" }).click();
    await finnPage.getByRole("button", { name: "Leave flat" }).click();
    await expect(finnPage).toHaveURL(/\/dashboard$/);
    await expect(finnPage.getByRole("heading", { name: "Create your flat" })).toBeVisible();

    // They can come back with a fresh link.
    await joinFlat(owner.supabase, finn.supabase);
    await finnPage.reload();
    await expect(finnPage.getByRole("heading", { level: 2, name: "Leaving Flat" })).toBeVisible();

    // The owner cannot leave: they hand over instead, then (now an admin) can leave.
    const ownerContext = await browser.newContext({ baseURL });
    await addSessionCookies(ownerContext, owner.jar, baseURL!);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/more/flat");
    await expect(ownerPage.getByRole("button", { name: "Leave flat" })).toHaveCount(0);

    const finnName = finn.user.email.split("@")[0];
    await ownerPage.getByLabel("New owner").selectOption({ label: finnName });
    await ownerPage.getByRole("button", { name: "Hand over ownership" }).click();
    await expect(ownerPage.getByRole("button", { name: "Leave flat" })).toBeVisible();

    await ownerPage.getByRole("button", { name: "Leave flat" }).click();
    await ownerPage.getByRole("button", { name: "Leave flat" }).click();
    await expect(ownerPage).toHaveURL(/\/dashboard$/);

    // Finn is the owner now and alone, so can close the flat.
    await finnPage.goto("/more/flat");
    await finnPage.getByRole("button", { name: "Close flat" }).click();
    await finnPage.getByRole("button", { name: "Close flat" }).click();
    await expect(finnPage).toHaveURL(/\/dashboard$/);
    await expect(finnPage.getByRole("heading", { name: "Create your flat" })).toBeVisible();

    await Promise.all([finnContext.close(), ownerContext.close()]);
  });
});

test.describe("deleting an account that belongs to a flat", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== "desktop-chrome",
      "several people in the shared database",
    );
  });

  async function deleteViaUi(page: import("@playwright/test").Page) {
    await page.goto("/more/account");
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByLabel(/type delete/i).fill("DELETE");
    await page.getByRole("button", { name: "Delete my account" }).click();
  }

  test("a member who deletes their account disappears from the flat", async ({
    browser,
    baseURL,
  }) => {
    const owner = await signUpAndIn(newTestUser("downer"));
    await createFlat(owner.supabase, "Deletion Flat");
    const gus = await signUpAndIn(newTestUser("gus"));
    await joinFlat(owner.supabase, gus.supabase);

    const ownerContext = await browser.newContext({ baseURL });
    await addSessionCookies(ownerContext, owner.jar, baseURL!);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/more/flat");
    await expect(ownerPage.getByText("Members · 2")).toBeVisible();

    const gusContext = await browser.newContext({ baseURL });
    await addSessionCookies(gusContext, gus.jar, baseURL!);
    const gusPage = await gusContext.newPage();
    await deleteViaUi(gusPage);
    await expect(gusPage).toHaveURL(/\/sign-in\?deleted=1$/);

    await ownerPage.reload();
    await expect(ownerPage.getByText("Members · 1")).toBeVisible();

    // Their history would read "Deleted user": the profile row survives, anonymised.
    const { data } = await owner.supabase.from("profiles").select("display_name");
    expect(data?.map((row) => row.display_name)).toContain("Deleted user");

    await Promise.all([ownerContext.close(), gusContext.close()]);
  });

  test("an owner with flatmates is told to hand over first, and keeps their account", async ({
    browser,
    baseURL,
  }) => {
    const owner = await signUpAndIn(newTestUser("stubborn"));
    await createFlat(owner.supabase, "Held Flat");
    const hal = await signUpAndIn(newTestUser("hal"));
    await joinFlat(owner.supabase, hal.supabase);

    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, owner.jar, baseURL!);
    const page = await context.newPage();
    await deleteViaUi(page);

    await expect(page.getByText("Hand it over to someone else first")).toBeVisible();
    await page.goto("/more/account");
    await expect(page.getByLabel("Display name")).toBeVisible();
    await page.goto("/more/flat");
    await expect(page.getByText("Members · 2")).toBeVisible();
    await context.close();
  });

  test("a lone owner can delete their account, which closes the flat", async ({
    browser,
    baseURL,
  }) => {
    const owner = await signUpAndIn(newTestUser("alone"));
    await createFlat(owner.supabase, "Solo Flat");

    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, owner.jar, baseURL!);
    const page = await context.newPage();
    await deleteViaUi(page);
    await expect(page).toHaveURL(/\/sign-in\?deleted=1$/);
    await context.close();
  });
});

test.describe("the setup checklist", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== "desktop-chrome",
      "several people in the shared database",
    );
  });

  test("guides the owner to invite flatmates, ticks itself off, then goes away", async ({
    browser,
    baseURL,
  }) => {
    const owner = await signUpAndIn(newTestUser("setup"));
    await createFlat(owner.supabase, "Setup Flat");

    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, owner.jar, baseURL!);
    const page = await context.newPage();
    await page.goto("/dashboard");

    await expect(page.getByText("Set up your flat")).toBeVisible();
    await expect(page.getByText("Invite your flatmates")).toBeVisible();
    await page.getByRole("link", { name: "Do this now" }).click();
    await expect(page).toHaveURL(/\/more\/flat$/);

    // Someone joins; Home no longer asks.
    const joiner = await signUpAndIn(newTestUser("setupjoin"));
    await joinFlat(owner.supabase, joiner.supabase);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 2, name: "Setup Flat" })).toBeVisible();
    await expect(page.getByText("Set up your flat")).toHaveCount(0);
    await context.close();
  });

  test("a member of a flat that already has company sees no set-up prompts", async ({
    browser,
    baseURL,
  }) => {
    // The member note only appears while a step is open; with one step that is when the owner is
    // alone, so a joined member sees nothing. The note itself is covered by unit tests.
    const owner = await signUpAndIn(newTestUser("setupnote"));
    await createFlat(owner.supabase, "Note Flat");
    const member = await signUpAndIn(newTestUser("setupmember"));
    await joinFlat(owner.supabase, member.supabase);

    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, member.jar, baseURL!);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 2, name: "Note Flat" })).toBeVisible();
    await expect(page.getByText("Set up your flat")).toHaveCount(0);
    await expect(page.getByText(/still setting the flat up/)).toHaveCount(0);
    await context.close();
  });
});

test.describe("live updates", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== "desktop-chrome",
      "several people in the shared database",
    );
  });

  test("an open members list and Home update the moment someone joins", async ({
    browser,
    baseURL,
  }) => {
    const owner = await signUpAndIn(newTestUser("live"));
    await createFlat(owner.supabase, "Live Flat");

    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, owner.jar, baseURL!);
    const page = await context.newPage();
    await page.goto("/more/flat");
    await expect(page.getByText("Members · 1")).toBeVisible();

    // Someone joins while the page is open. Nothing is clicked or reloaded here.
    const joiner = await signUpAndIn(newTestUser("livejoin"));
    await joinFlat(owner.supabase, joiner.supabase);

    await expect(page.getByText("Members · 2")).toBeVisible({ timeout: 15_000 });
    await context.close();
  });
});
