import { expect, test } from "@playwright/test";

import {
  addSessionCookies,
  createFlat,
  joinFlat,
  newTestUser,
  signUpAndIn,
} from "./support/session";
import { runLocalSql } from "./support/database";

// Two people (and a stranger) in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "two people in the shared database");
});

test.describe("the noticeboard", () => {
  test("a member posts, another sees it and an inbox note, an admin pins, a member cannot, pins outlive expiry", async ({
    browser,
    baseURL,
  }) => {
    const host = await signUpAndIn(newTestUser("board-admin"));
    await createFlat(host.supabase, "Board Flat");
    const joiner = await signUpAndIn(newTestUser("board-member"));
    await joinFlat(host.supabase, joiner.supabase);
    const stranger = await signUpAndIn(newTestUser("board-other"));
    await createFlat(stranger.supabase, "Other Board Flat");

    const pages = [];
    for (const person of [host, joiner, stranger]) {
      const context = await browser.newContext({ baseURL: baseURL! });
      await addSessionCookies(context, person.jar, baseURL!);
      pages.push(await context.newPage());
    }
    const [adminPage, memberPage, strangerPage] = pages;

    // The member posts; the admin sees it and an inbox entry that does not repeat the words.
    await memberPage.goto("/more/board");
    await memberPage.getByLabel("Post a note to the flat").fill("Landlord visiting Thursday 10am");
    await memberPage.getByRole("button", { name: "Post" }).click();
    await expect(memberPage.getByText("Landlord visiting Thursday 10am")).toBeVisible();

    await adminPage.goto("/more/board");
    await expect(adminPage.getByText("Landlord visiting Thursday 10am")).toBeVisible();
    await adminPage.goto("/notifications");
    await expect(adminPage.getByText(/posted on the noticeboard/)).toBeVisible();
    await expect(adminPage.getByText("Landlord visiting Thursday 10am")).toHaveCount(0);

    // The admin posts a pinned house rule; the member sees it on top and has no pin button.
    await adminPage.goto("/more/board");
    await adminPage.getByLabel("Post a note to the flat").fill("Shoes off in the hall");
    await adminPage.getByLabel(/Pin it/).check();
    await adminPage.getByRole("button", { name: "Post" }).click();
    await expect(adminPage.getByRole("heading", { name: "Pinned and house rules" })).toBeVisible();

    await memberPage.goto("/more/board");
    await expect(memberPage.getByRole("heading", { name: "Pinned and house rules" })).toBeVisible();
    await expect(memberPage.getByText("Shoes off in the hall")).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Pin", exact: true })).toHaveCount(0);
    await expect(memberPage.getByLabel(/Pin it/)).toHaveCount(0);

    // The member deletes their own post, and it goes at once.
    await memberPage.getByRole("button", { name: "Delete" }).click();
    await expect(memberPage.getByText("Landlord visiting Thursday 10am")).toHaveCount(0);

    // After a simulated expiry date the normal post is gone and the pin stays.
    await memberPage.getByLabel("Post a note to the flat").fill("Short lived note");
    await memberPage.getByRole("button", { name: "Post" }).click();
    await expect(memberPage.getByText("Short lived note")).toBeVisible();
    runLocalSql(
      "update public.board_posts set expires_at = now() - interval '1 minute' where body = 'Short lived note'",
    );
    await memberPage.goto("/more/board");
    await expect(memberPage.getByText("Short lived note")).toHaveCount(0);
    await expect(memberPage.getByText("Shoes off in the hall")).toBeVisible();

    // Another flat sees nothing.
    await strangerPage.goto("/more/board");
    await expect(strangerPage.getByText(/Nothing on the board/)).toBeVisible();
  });
});
