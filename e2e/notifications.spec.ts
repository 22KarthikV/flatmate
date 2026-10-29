import { expect, test } from "@playwright/test";

import { seedNotification } from "./support/database";
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
