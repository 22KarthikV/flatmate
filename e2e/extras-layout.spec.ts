import { expect, test } from "@playwright/test";

import { addSessionCookies, createFlat, newTestUser, signUpAndIn } from "./support/session";

// One person in the shared local database, so one project only.
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop-chrome", "shared database");
});

test("every extras page fits a 360px phone and none is a placeholder", async ({
  browser,
  baseURL,
}) => {
  const host = await signUpAndIn(newTestUser("extras-layout"));
  await createFlat(host.supabase, "Layout Flat");

  const report = await host.supabase.rpc("report_fix", {
    p_title: "Bathroom extractor fan not working",
    p_details: "It rattles and then stops, and the whole room smells damp afterwards.",
    p_location: "Bathroom",
  });
  expect(report.error).toBeNull();
  const meter = await host.supabase.rpc("save_meter", {
    p_id: null as unknown as string,
    p_kind: "gas",
    p_label: "Kitchen",
    p_unit: "m3",
  });
  expect(meter.error).toBeNull();
  await host.supabase.rpc("add_shopping_item", { p_name: "Toilet roll", p_note: "The big pack" });
  await host.supabase.rpc("post_to_board", {
    p_body: "Landlord visiting Thursday 10am, please keep the hall clear.",
    p_expires_in_days: 7,
    p_pin: false,
  });

  const context = await browser.newContext({
    baseURL: baseURL!,
    viewport: { width: 360, height: 740 },
  });
  await addSessionCookies(context, host.jar, baseURL!);
  const page = await context.newPage();

  const routes = [
    "/more",
    "/more/shopping",
    "/more/bins",
    "/more/bins/manage",
    "/more/board",
    "/more/fixes",
    "/more/fixes/new",
    `/more/fixes/${report.data}`,
    "/more/meters",
    "/more/meters/new",
    `/more/meters/${meter.data}`,
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} scrolls sideways`).toBeLessThanOrEqual(0);
    await expect(
      page.getByText(/coming soon|arrives with the/i),
      `${route} is a placeholder`,
    ).toHaveCount(0);
  }

  // More lists all five tools.
  await page.goto("/more");
  for (const name of ["Shopping list", "Bin days", "Noticeboard", "Fix-it log", "Meter readings"]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await context.close();
});
