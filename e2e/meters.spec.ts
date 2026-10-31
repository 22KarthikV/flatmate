import { expect, test } from "@playwright/test";

import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";

// Two people in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "two people in the shared database");
});

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

test.describe("meter readings", () => {
  test("an admin adds a meter, a member records two readings and sees the use, a lower number asks about a reset, cancelling removes the use", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("meter-admin"));
    await createFlat(host.supabase, "Meter Flat");
    const joiner = await signUpAndIn(newTestUser("meter-member"));
    await joinFlat(host.supabase, joiner.supabase);

    const pages = [];
    for (const person of [host, joiner]) {
      const context = await browser.newContext({ baseURL: baseURL! });
      await addSessionCookies(context, person.jar, baseURL!);
      pages.push(await context.newPage());
    }
    const [adminPage, memberPage] = pages;

    // A member cannot add meters.
    await memberPage.goto("/more/meters/new");
    await expect(memberPage.getByText("Only admins add meters")).toBeVisible();

    // The admin adds Electricity.
    await adminPage.goto("/more/meters/new");
    await adminPage.getByRole("button", { name: "Add meter" }).click();
    await expect(adminPage).toHaveURL(/\/more\/meters$/);
    await expect(adminPage.getByRole("link", { name: /Electricity/ })).toBeVisible();

    // The member records 1000 and then 1214 thirty-one days later.
    await memberPage.goto("/more/meters");
    await memberPage.getByRole("link", { name: /Electricity/ }).click();
    await expect(memberPage).toHaveURL(/\/more\/meters\/[0-9a-f-]{36}$/);
    const meterUrl = memberPage.url();

    const record = async (date: string, value: string) => {
      await memberPage.getByLabel("Date of the reading").fill(date);
      await memberPage.getByLabel("Reading (kWh)").fill(value);
      await memberPage.getByRole("button", { name: "Add reading" }).click();
    };
    await record(isoDate(-40), "1000");
    await expect(memberPage.getByText(`1000 kWh on ${isoDate(-40)}`)).toBeVisible();
    await record(isoDate(-9), "1214");
    await expect(memberPage.getByText("Used 214 kWh in 31 days, about 7 a day.")).toBeVisible();

    // A lower number is refused, and the form asks whether the meter was replaced.
    await record(isoDate(-2), "900");
    await expect(memberPage.getByText("That is lower than the last reading.")).toBeVisible();
    await expect(memberPage.getByText("Was the meter replaced or did it roll over?")).toBeVisible();

    // Cancelling the second reading removes the use.
    await memberPage.goto(meterUrl);
    await memberPage
      .getByRole("button", { name: `Cancel the reading of 1214 on ${isoDate(-9)}` })
      .click();
    await expect(memberPage.getByText(/Used 214 kWh/)).toHaveCount(0);
    await expect(memberPage.getByText(`1000 kWh on ${isoDate(-40)}`)).toBeVisible();

    // The admin sees the same meter and the remaining reading.
    await adminPage.goto(meterUrl);
    await expect(adminPage.getByText(`1000 kWh on ${isoDate(-40)}`)).toBeVisible();
  });
});
