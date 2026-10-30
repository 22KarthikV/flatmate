import { expect, test, type Browser, type Page } from "@playwright/test";

import { planRebuild } from "../src/features/rota/rebuild";

import { runLocalSql } from "./support/database";
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

/** Does what the rota-generate Edge Function does for the pending rebuilds, against the local database. */
function runRebuildJob(): number {
  const ids = runLocalSql("select rebuild_id from public.rota_pending_rebuilds()")
    .split("\n")
    .filter(Boolean);
  for (const id of ids) {
    const input = JSON.parse(runLocalSql(`select public.rota_rebuild_input('${id}')`));
    const moves = JSON.stringify(planRebuild(input)).replace(/'/g, "''");
    runLocalSql(`select public.rota_apply_rebuild('${id}', '${moves}'::jsonb)`);
  }
  return ids.length;
}

test.describe("when someone leaves", () => {
  test("their chores are given out, an admin sees what moved and can undo it", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("leave-host"));
    await createFlat(host.supabase, "Leaving Rota Flat");
    const second = await signUpAndIn(newTestUser("leave-two"));
    await joinFlat(host.supabase, second.supabase);
    const third = await signUpAndIn(newTestUser("leave-three"));
    await joinFlat(host.supabase, third.supabase);

    const hostPage: Page = await pageFor(browser, baseURL!, host as never);
    const thirdPage: Page = await pageFor(browser, baseURL!, third as never);

    await hostPage.goto("/rota/chores");
    await hostPage.getByRole("button", { name: "Load the usual five" }).click();
    await expect(hostPage.getByRole("heading", { name: "Kitchen" })).toBeVisible();
    await hostPage.getByRole("button", { name: "Give out the week" }).click();
    await expect(hostPage.getByText(/The week is ready/)).toBeVisible();

    // Nothing to show an admin yet.
    await hostPage.goto("/rota");
    await expect(hostPage.getByText("After someone left")).toHaveCount(0);

    // The third flatmate leaves.
    await thirdPage.goto("/more/flat");
    await thirdPage.getByRole("button", { name: "Leave flat" }).click();
    await thirdPage.getByRole("button", { name: "Leave flat" }).click();
    await expect(thirdPage).toHaveURL(/\/dashboard$/);

    // Until the job has run, nothing has moved. Then it does.
    expect(runRebuildJob()).toBeGreaterThan(0);

    await hostPage.goto("/rota");
    await expect(hostPage.getByText("After someone left")).toBeVisible();
    await expect(hostPage.getByText(/chores? (was|were) given to other people/)).toBeVisible();
    await expect(hostPage.getByText(/You can undo this until/)).toBeVisible();

    const undo = hostPage.getByRole("button", { name: /Undo the changes after .* left/ });
    await undo.click();
    await expect(hostPage.getByText("After someone left")).toHaveCount(0);
  });
});
