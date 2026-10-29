import { expect, test } from "@playwright/test";

import { addSessionCookies, newTestUser, signInAgain, signUpAndIn } from "./support/session";

// Users are created in the shared local database, so run these once, not per browser.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "browser independent");
});

test.describe("account page", () => {
  test("a signed-out visitor is sent to sign in and brought back afterwards", async ({ page }) => {
    await page.goto("/more/account");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fmore%2Faccount$/);
  });

  test("shows the profile created at sign-up, and a rename sticks", async ({
    page,
    context,
    baseURL,
  }) => {
    const { user, jar } = await signUpAndIn(newTestUser("rename"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/more/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    // No Google name for an email sign-up, so the profile falls back to the email's first part.
    const nameField = page.getByLabel("Display name");
    await expect(nameField).toHaveValue(user.email.split("@")[0]);
    await expect(page.getByText(user.email)).toBeVisible();

    await nameField.fill("  Ally   Adams ");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue("Ally Adams");
  });

  test("a too-long name cannot be typed past 50 characters", async ({ page, context, baseURL }) => {
    const { jar } = await signUpAndIn(newTestUser("long"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/more/account");
    await page.getByLabel("Display name").fill("x".repeat(80));
    await expect(page.getByLabel("Display name")).toHaveValue("x".repeat(50));
  });

  test("an empty name is refused by the form", async ({ page, context, baseURL }) => {
    const { jar } = await signUpAndIn(newTestUser("empty"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/more/account");
    await page.getByLabel("Display name").fill("");
    await page.getByRole("button", { name: "Save" }).click();

    const valid = await page
      .getByLabel("Display name")
      .evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(valid).toBe(false);
  });

  test("sign out ends the session on this device", async ({ page, context, baseURL }) => {
    const { jar } = await signUpAndIn(newTestUser("signout"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/more/account");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.goto("/more/account");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fmore%2Faccount$/);
  });

  test("sign out everywhere stops other devices from refreshing their session", async ({
    page,
    context,
    baseURL,
  }) => {
    const first = await signUpAndIn(newTestUser("everywhere"));
    const second = await signInAgain(first.user);

    // The second device can refresh while both sessions are alive.
    const before = await second.supabase.auth.refreshSession();
    expect(before.error).toBeNull();

    await addSessionCookies(context, first.jar, baseURL!);
    await page.goto("/more/account");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    const after = await second.supabase.auth.refreshSession();
    expect(after.error).not.toBeNull();
  });
});

test.describe("delete account", () => {
  test("needs the typed confirmation, then removes the account for good", async ({
    page,
    context,
    baseURL,
  }) => {
    const { user, jar, supabase } = await signUpAndIn(newTestUser("delete"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/more/account");
    await page.getByRole("button", { name: "Delete account" }).click();

    const confirm = page.getByRole("button", { name: "Delete my account" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/type delete/i).fill("DELETE");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/sign-in\?deleted=1$/);
    await expect(page.getByRole("status")).toContainText("Your account has been deleted");

    // The sign-in is gone: the same credentials no longer work, and the old session is dead.
    const again = await signInAgain(user).then(
      () => "signed in",
      () => "refused",
    );
    expect(again).toBe("refused");
    const stale = await supabase.auth.getUser();
    expect(stale.error).not.toBeNull();

    await page.goto("/more/account");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fmore%2Faccount$/);
  });

  test("cancelling leaves the account untouched", async ({ page, context, baseURL }) => {
    const { jar } = await signUpAndIn(newTestUser("keep"));
    await addSessionCookies(context, jar, baseURL!);

    await page.goto("/more/account");
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("button", { name: "Delete account" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Display name")).toBeVisible();
  });
});
