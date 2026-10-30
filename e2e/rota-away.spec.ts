import { expect, test, type Browser, type Page } from "@playwright/test";

import { addDays, upcomingWeekStart } from "../src/features/rota/week";

import { profileIdFor, runLocalSql } from "./support/database";
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

async function pageFor(browser: Browser, baseURL: string, person: { jar: never }) {
  const context = await browser.newContext({ baseURL });
  await addSessionCookies(context, person.jar, baseURL);
  return context.newPage();
}

test.describe("away periods", () => {
  test("a member marks next week as away, flatmates see the dates, and the rota skips them", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("away-host"));
    await createFlat(host.supabase, "Away Flat");
    const second = await signUpAndIn(newTestUser("away-two"));
    await joinFlat(host.supabase, second.supabase);
    const third = await signUpAndIn(newTestUser("away-three"));
    await joinFlat(host.supabase, third.supabase);

    const hostPage: Page = await pageFor(browser, baseURL!, host as never);
    const secondPage: Page = await pageFor(browser, baseURL!, second as never);
    const thirdPage: Page = await pageFor(browser, baseURL!, third as never);

    const week = upcomingWeekStart(new Date());

    // The third flatmate marks the whole of next week as away, with a note.
    await thirdPage.goto("/rota/availability");
    await expect(
      thirdPage.getByText("Away from chores. Rent and bills still apply."),
    ).toBeVisible();
    await thirdPage.getByLabel("Away from").fill(week);
    await thirdPage.getByLabel("to", { exact: true }).fill(addDays(week, 6));
    await thirdPage.getByLabel("Note, optional").fill("Visiting family");
    await thirdPage.getByRole("button", { name: "Mark as away" }).click();
    await expect(thirdPage.getByText("Saved. Chores skip those days.")).toBeVisible();
    await expect(thirdPage.getByText(/You are away/)).toBeVisible();

    // A flatmate sees the dates and the note, on the availability screen and on the rota.
    await secondPage.goto("/rota/availability");
    await expect(secondPage.getByText(/is away .*Visiting family/)).toBeVisible();
    await secondPage.goto("/rota");
    await expect(secondPage.getByText(/is away .*Visiting family/)).toBeVisible();

    // The week is given out. Nothing goes to the person who is away.
    await hostPage.goto("/rota/chores");
    await hostPage.getByRole("button", { name: "Load the usual five" }).click();
    await expect(hostPage.getByRole("heading", { name: "Kitchen" })).toBeVisible();
    await hostPage.getByRole("button", { name: "Give out the week" }).click();
    await expect(hostPage.getByText(/The week is ready/)).toBeVisible();

    const mine = (email: string) =>
      Number(
        runLocalSql(
          `select count(*) from public.chore_assignments where superseded_at is null and assignee = '${profileIdFor(email)}'`,
        ),
      );
    expect(mine(third.user.email)).toBe(0);
    expect(mine(host.user.email) + mine(second.user.email)).toBeGreaterThan(0);

    // The others share the work between them.
    await hostPage.goto("/rota");
    await secondPage.goto("/rota");
    const shared =
      (await hostPage.locator('a[href^="/rota/assignments/"]').count()) +
      (await secondPage.locator('a[href^="/rota/assignments/"]').count());
    expect(shared).toBeGreaterThan(0);

    // Ending it frees the days again.
    await thirdPage.goto("/rota/availability");
    await thirdPage.getByRole("button", { name: "End my away period" }).click();
    await expect(thirdPage.getByText(/You are away/)).toHaveCount(0);
  });
});
