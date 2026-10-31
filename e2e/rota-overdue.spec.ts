import { expect, test, type Browser, type Page } from "@playwright/test";

import { addDays, currentWeekStart } from "../src/features/rota/week";

import { profileIdFor, runLocalSql } from "./support/database";
import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";

// Two people in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "several people in the shared database");
});

async function pageFor(browser: Browser, baseURL: string, person: { jar: never }) {
  const context = await browser.newContext({ baseURL });
  await addSessionCookies(context, person.jar, baseURL);
  return context.newPage();
}

test.describe("overdue chores", () => {
  test("an unfinished chore from last week can be covered or excused, and neither is finished work", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("overdue-host"));
    await createFlat(host.supabase, "Overdue Flat");
    const second = await signUpAndIn(newTestUser("overdue-two"));
    await joinFlat(host.supabase, second.supabase);
    const hostPage: Page = await pageFor(browser, baseURL!, host as never);
    const secondPage: Page = await pageFor(browser, baseURL!, second as never);

    await hostPage.goto("/rota/chores");
    await hostPage.getByRole("button", { name: "Load the usual five" }).click();
    await expect(hostPage.getByRole("heading", { name: "Kitchen" })).toBeVisible();

    // Last week the second person had Kitchen and Bins and did neither; this week they have Kitchen.
    const thisWeek = currentWeekStart(new Date());
    const lastWeek = addDays(thisWeek, -7);
    const secondId = profileIdFor(second.user.email);
    const household = runLocalSql(
      `select household_id from public.memberships where profile_id = '${secondId}'`,
    );
    const chore = (name: string) =>
      runLocalSql(
        `select id from public.chores where household_id = '${household}' and name = '${name}'`,
      );
    const entry = (name: string, dueOn: string, why: string) =>
      `jsonb_build_object('choreId', '${chore(name)}', 'assignee', '${secondId}', 'dueOn', '${dueOn}', 'explanation', '${why}')`;
    runLocalSql(`
      select private.rota_store_week(now() - interval '7 days', '${household}', '${lastWeek}', 'weekly', null,
        jsonb_build_array(${entry("Kitchen", addDays(lastWeek, 3), "old")}, ${entry("Bins", addDays(lastWeek, 2), "old")}), '[]'::jsonb)
    `);
    runLocalSql(`
      select private.rota_store_week(now(), '${household}', '${thisWeek}', 'weekly', null,
        jsonb_build_array(${entry("Kitchen", addDays(thisWeek, 3), "new")}), '[]'::jsonb)
    `);

    // The person who skipped them sees both, with a way to cover only the one that repeats.
    await secondPage.goto("/rota");
    await expect(secondPage.getByText(/Only chores that are done count/)).toBeVisible();
    await expect(
      secondPage.getByRole("button", { name: /Covered by this week.s Kitchen/ }),
    ).toBeVisible();
    await expect(
      secondPage.getByRole("button", { name: /Covered by this week.s Bins/ }),
    ).toHaveCount(0);
    await expect(secondPage.getByRole("button", { name: /^Excuse/ })).toHaveCount(0);

    // Covering closes it, and the database records what covered it.
    await secondPage.getByRole("button", { name: /Covered by this week.s Kitchen/ }).click();
    await expect(
      secondPage.getByRole("button", { name: /Covered by this week.s Kitchen/ }),
    ).toHaveCount(0);
    expect(
      runLocalSql(
        `select covered_by is not null from public.chore_assignments where household_id = '${household}' and chore_name = 'Kitchen' and due_on = '${addDays(lastWeek, 3)}'`,
      ),
    ).toBe("t");

    // An admin sees what is left and excuses it.
    await hostPage.goto("/rota");
    await expect(hostPage.getByText(/Only chores that are done count/)).toBeVisible();
    await hostPage.getByRole("button", { name: /^Excuse/ }).click();
    await expect(hostPage.getByText(/Only chores that are done count/)).toHaveCount(0);
    expect(
      runLocalSql(
        `select excused_by is not null from public.chore_assignments where household_id = '${household}' and chore_name = 'Bins'`,
      ),
    ).toBe("t");

    await secondPage.goto("/rota");
    await expect(secondPage.getByText(/Only chores that are done count/)).toHaveCount(0);
  });
});
