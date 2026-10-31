import { expect, test, type Page } from "@playwright/test";

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
  test.skip(test.info().project.name !== "desktop-chrome", "three people in the shared database");
});

const sql = (text: string) => runLocalSql(text);

/** A due date 10 to 14 days ahead whose day of the month is 28 or less (a due day is 1 to 28). */
function dueDate(): Date {
  for (let ahead = 10; ahead <= 14; ahead += 1) {
    const date = new Date(Date.now() + ahead * 86_400_000);
    if (date.getUTCDate() <= 28) return date;
  }
  throw new Error("no due date");
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
const daysFrom = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const noon = (date: Date) => `${iso(date)} 12:00:00+00`;

test.describe("the home page", () => {
  test("a new flat is invited to grow; a three-person flat sees only what is theirs; admins see their extras", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(180_000);

    const host = await signUpAndIn(newTestUser("home-host"));
    await createFlat(host.supabase, "Home Flat");
    const open = async (jar: typeof host.jar): Promise<Page> => {
      const context = await browser.newContext({ baseURL: baseURL! });
      await addSessionCookies(context, jar, baseURL!);
      return context.newPage();
    };
    const hostPage = await open(host.jar);

    // --- A brand-new one-person flat gets a friendly start, not empty boxes.
    await hostPage.goto("/dashboard");
    await expect(
      hostPage.getByRole("heading", { name: "Bring your flatmates in to get started" }),
    ).toBeVisible();
    await expect(hostPage.getByText("Waiting on you")).toHaveCount(0);

    // --- Two flatmates join.
    const alice = await signUpAndIn(newTestUser("home-alice"));
    await joinFlat(host.supabase, alice.supabase);
    const bob = await signUpAndIn(newTestUser("home-bob"));
    await joinFlat(host.supabase, bob.supabase);
    const [alicePage, bobPage] = await Promise.all([open(alice.jar), open(bob.jar)]);
    const nameOf = (email: string) =>
      sql(
        `select p.display_name from public.profiles p join auth.users u on u.id = p.user_id where u.email = '${email}'`,
      );
    const aliceName = nameOf(alice.user.email);
    const bobName = nameOf(bob.user.email);

    // --- Rent (host in a front room, Alice and Bob sharing a big one) and a gas bill paid by Alice.
    const due = dueDate();
    const dueDay = String(due.getUTCDate());
    await hostPage.goto("/money/recurring/new");
    await hostPage.getByRole("button", { name: "Rent", exact: true }).click();
    await hostPage.getByLabel("Due on the").selectOption(dueDay);
    await hostPage.getByLabel("Room 1 name").fill("Front");
    await hostPage.getByLabel("Room's rent each month (£)").first().fill("800");
    const rooms = () => hostPage.locator("fieldset").filter({ hasText: "Who lives here?" });
    const hostName = nameOf(host.user.email);
    await rooms().nth(0).getByLabel(hostName, { exact: true }).check();
    await hostPage.getByRole("button", { name: "Add a room" }).click();
    await hostPage.getByLabel("Room 2 name").fill("Big room");
    await hostPage.getByLabel("Room's rent each month (£)").nth(1).fill("1200");
    await rooms().nth(1).getByLabel(aliceName, { exact: true }).check();
    await rooms().nth(1).getByLabel(bobName, { exact: true }).check();
    await hostPage.getByRole("button", { name: "Set up rent" }).click();
    await expect(hostPage).toHaveURL(/\/money\/recurring\/[0-9a-f-]{36}$/);

    await hostPage.goto("/money/recurring/new");
    await hostPage.getByLabel("Name", { exact: true }).fill("Gas");
    await hostPage.getByLabel("Due on the").selectOption(dueDay);
    await hostPage.getByLabel("Who pays the supplier?").selectOption({ label: aliceName });
    await hostPage.getByRole("button", { name: "Changes each month" }).click();
    await hostPage.getByRole("button", { name: "Add bill" }).click();
    await expect(hostPage).toHaveURL(/\/money\/recurring\/[0-9a-f-]{36}$/);

    sql(`select private.recurring_generate('${noon(daysFrom(due, -14))}'::timestamptz)`);
    sql(`select private.recurring_generate('${noon(daysFrom(due, -7))}'::timestamptz)`);
    sql(`select private.recurring_generate('${noon(daysFrom(due, -6))}'::timestamptz)`);

    // --- The host paid 20.00 for the host and Alice, so Alice owes 10.00.
    const hostId = sql(
      `select p.id from public.profiles p join auth.users u on u.id = p.user_id where u.email = '${host.user.email}'`,
    );
    const aliceId = sql(
      `select p.id from public.profiles p join auth.users u on u.id = p.user_id where u.email = '${alice.user.email}'`,
    );
    const added = await host.supabase.rpc("add_expense", {
      p_amount_pence: 2000,
      p_description: "Washing line",
      p_category: "household",
      p_occurred_on: iso(new Date()),
      p_paid_by: hostId,
      p_profile_ids: [hostId, aliceId],
      p_share_pence: [1000, 1000],
    });
    expect(added.error).toBeNull();

    // --- Alice sees her own things: the gas amount to enter, her rent, what she owes, what is coming.
    await alicePage.goto("/dashboard");
    const waiting = alicePage.getByRole("region", { name: "Waiting on you" });
    await expect(
      waiting.getByRole("link", { name: /Enter this month's Gas amount, due/ }),
    ).toBeVisible();
    const rent = alicePage.getByRole("region", { name: "Your rent" });
    await expect(rent.getByText("£600.00")).toBeVisible();
    await expect(alicePage.getByText("You owe £10.00 in total")).toBeVisible();
    await expect(
      alicePage.getByRole("region", { name: "Coming up" }).getByText(/Gas due/),
    ).toBeVisible();
    for (const hidden of ["£800.00", "£1,200.00", "£2,000.00"]) {
      await expect(alicePage.locator("body")).not.toContainText(hidden);
    }
    await expect(alicePage.getByText("For admins")).toHaveCount(0);
    await expect(alicePage.getByRole("heading", { level: 1 })).toHaveCount(1);

    // --- Bob sees his own rent and none of Alice's.
    await bobPage.goto("/dashboard");
    await expect(
      bobPage.getByRole("region", { name: "Your rent" }).getByText("£600.00"),
    ).toBeVisible();
    for (const hidden of ["£800.00", "£1,200.00", "£2,000.00"]) {
      await expect(bobPage.locator("body")).not.toContainText(hidden);
    }
    await expect(bobPage.getByRole("region", { name: "Waiting on you" })).toBeVisible();

    // --- The host is owed, and once Alice says she paid her rent the host sees it under "For admins".
    await alicePage.goto("/money/rent/pay");
    await alicePage.getByRole("button", { name: "I paid my rent" }).click();
    await expect(alicePage).toHaveURL(/\/money\/rent$/);
    await hostPage.goto("/dashboard");
    await expect(hostPage.getByText("You're owed £10.00")).toBeVisible();
    const admins = hostPage.getByRole("region", { name: "For admins" });
    await expect(admins.getByText("1 rent payment waiting to confirm")).toBeVisible();
    // No chores yet: the admin is pointed at the chore manager, the members see no chores block.
    await expect(hostPage.getByRole("link", { name: "Add your chores" })).toBeVisible();
    await expect(alicePage.getByText("Your chores this week")).toHaveCount(0);

    // --- 360px phone: nothing scrolls sideways.
    await hostPage.setViewportSize({ width: 360, height: 800 });
    await hostPage.goto("/dashboard");
    const overflow = await hostPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
