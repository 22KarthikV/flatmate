import { expect, test } from "@playwright/test";

import {
  ensureSnoozableType,
  notificationDataCount,
  profileIdFor,
  seedNotification,
  seedPushDevice,
} from "./support/database";
import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";

// The notification setup talks to the local database container, so these run once, on desktop.
test.skip(({ isMobile }) => isMobile, "inbox flows are covered on desktop");

test.describe("the inbox and the bell", () => {
  test("a new notification shows on the bell and in the inbox, and opening it marks it read", async ({
    page,
    context,
    baseURL,
  }) => {
    const user = newTestUser("inbox");
    const { jar, supabase } = await signUpAndIn(user);
    await createFlat(supabase, "Inbox flat");
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/notifications");
    await expect(page.getByText("Nothing here yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();

    seedNotification(user.email, {
      title: "You are now an admin",
      dedupeKey: "e2e:role:1",
      href: "/more/flat",
    });
    seedNotification(user.email, {
      title: "Sam joined Inbox flat",
      type: "member_joined",
      dedupeKey: "e2e:joined:1",
      href: "/dashboard",
    });

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Notifications, 2 unread" })).toBeVisible();

    await page.getByRole("link", { name: "Notifications, 2 unread" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("button", { name: /You are now an admin/ })).toBeVisible();

    // Opening one marks it read and follows its link.
    await page.getByRole("button", { name: /You are now an admin/ }).click();
    await expect(page).toHaveURL(/\/more\/flat$/);
    await expect(page.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();

    // Mark all read clears the rest.
    await page.goto("/notifications");
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(0);
  });

  test("one person never sees another's notifications", async ({ page, context, baseURL }) => {
    const other = newTestUser("inbox-other");
    const { supabase: otherClient } = await signUpAndIn(other);
    await createFlat(otherClient, "Other flat");
    seedNotification(other.email, {
      title: "Only for the other person",
      dedupeKey: "e2e:private:1",
    });

    const me = newTestUser("inbox-me");
    const { jar, supabase } = await signUpAndIn(me);
    await createFlat(supabase, "My flat");
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/notifications");
    await expect(page.getByText("Nothing here yet.")).toBeVisible();
    await expect(page.getByText("Only for the other person")).toHaveCount(0);
  });

  test("the bell fits on a phone without sideways scroll", async ({ page, context, baseURL }) => {
    const user = newTestUser("inbox-phone");
    const { jar, supabase } = await signUpAndIn(user);
    await createFlat(supabase, "Phone flat");
    await addSessionCookies(context, jar, baseURL!);
    seedNotification(user.email, {
      title: "A very long notification title to test wrapping",
      dedupeKey: "e2e:wrap:1",
    });

    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ["/dashboard", "/notifications"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("preferences and snooze", () => {
  test("turning a type off stops the next one reaching the inbox, and the choice sticks", async ({
    browser,
    baseURL,
  }) => {
    const a = await signUpAndIn(newTestUser("pref-a"));
    await createFlat(a.supabase, "Pref flat");

    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, a.jar, baseURL!);
    const page = await context.newPage();
    await page.goto("/more");
    // (The bell is also called Notifications, so pick the More entry by where it goes.)
    await page.locator('a[href="/more/notifications"]').click();
    await expect(page).toHaveURL(/\/more\/notifications$/);

    const form = page.getByRole("form", { name: "Someone joins the flat" });
    await expect(form.getByLabel("In the app")).toBeChecked();
    await form.getByLabel("In the app").uncheck();
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST"),
      form.getByRole("button", { name: "Save" }).click(),
    ]);

    await page.reload();
    await expect(form.getByLabel("In the app")).not.toBeChecked();
    // Other types are untouched.
    await expect(
      page.getByRole("form", { name: "Your role changes" }).getByLabel("In the app"),
    ).toBeChecked();

    // B joins: nothing reaches A's inbox.
    const b = await signUpAndIn(newTestUser("pref-b"));
    await joinFlat(a.supabase, b.supabase);
    await page.goto("/notifications");
    await expect(page.getByText("Nothing here yet.")).toBeVisible();
    await context.close();
  });

  test("snoozing a reminder takes it off the badge until it comes back", async ({
    context,
    page,
    baseURL,
  }) => {
    ensureSnoozableType("e2e_reminder");
    const user = newTestUser("snooze");
    const { jar, supabase } = await signUpAndIn(user);
    await createFlat(supabase, "Snooze flat");
    await addSessionCookies(context, jar, baseURL!);
    seedNotification(user.email, {
      title: "Take the bins out",
      type: "e2e_reminder",
      dedupeKey: "e2e:snooze:1",
    });

    await page.goto("/notifications");
    await expect(page.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();
    await page.getByRole("button", { name: "Snooze: In an hour" }).click();

    await expect(page.getByText(/Snoozed until \d\d:\d\d/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Snooze/ })).toHaveCount(0);
  });
});

test.describe("deleting an account", () => {
  test("removes the person's notifications, choices and push devices, and their name from their flatmate's inbox", async ({
    browser,
    baseURL,
  }) => {
    const owner = await signUpAndIn(newTestUser("del-owner"));
    await createFlat(owner.supabase, "Deletion inbox flat");
    const leaver = await signUpAndIn(newTestUser("del-leaver"));
    await joinFlat(owner.supabase, leaver.supabase);
    const leaverName = leaver.user.email.split("@")[0];

    // The leaver has a notification, a saved choice and a registered phone.
    seedNotification(leaver.user.email, { title: "Take the bins out", dedupeKey: "e2e:del:1" });
    await leaver.supabase.rpc("set_notification_preference", {
      p_type: "member_left",
      p_in_app: true,
      p_push: true,
    });
    seedPushDevice(leaver.user.email, "https://push.example/e2e-delete");
    const profileId = profileIdFor(leaver.user.email);
    expect(notificationDataCount(profileId)).toBe(3);

    const leaverContext = await browser.newContext({ baseURL });
    await addSessionCookies(leaverContext, leaver.jar, baseURL!);
    const leaverPage = await leaverContext.newPage();
    await leaverPage.goto("/more/account");
    await leaverPage.getByRole("button", { name: "Delete account" }).click();
    await leaverPage.getByLabel(/type delete/i).fill("DELETE");
    await leaverPage.getByRole("button", { name: "Delete my account" }).click();
    await expect(leaverPage).toHaveURL(/\/sign-in\?deleted=1$/);

    expect(notificationDataCount(profileId)).toBe(0);

    // The owner was told the person joined and then left; neither message keeps their name.
    const ownerContext = await browser.newContext({ baseURL });
    await addSessionCookies(ownerContext, owner.jar, baseURL!);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/notifications");
    await expect(
      ownerPage.getByRole("button", { name: /Deleted user joined Deletion inbox flat/ }),
    ).toBeVisible();
    await expect(
      ownerPage.getByRole("button", { name: /Deleted user left Deletion inbox flat/ }),
    ).toBeVisible();
    await expect(ownerPage.getByText(leaverName)).toHaveCount(0);

    await Promise.all([leaverContext.close(), ownerContext.close()]);
  });
});

test.describe("the live bell", () => {
  test("A's bell count rises the moment B joins, without navigating", async ({
    browser,
    baseURL,
  }) => {
    const a = await signUpAndIn(newTestUser("live-a"));
    await createFlat(a.supabase, "Live bell flat");

    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, a.jar, baseURL!);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
    // Give the page's live connection a moment to open before anything happens.
    await page.waitForTimeout(3000);

    // B joins while A's page is open. Nothing is clicked or reloaded here.
    const b = await signUpAndIn(newTestUser("live-b"));
    await joinFlat(a.supabase, b.supabase);

    await expect(page.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible({
      timeout: 15_000,
    });
    await context.close();
  });
});

test.describe("household events", () => {
  test("a join tells the others, not the joiner; a promotion tells the person promoted", async ({
    browser,
    baseURL,
  }) => {
    const a = await signUpAndIn(newTestUser("evt-a"));
    await createFlat(a.supabase, "Events flat");
    const b = await signUpAndIn(newTestUser("evt-b"));
    await joinFlat(a.supabase, b.supabase);
    const bName = b.user.email.split("@")[0];

    const aContext = await browser.newContext({ baseURL });
    await addSessionCookies(aContext, a.jar, baseURL!);
    const aPage = await aContext.newPage();
    const bContext = await browser.newContext({ baseURL });
    await addSessionCookies(bContext, b.jar, baseURL!);
    const bPage = await bContext.newPage();

    // A hears that B joined.
    await aPage.goto("/notifications");
    await expect(
      aPage.getByRole("button", { name: new RegExp(`${bName} joined Events flat`) }),
    ).toBeVisible();

    // B is told nothing about their own join.
    await bPage.goto("/notifications");
    await expect(bPage.getByText("Nothing here yet.")).toBeVisible();

    // A makes B an admin on the flat page; B's inbox shows it, A's does not.
    await aPage.goto("/more/flat");
    const row = aPage.getByText("Members · 2").locator("..").getByRole("listitem");
    await row.filter({ hasText: bName }).getByRole("button", { name: "Make admin" }).click();
    await expect(row.filter({ hasText: bName }).getByText("Admin")).toBeVisible();

    await bPage.goto("/notifications");
    await expect(bPage.getByRole("button", { name: /You are now an admin/ })).toBeVisible();

    await aPage.goto("/notifications");
    await expect(aPage.getByRole("button", { name: /You are now an admin/ })).toHaveCount(0);

    await Promise.all([aContext.close(), bContext.close()]);
  });
});
