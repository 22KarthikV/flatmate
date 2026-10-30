import { expect, test, type Page } from "@playwright/test";

import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";
import { profileIdFor, runLocalSql } from "./support/database";

// Two people in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "two people in the shared database");
});

async function twoFlatmates(browser: import("@playwright/test").Browser, baseURL: string) {
  const host = await signUpAndIn(newTestUser("payer"));
  await createFlat(host.supabase, "Money Flat");
  const joiner = await signUpAndIn(newTestUser("sharer"));
  await joinFlat(host.supabase, joiner.supabase);

  const hostContext = await browser.newContext({ baseURL });
  await addSessionCookies(hostContext, host.jar, baseURL);
  const joinerContext = await browser.newContext({ baseURL });
  await addSessionCookies(joinerContext, joiner.jar, baseURL);

  return {
    host,
    joiner,
    hostContext,
    joinerContext,
    hostPage: await hostContext.newPage(),
    joinerPage: await joinerContext.newPage(),
  };
}

async function addEqualExpense(page: Page, amount: string, description: string) {
  await page.goto("/money/add");
  await page.getByLabel("Amount (£)").fill(amount);
  await page.getByLabel("What was it for?").fill(description);
  await page.getByLabel("Category").selectOption("household");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page).toHaveURL(/\/money\/expenses\/[0-9a-f-]{36}$/);
}

test.describe("balances", () => {
  test("both flatmates see the same, correct positions and the same suggested payment", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );

    // A new flat has nothing to settle.
    await hostPage.goto("/money");
    await expect(hostPage.getByText("Everyone is square")).toBeVisible();

    // The host pays 10.00 for both of them; the flatmate pays 4.00 for both.
    await addEqualExpense(hostPage, "10", "Shared shopping");
    await addEqualExpense(joinerPage, "4", "Light bulbs");

    // The flatmate owes 5.00 and is owed 2.00: net they owe 3.00, and the host is owed 3.00.
    await hostPage.goto("/money");
    await expect(hostPage.getByText("You are owed £3.00")).toBeVisible();
    await expect(hostPage.getByText(/pays you £3\.00/)).toBeVisible();
    await expect(hostPage.getByText("owes £3.00")).toBeVisible();

    await joinerPage.goto("/money");
    await expect(joinerPage.getByText("You owe £3.00")).toBeVisible();
    await expect(joinerPage.getByText(/You pay .* £3\.00/)).toBeVisible();
    await expect(joinerPage.getByText("is owed £3.00")).toBeVisible();

    // Cancelling the larger expense moves everyone.
    await hostPage.goto("/money");
    await hostPage.getByRole("link", { name: /Shared shopping/ }).click();
    await hostPage.getByRole("button", { name: "Cancel this expense" }).click();
    await hostPage.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(hostPage).toHaveURL(/\/money$/);
    await expect(hostPage.getByText("You owe £2.00")).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("an open Money screen updates when a flatmate adds an expense, without navigating", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );

    await joinerPage.goto("/money");
    await expect(joinerPage.getByText("Everyone is square")).toBeVisible();
    // Give the live updates a moment to connect, as the notification tests do.
    await joinerPage.waitForTimeout(3000);

    await addEqualExpense(hostPage, "8", "Live update");

    await expect(joinerPage.getByText("You owe £4.00")).toBeVisible({ timeout: 20_000 });
    await expect(joinerPage.getByRole("link", { name: /Live update/ })).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });
});

test.describe("settling up", () => {
  test("a payment is pending until the receiver confirms it, then both balances move", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );
    // The host pays 10.00 for both, so the flatmate owes 5.00.
    await addEqualExpense(hostPage, "10", "Shared dinner");

    // The flatmate records the payment from the suggested payment.
    await joinerPage.goto("/money");
    await expect(joinerPage.getByText("You owe £5.00")).toBeVisible();
    await joinerPage.getByRole("link", { name: "Record this payment" }).click();
    await expect(joinerPage.getByLabel("Amount (£)").filter({ visible: true })).toHaveValue("5.00");
    await joinerPage.getByRole("button", { name: "Record payment" }).click();
    await expect(joinerPage).toHaveURL(/\/money$/);

    // Pending: the payer sees it waiting, and nothing has moved.
    await expect(joinerPage.getByText(/Waiting for .* to confirm/)).toBeVisible();
    await expect(joinerPage.getByText("You owe £5.00")).toBeVisible();

    // The receiver is told, sees it to confirm, and their balance is still the same.
    await hostPage.goto("/notifications");
    await expect(hostPage.getByText(/says they paid you/)).toBeVisible();
    await expect(hostPage.getByText("Confirm it when you have received £5.00.")).toBeVisible();
    await hostPage.goto("/money");
    await expect(hostPage.getByText(/says they paid you £5\.00/)).toBeVisible();
    await expect(hostPage.getByText("You are owed £5.00")).toBeVisible();

    // Confirming moves both balances to square.
    await hostPage.getByRole("button", { name: "Confirm" }).click();
    await expect(hostPage.getByText("Everyone is square")).toBeVisible();
    await expect(hostPage.getByText(/says they paid you/)).toHaveCount(0);

    await joinerPage.goto("/money");
    await expect(joinerPage.getByText("Everyone is square")).toBeVisible();
    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText(/confirmed your payment/)).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("a declined payment never counts, and the payer can cancel one still waiting", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );
    await addEqualExpense(hostPage, "8", "Takeaway night");

    // First payment: the receiver says it did not arrive.
    await joinerPage.goto("/money/settle");
    await joinerPage.getByLabel("Who did you pay?").selectOption({ index: 1 });
    await joinerPage.getByLabel("Amount (£)").fill("4");
    await joinerPage.getByRole("button", { name: "Record payment" }).click();
    await expect(joinerPage).toHaveURL(/\/money$/);

    await hostPage.goto("/money");
    await hostPage.getByRole("button", { name: "Didn’t arrive" }).click();
    await expect(hostPage.getByText(/says they paid you/)).toHaveCount(0);
    await expect(hostPage.getByText("You are owed £4.00")).toBeVisible();

    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText(/did not confirm your payment/)).toBeVisible();
    await joinerPage.goto("/money");
    await expect(joinerPage.getByText("You owe £4.00")).toBeVisible();

    // Second payment: the payer takes it back before it is decided.
    await joinerPage.goto("/money/settle");
    await joinerPage.getByLabel("Who did you pay?").selectOption({ index: 1 });
    await joinerPage.getByLabel("Amount (£)").fill("1");
    await joinerPage.getByRole("button", { name: "Record payment" }).click();
    await expect(joinerPage.getByText(/Waiting for .* to confirm/)).toBeVisible();
    await joinerPage.getByRole("button", { name: "Cancel payment" }).click();
    await expect(joinerPage.getByText(/Waiting for .* to confirm/)).toHaveCount(0);

    // The receiver has nothing left to confirm.
    await hostPage.goto("/money");
    await expect(hostPage.getByText(/says they paid you/)).toHaveCount(0);
    await expect(hostPage.getByText("You are owed £4.00")).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("the payment form refuses a bad amount", async ({ browser, baseURL }) => {
    const { joinerPage, hostContext, joinerContext } = await twoFlatmates(browser, baseURL!);

    await joinerPage.goto("/money/settle");
    await joinerPage.getByLabel("Who did you pay?").selectOption({ index: 1 });
    await joinerPage.getByLabel("Amount (£)").fill("abc");
    await joinerPage.getByRole("button", { name: "Record payment" }).click();
    await expect(joinerPage.locator('p[role="alert"]')).toContainText("Enter an amount like 4.20.");

    await joinerPage.getByLabel("Amount (£)").fill("10000.01");
    await joinerPage.getByRole("button", { name: "Record payment" }).click();
    await expect(joinerPage.locator('p[role="alert"]')).toContainText("at most £10,000.00");

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });
});

test.describe("reminders", () => {
  test("an admin can change how long before people are nudged, and a member cannot see the setting", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );

    await hostPage.goto("/more/flat");
    const select = hostPage.getByLabel("Remind people who owe money");
    await expect(select).toHaveValue("7");
    await select.selectOption("14");
    await hostPage.getByRole("button", { name: "Save" }).click();
    await expect(hostPage.getByText("Saved.")).toBeVisible();

    await hostPage.reload();
    await expect(hostPage.getByLabel("Remind people who owe money")).toHaveValue("14");
    await hostPage.getByLabel("Remind people who owe money").selectOption("off");
    await hostPage.getByRole("button", { name: "Save" }).click();
    await expect(hostPage.getByText("Saved.")).toBeVisible();
    await hostPage.reload();
    await expect(hostPage.getByLabel("Remind people who owe money")).toHaveValue("off");

    // A plain member does not get the setting.
    await joinerPage.goto("/more/flat");
    await expect(joinerPage.getByText("Money reminders")).toHaveCount(0);

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("someone who has owed money for a week gets one gentle reminder", async ({
    browser,
    baseURL,
  }) => {
    const { host, joiner, hostContext, joinerContext, joinerPage } = await twoFlatmates(
      browser,
      baseURL!,
    );
    const hostId = profileIdFor(host.user.email);
    const joinerId = profileIdFor(joiner.user.email);
    const householdId = runLocalSql(
      `select household_id from public.memberships where profile_id = '${hostId}' and left_at is null`,
    );
    const expenseId = crypto.randomUUID();

    // A debt from ten days ago, written straight into the local database so it is already old.
    runLocalSql(`
      set constraints all deferred;
      insert into public.expenses (id, household_id, paid_by, created_by, amount_pence, description, category, occurred_on, created_at)
      values ('${expenseId}', '${householdId}', '${hostId}', '${hostId}', 1000, 'Old shopping', 'groceries', current_date - 10, now() - interval '10 days');
      insert into public.expense_shares (expense_id, household_id, profile_id, share_pence) values
        ('${expenseId}', '${householdId}', '${hostId}', 500),
        ('${expenseId}', '${householdId}', '${joinerId}', 500);
    `);

    runLocalSql("select private.ledger_send_nudges(now())");
    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText("Gentle reminder: you owe £5.00")).toBeVisible();

    // Running it again the same day does not nudge twice.
    runLocalSql("select private.ledger_send_nudges(now())");
    await joinerPage.reload();
    await expect(joinerPage.getByText("Gentle reminder: you owe £5.00")).toHaveCount(1);

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });
});

test.describe("leaving with money open", () => {
  test("a member who owes money is told why they cannot leave, and can once they have settled", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );
    await addEqualExpense(hostPage, "10", "Shared dinner");

    // The flatmate owes 5.00: they are told, and are not offered a leave button.
    await joinerPage.goto("/more/flat");
    await expect(joinerPage.getByText(/You can’t leave yet/)).toBeVisible();
    await expect(joinerPage.getByRole("button", { name: "Leave flat" })).toHaveCount(0);

    // They pay, the host confirms.
    await joinerPage.goto("/money");
    await joinerPage.getByRole("link", { name: "Record this payment" }).click();
    await joinerPage.getByRole("button", { name: "Record payment" }).click();
    await expect(joinerPage).toHaveURL(/\/money$/);

    // Still blocked while it waits for a decision.
    await joinerPage.goto("/more/flat");
    await expect(joinerPage.getByText(/You can’t leave yet/)).toBeVisible();

    await hostPage.goto("/money");
    await hostPage.getByRole("button", { name: "Confirm" }).click();
    await expect(hostPage.getByText("Everyone is square")).toBeVisible();

    // Square at last: they can leave.
    await joinerPage.goto("/more/flat");
    await expect(joinerPage.getByText(/You can’t leave yet/)).toHaveCount(0);
    await joinerPage.getByRole("button", { name: "Leave flat" }).click();
    await joinerPage.getByRole("button", { name: "Leave flat" }).click();
    await expect(joinerPage.getByText(/No flat yet|Create your flat|Join/).first()).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("deleting an account is refused while money is open", async ({ browser, baseURL }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );
    await addEqualExpense(hostPage, "10", "Shared dinner");

    await joinerPage.goto("/more/account");
    await joinerPage.getByRole("button", { name: "Delete account" }).click();
    await joinerPage.getByLabel(/type delete/i).fill("DELETE");
    await joinerPage.getByRole("button", { name: "Delete my account" }).click();
    await expect(joinerPage.locator('p[role="alert"]')).toContainText("Settle up first");

    // Nothing was lost: they can still open their flat.
    await joinerPage.goto("/money");
    await expect(joinerPage.getByText("You owe £5.00")).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("an admin confirms a payment to someone who has left, on their behalf", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("owner"));
    await createFlat(host.supabase, "Leaving Flat");
    const admin = await signUpAndIn(newTestUser("admin"));
    await joinFlat(host.supabase, admin.supabase);
    const leaver = await signUpAndIn(newTestUser("leaver"));
    await joinFlat(host.supabase, leaver.supabase);

    const hostId = profileIdFor(host.user.email);
    const adminId = profileIdFor(admin.user.email);
    const leaverId = profileIdFor(leaver.user.email);

    const promoted = await host.supabase.rpc("set_member_role", {
      p_profile_id: adminId,
      p_role: "admin",
    });
    expect(promoted.error).toBeNull();

    // The leaver paid 20.00 for the host and themselves: the host owes them 10.00.
    const added = await leaver.supabase.rpc("add_expense", {
      p_amount_pence: 2000,
      p_description: "Washing line",
      p_category: "household",
      p_occurred_on: new Date().toISOString().slice(0, 10),
      p_paid_by: leaverId,
      p_profile_ids: [hostId, leaverId],
      p_share_pence: [1000, 1000],
    });
    expect(added.error).toBeNull();
    const removed = await host.supabase.rpc("remove_member", { p_profile_id: leaverId });
    expect(removed.error).toBeNull();

    const hostContext = await browser.newContext({ baseURL: baseURL! });
    await addSessionCookies(hostContext, host.jar, baseURL!);
    const hostPage = await hostContext.newPage();
    const adminContext = await browser.newContext({ baseURL: baseURL! });
    await addSessionCookies(adminContext, admin.jar, baseURL!);
    const adminPage = await adminContext.newPage();

    // The books still show what the host owes the person who left.
    await hostPage.goto("/money");
    await expect(hostPage.getByText("Former flatmates")).toBeVisible();
    await expect(hostPage.getByText("is owed £10.00")).toBeVisible();

    // The host records a payment to them: it waits for another admin.
    await hostPage.goto("/money/settle");
    const leftOption = hostPage.locator('optgroup[label="Left the flat, still owed money"] option');
    await hostPage
      .getByLabel("Who did you pay?")
      .selectOption((await leftOption.getAttribute("value")) as string);
    await expect(
      hostPage.getByText(/has left the flat, so an admin confirms this for them/),
    ).toBeVisible();
    await hostPage.getByLabel("Amount (£)").fill("10");
    await hostPage.getByRole("button", { name: "Record payment" }).click();
    await expect(hostPage).toHaveURL(/\/money$/);
    await expect(hostPage.getByText(/another admin has to confirm it for them/)).toBeVisible();
    // The payer cannot decide it themselves: there is no Confirm for them.
    await expect(hostPage.getByRole("button", { name: "Confirm" })).toHaveCount(0);

    // The other admin sees it and confirms for the person who left.
    await adminPage.goto("/money");
    await expect(adminPage.getByText(/as an admin you can confirm it for them/)).toBeVisible();
    await adminPage.getByRole("button", { name: "Confirm" }).click();
    await expect(adminPage.getByText(/as an admin you can confirm it for them/)).toHaveCount(0);

    // The host is told, and the books are square.
    await hostPage.goto("/notifications");
    await expect(hostPage.getByText(/an admin confirmed it for them/)).toBeVisible();
    await hostPage.goto("/money");
    await expect(hostPage.getByText("Everyone is square")).toBeVisible();
    await expect(hostPage.getByText("Former flatmates")).toHaveCount(0);

    await Promise.all([hostContext.close(), adminContext.close()]);
  });
});

test.describe("expenses", () => {
  test("adding an expense tells the other flatmate, who sees their share", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );

    await hostPage.goto("/money");
    await expect(hostPage.getByText(/No expenses yet/)).toBeVisible();
    await hostPage.getByRole("link", { name: "Add expense" }).click();

    await hostPage.getByLabel("Amount (£)").fill("10");
    await hostPage.getByLabel("What was it for?").fill("Kitchen roll");
    await hostPage.getByLabel("Category").selectOption("household");
    // Ten pounds between two is five each; the preview says so before anything is saved.
    const preview = hostPage.getByText("Each share").locator("..");
    await expect(preview).toContainText("£5.00");
    await hostPage.getByRole("button", { name: "Add expense" }).click();

    await expect(hostPage).toHaveURL(/\/money\/expenses\/[0-9a-f-]{36}$/);
    await expect(hostPage.getByRole("heading", { level: 2, name: "Kitchen roll" })).toBeVisible();
    await expect(hostPage.getByText("£10.00").first()).toBeVisible();
    await expect(hostPage.getByText("Who owes what")).toBeVisible();

    // The flatmate is told, with their share, and sees it in the list.
    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText(/added Kitchen roll/)).toBeVisible();
    await expect(joinerPage.getByText("Your share is £5.00.")).toBeVisible();

    await joinerPage.goto("/money");
    const row = joinerPage.getByRole("link", { name: /Kitchen roll/ });
    await expect(row).toContainText("Your share £5.00");
    await expect(row).toContainText("paid");

    // The person who added it is not told about their own expense.
    await hostPage.goto("/notifications");
    await expect(hostPage.getByText(/added Kitchen roll/)).toHaveCount(0);

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("the split can be by amounts, by percentages or onto one person", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, hostContext, joinerContext } = await twoFlatmates(browser, baseURL!);

    // By percentages: 70 / 30 of £10.00.
    await hostPage.goto("/money/add");
    await hostPage.getByLabel("Amount (£)").fill("10");
    await hostPage.getByLabel("What was it for?").fill("Split by percent");
    await hostPage.getByRole("radio", { name: "By percentages" }).check({ force: true });
    const percentInputs = hostPage.locator('input[name^="percent:"]');
    await percentInputs.nth(0).fill("70");
    await expect(hostPage.getByText(/must add up to 100%/)).toBeVisible();
    await percentInputs.nth(1).fill("30");
    await hostPage.getByRole("button", { name: "Add expense" }).click();
    await expect(hostPage).toHaveURL(/\/money\/expenses\//);
    await expect(hostPage.getByText("£7.00").filter({ visible: true })).toBeVisible();
    await expect(hostPage.getByText("£3.00").filter({ visible: true })).toBeVisible();

    // By amounts, with a mistake first.
    await hostPage.goto("/money/add");
    await hostPage.getByLabel("Amount (£)").fill("9");
    await hostPage.getByLabel("What was it for?").fill("Split by amounts");
    await hostPage.getByRole("radio", { name: "By amounts" }).check({ force: true });
    const amountInputs = hostPage.locator('input[name^="exact:"]');
    await amountInputs.nth(0).fill("5");
    await amountInputs.nth(1).fill("3");
    await hostPage.getByRole("button", { name: "Add expense" }).click();
    await expect(hostPage.locator('p[role="alert"]')).toContainText("The amounts add up to £8.00");
    await amountInputs.nth(1).fill("4");
    await hostPage.getByRole("button", { name: "Add expense" }).click();
    await expect(hostPage).toHaveURL(/\/money\/expenses\//);

    // Onto one person: only they are told.
    await hostPage.goto("/money/add");
    await hostPage.getByLabel("Amount (£)").fill("4.50");
    await hostPage.getByLabel("What was it for?").fill("Bought for you");
    await hostPage.getByRole("radio", { name: "One person" }).check({ force: true });
    // The owner is listed first, so the flatmate who joined is the last choice.
    await hostPage.locator('input[name="one"]').last().check({ force: true });
    await hostPage.getByRole("button", { name: "Add expense" }).click();
    await expect(hostPage).toHaveURL(/\/money\/expenses\//);
    await expect(hostPage.getByText("£4.50").first()).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("an expense can be corrected and cancelled, and the history stays", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );
    await addEqualExpense(hostPage, "10", "Bin bags");
    const original = hostPage.url();

    // The flatmate, who did not add it, cannot change it.
    await joinerPage.goto(original);
    await expect(joinerPage.getByRole("heading", { level: 2, name: "Bin bags" })).toBeVisible();
    await expect(joinerPage.getByRole("link", { name: "Correct it" })).toHaveCount(0);
    await expect(joinerPage.getByRole("button", { name: "Cancel this expense" })).toHaveCount(0);
    await joinerPage.goto(`${original}/edit`);
    await expect(joinerPage).toHaveURL(original);

    // The person who added it corrects the amount.
    await hostPage.getByRole("link", { name: "Correct it" }).click();
    // Next keeps the page we came from in the DOM, hidden, so look only at what is showing.
    const amount = hostPage.getByLabel("Amount (£)").filter({ visible: true });
    await expect(amount).toHaveValue("10.00");
    await amount.fill("12");
    await hostPage.getByRole("button", { name: "Save correction" }).click();

    await expect(hostPage).toHaveURL(/\/money\/expenses\/[0-9a-f-]{36}$/);
    expect(hostPage.url()).not.toBe(original);
    await expect(hostPage.getByText("£12.00").first()).toBeVisible();
    await expect(
      hostPage.getByText("History", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(hostPage.getByText(/This version/).filter({ visible: true })).toBeVisible();

    // The old version is still there, marked as corrected.
    await hostPage.goto(original);
    await expect(hostPage.getByText("Corrected", { exact: false }).first()).toBeVisible();
    await expect(hostPage.getByRole("link", { name: "Correct it" })).toHaveCount(0);

    // The flatmate was told about the correction, with their new share.
    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText(/changed Bin bags/)).toBeVisible();
    await expect(joinerPage.getByText("Your share is now £6.00.")).toBeVisible();

    // Cancel the corrected one, after a confirmation.
    await hostPage.goto("/money");
    await hostPage
      .getByRole("link", { name: /Bin bags.*£12\.00/ })
      .first()
      .click();
    await hostPage.getByRole("button", { name: "Cancel this expense" }).click();
    await expect(hostPage.getByText(/stops counting towards anyone/)).toBeVisible();
    await hostPage.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(hostPage).toHaveURL(/\/money$/);
    await expect(hostPage.getByText("Cancelled").first()).toBeVisible();

    await joinerPage.goto("/notifications");
    await expect(joinerPage.getByText(/cancelled Bin bags/)).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close()]);
  });

  test("an admin can correct someone else's expense; another flat sees nothing", async ({
    browser,
    baseURL,
  }) => {
    const { hostPage, joinerPage, hostContext, joinerContext } = await twoFlatmates(
      browser,
      baseURL!,
    );
    // The flatmate adds one; the owner (an admin by role) can change it.
    await addEqualExpense(joinerPage, "6", "Washing powder");
    const url = joinerPage.url();
    await hostPage.goto(url);
    await expect(hostPage.getByRole("link", { name: "Correct it" })).toBeVisible();
    await expect(hostPage.getByRole("button", { name: "Cancel this expense" })).toBeVisible();

    // Someone in another flat cannot even tell it exists.
    const stranger = await signUpAndIn(newTestUser("stranger"));
    await createFlat(stranger.supabase, "Other Flat");
    const strangerContext = await browser.newContext({ baseURL: baseURL! });
    await addSessionCookies(strangerContext, stranger.jar, baseURL!);
    const strangerPage = await strangerContext.newPage();
    await strangerPage.goto(url);
    await expect(strangerPage.getByText("We couldn’t find that expense.")).toBeVisible();
    await strangerPage.goto("/money");
    await expect(strangerPage.getByText(/No expenses yet/)).toBeVisible();

    await Promise.all([hostContext.close(), joinerContext.close(), strangerContext.close()]);
  });

  test("the add form fits a phone: no sideways scroll, touch-sized controls", async ({
    browser,
    baseURL,
  }) => {
    const user = await signUpAndIn(newTestUser("phone"));
    await createFlat(user.supabase, "Phone Flat");
    const context = await browser.newContext({
      baseURL: baseURL!,
      viewport: { width: 360, height: 740 },
    });
    await addSessionCookies(context, user.jar, baseURL!);
    const page = await context.newPage();

    for (const path of ["/money", "/money/add"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }

    await page.goto("/money/add");
    for (const control of [
      page.getByRole("button", { name: "Add expense" }),
      page.getByLabel("Amount (£)"),
      page.getByLabel("Category"),
      page.getByRole("checkbox").first(),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    }
    const submit = await page.getByRole("button", { name: "Add expense" }).boundingBox();
    expect(submit?.height ?? 0).toBeGreaterThanOrEqual(44);
    await context.close();
  });
});
