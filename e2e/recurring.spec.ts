import { expect, test, type Browser, type Page } from "@playwright/test";

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
/** Noon in London on a date: how the tests move the monthly job through time. */
const noon = (date: Date) => `${iso(date)} 12:00:00+00`;
const monthName = (date: Date) =>
  date.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

async function flatOfThree(browser: Browser, baseURL: string) {
  const host = await signUpAndIn(newTestUser("collector"));
  await createFlat(host.supabase, "Rent Flat");
  const alice = await signUpAndIn(newTestUser("alice"));
  await joinFlat(host.supabase, alice.supabase);
  const bob = await signUpAndIn(newTestUser("bob"));
  await joinFlat(host.supabase, bob.supabase);

  const open = async (jar: typeof host.jar) => {
    const context = await browser.newContext({ baseURL });
    await addSessionCookies(context, jar, baseURL);
    return { context, page: await context.newPage() };
  };
  const [h, a, b] = await Promise.all([open(host.jar), open(alice.jar), open(bob.jar)]);

  const nameOf = (email: string) =>
    sql(
      `select p.display_name from public.profiles p join auth.users u on u.id = p.user_id where u.email = '${email}'`,
    );
  return {
    host: { ...h, name: nameOf(host.user.email) },
    alice: { ...a, name: nameOf(alice.user.email) },
    bob: { ...b, name: nameOf(bob.user.email) },
    close: () => Promise.all([h.context.close(), a.context.close(), b.context.close()]),
  };
}

async function openForm(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
}

test.describe("rent and bills", () => {
  test("an admin sets up rent and a gas bill; each member sees only their own rent; payments are confirmed; the amount is entered; edits only change the future", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const { host, alice, bob, close } = await flatOfThree(browser, baseURL!);
    const due = dueDate();
    const dueDay = String(due.getUTCDate());

    // --- The admin sets up the rent: the collector in a front room, Alice and Bob sharing a big one.
    await openForm(host.page, "/money/recurring/new");
    await host.page.getByRole("button", { name: "Rent", exact: true }).click();
    await host.page.getByLabel("Due on the").selectOption(dueDay);
    await host.page.getByLabel("Room 1 name").fill("Front");
    await host.page.getByLabel("Room's rent each month (£)").first().fill("800");
    const rooms = () => host.page.locator("fieldset").filter({ hasText: "Who lives here?" });
    await rooms().nth(0).getByLabel(host.name, { exact: true }).check();
    await host.page.getByRole("button", { name: "Add a room" }).click();
    await host.page.getByLabel("Room 2 name").fill("Big room");
    await host.page.getByLabel("Room's rent each month (£)").nth(1).fill("1200");
    await rooms().nth(1).getByLabel(alice.name, { exact: true }).check();
    await rooms().nth(1).getByLabel(bob.name, { exact: true }).check();
    await expect(host.page.getByText("£2,000.00 a month across 3 people")).toBeVisible();
    await host.page.getByRole("button", { name: "Set up rent" }).click();
    await expect(host.page).toHaveURL(/\/money\/recurring\/[0-9a-f-]{36}$/);
    const rentId = host.page.url().split("/").pop()!;
    await expect(host.page.getByText("Rooms and who pays what")).toBeVisible();

    // --- And a gas bill that changes each month, paid by Alice.
    await openForm(host.page, "/money/recurring/new");
    await host.page.getByLabel("Name", { exact: true }).fill("Gas");
    await host.page.getByLabel("Due on the").selectOption(dueDay);
    await host.page.getByLabel("Who pays the supplier?").selectOption({ label: alice.name });
    await host.page.getByRole("button", { name: "Changes each month" }).click();
    await host.page.getByRole("button", { name: "Add bill" }).click();
    await expect(host.page).toHaveURL(/\/money\/recurring\/[0-9a-f-]{36}$/);

    // --- The daily job, moved through time: variable bills 14 days ahead, rent 7.
    sql(`select private.recurring_generate('${noon(daysFrom(due, -14))}'::timestamptz)`);
    sql(`select private.recurring_generate('${noon(daysFrom(due, -7))}'::timestamptz)`);
    sql(`select private.recurring_generate('${noon(daysFrom(due, -6))}'::timestamptz)`);
    expect(sql(`select count(*) from public.rent_charges where template_id = '${rentId}'`)).toBe(
      "2",
    );

    // --- Each member sees only their own rent.
    await alice.page.goto("/money/rent");
    await expect(alice.page.getByText("£600.00").first()).toBeVisible();
    await expect(alice.page.getByText("Who has paid")).toHaveCount(0);
    for (const hidden of ["£800.00", "£1,200.00", "£2,000.00", bob.name]) {
      await expect(alice.page.locator("body")).not.toContainText(hidden);
    }
    await bob.page.goto("/money/rent");
    await expect(bob.page.getByText("£600.00").first()).toBeVisible();
    await expect(bob.page.locator("body")).not.toContainText(alice.name);

    // The rent template link, opened directly, is "not found" for a member, and so is its editor.
    await alice.page.goto(`/money/recurring/${rentId}`);
    await expect(alice.page.getByText("We couldn’t find that.")).toBeVisible();
    await expect(alice.page.locator("body")).not.toContainText("Big room");
    await alice.page.goto(`/money/recurring/${rentId}/edit`);
    await expect(alice.page.getByText("Only the owner and admins can edit this.")).toBeVisible();
    await alice.page.goto("/money/recurring");
    await expect(alice.page.getByText("Add rent or a bill")).toHaveCount(0);
    await expect(alice.page.getByRole("link", { name: "Gas" })).toBeVisible();

    // --- Alice says she paid; it waits for the collector.
    await alice.page.goto("/money/rent/pay");
    await alice.page.getByRole("button", { name: "I paid my rent" }).click();
    await expect(alice.page).toHaveURL(/\/money\/rent$/);
    await expect(alice.page.getByText("Waiting to be confirmed").first()).toBeVisible();

    // The collector sees everyone's amounts, confirms Alice's payment, and her row turns paid.
    await host.page.goto("/money/rent");
    const month = host.page.getByRole("region", { name: `Rent for ${monthName(due)}` });
    await expect(month.getByText(alice.name, { exact: true })).toBeVisible();
    await expect(month.getByText(bob.name, { exact: true })).toBeVisible();
    await expect(month.getByText("£600.00", { exact: true })).toHaveCount(2);
    await expect(host.page.getByText(`${alice.name} says they paid £600.00`)).toBeVisible();
    await host.page.getByRole("button", { name: "Confirm" }).click();
    await expect(host.page).toHaveURL(/\/money\/rent$/);
    await expect(
      host.page
        .getByRole("region", { name: `Rent for ${monthName(due)}` })
        .getByText(/Paid/)
        .first(),
    ).toBeVisible();
    await alice.page.goto("/money/rent");
    await expect(alice.page.getByText("You are all paid up.")).toBeVisible();
    await bob.page.goto("/money/rent");
    await expect(bob.page.getByText("still to pay")).toBeVisible();

    // --- The payer of the gas enters this month's amount; the sharers see it on Money.
    await alice.page.goto("/money/recurring");
    await alice.page
      .getByRole("link", { name: /Enter this month’s amount/ })
      .first()
      .click();
    await alice.page.getByLabel(/This month's Gas/).fill("90");
    await expect(alice.page.getByText("£30.00")).toHaveCount(3);
    await alice.page.getByRole("button", { name: "Save amount" }).click();
    await expect(alice.page).toHaveURL(/\/money\/recurring$/);
    await bob.page.goto("/money");
    await expect(bob.page.getByRole("link", { name: /Gas, / })).toBeVisible();
    await expect(bob.page.getByText("Your share £30.00")).toBeVisible();

    // --- Editing the rent changes future months only: this month's charges stay as they were.
    await openForm(host.page, `/money/recurring/${rentId}/edit`);
    await host.page.getByLabel("Room's rent each month (£)").nth(1).fill("1400");
    await host.page.getByRole("button", { name: "Save changes" }).click();
    await expect(host.page).toHaveURL(new RegExp(`/money/recurring/${rentId}$`));
    await expect(host.page.getByText("£1,400.00").first()).toBeVisible();
    expect(
      sql(
        `select count(*) from public.rent_charges where template_id = '${rentId}' and amount_pence = 60000`,
      ),
    ).toBe("2");
    await bob.page.goto("/money/rent");
    await expect(bob.page.getByText("£600.00").first()).toBeVisible();

    await close();
  });
});
