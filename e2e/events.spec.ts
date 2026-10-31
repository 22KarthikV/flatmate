import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";

// Several people in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "several people in the shared database");
});

async function pageFor(browser: Browser, baseURL: string, person: { jar: never }) {
  const context = await browser.newContext({ baseURL });
  await addSessionCookies(context, person.jar, baseURL);
  return context.newPage();
}

/** `YYYY-MM-DDT19:30` some days from now, the value a datetime-local input takes. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 10)}T19:30`;
}

test.describe("events", () => {
  test("three flatmates plan an evening: propose, vote, confirm, cancel", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("ev-host"));
    await createFlat(host.supabase, "Events Flat");
    const second = await signUpAndIn(newTestUser("ev-two"));
    await joinFlat(host.supabase, second.supabase);
    const third = await signUpAndIn(newTestUser("ev-three"));
    await joinFlat(host.supabase, third.supabase);
    const outsider = await signUpAndIn(newTestUser("ev-outsider"));
    await createFlat(outsider.supabase, "Somewhere Else");

    const hostPage: Page = await pageFor(browser, baseURL!, host as never);
    const secondPage: Page = await pageFor(browser, baseURL!, second as never);
    const thirdPage: Page = await pageFor(browser, baseURL!, third as never);
    const outsiderPage: Page = await pageFor(browser, baseURL!, outsider as never);

    // The host proposes Pizza night with two dates.
    await hostPage.goto("/events");
    await expect(hostPage.getByText("No events yet.")).toBeVisible();
    await hostPage.getByRole("link", { name: "Propose an event" }).click();
    await hostPage.getByLabel("What is it?").fill("Pizza night");
    await hostPage.getByLabel("Where (optional)").fill("Our kitchen");
    await hostPage.getByLabel("Date 1").fill(inDays(10));
    await hostPage.getByLabel("Date 2").fill(inDays(11));
    await hostPage.getByRole("button", { name: "Propose it" }).click();
    await expect(hostPage.getByRole("heading", { name: "Pizza night" })).toBeVisible();
    await expect(hostPage.getByText("Voting open")).toBeVisible();
    const eventUrl = hostPage.url();

    // The other two are asked to vote. Nothing is confirmed after one yes of three.
    await secondPage.goto("/events");
    await expect(secondPage.getByRole("heading", { name: "Needs your vote" })).toBeVisible();
    await secondPage.getByRole("link", { name: /Pizza night/ }).click();
    const secondGroup = secondPage.getByRole("group").first();
    await secondGroup.getByRole("button", { name: /^Yes/ }).click();
    await expect(secondGroup.getByRole("button", { name: /^Yes/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(secondPage.getByText("1 yes, 0 maybe, 0 no").first()).toBeVisible();
    await expect(secondPage.getByText("Voting open").first()).toBeVisible();

    // The second yes on the same date makes two of three, and the event is confirmed.
    await thirdPage.goto(eventUrl);
    await thirdPage.getByRole("group").first().getByRole("button", { name: /^Yes/ }).click();
    await expect(thirdPage.getByText("Confirmed")).toBeVisible();
    await expect(thirdPage.getByText("Chosen")).toBeVisible();
    await expect(thirdPage.getByRole("button", { name: /^Yes/ })).toHaveCount(0);

    // The host sees it as coming up, and everyone is told.
    await hostPage.goto("/events");
    await expect(hostPage.getByRole("heading", { name: "Coming up" })).toBeVisible();
    await hostPage.goto("/notifications");
    await expect(hostPage.getByText(/Pizza night is on:/)).toBeVisible();

    // The calendar shows the confirmed event to the flat, and no money.
    await hostPage.goto("/events/calendar");
    await expect(hostPage.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(hostPage.getByRole("link", { name: /Pizza night/ }).first()).toBeVisible();
    expect(await hostPage.locator("main").innerText()).not.toMatch(/£|pence/);

    // On a 360px phone nothing scrolls sideways and the answer buttons are tall enough to tap.
    await hostPage.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/events", "/events/new", "/events/calendar", new URL(eventUrl).pathname]) {
      await hostPage.goto(path);
      await expect(hostPage.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await hostPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `sideways scroll on ${path}`).toBeLessThanOrEqual(0);
    }
    await hostPage.setViewportSize({ width: 1280, height: 720 });

    // Somebody in another flat cannot open it.
    await outsiderPage.goto(eventUrl);
    await expect(outsiderPage.getByText("We couldn’t find that event.")).toBeVisible();
    await expect(outsiderPage.getByText("Pizza night")).toHaveCount(0);

    // The host cancels it and a flatmate sees that.
    await hostPage.goto(eventUrl);
    await hostPage.getByLabel("Reason (optional)").fill("Oven broke");
    await hostPage.getByRole("button", { name: "Cancel the event" }).click();
    await expect(hostPage.getByText(/Oven broke/)).toBeVisible();
    await secondPage.goto(eventUrl);
    await expect(secondPage.getByText(/Oven broke/)).toBeVisible();
    await expect(secondPage.getByText("Cancelled").first()).toBeVisible();
  });
});
