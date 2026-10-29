import { test as base } from "@playwright/test";

import { addSessionCookies, createFlat, newTestUser, signUpAndIn, type CookieJar } from "./session";

/**
 * `test` for specs that open pages inside the app. Each worker signs one throwaway person in
 * against the local Supabase and gives them a flat, and every browser context starts with that person's session.
 */
export const test = base.extend<object, { sessionJar: CookieJar }>({
  sessionJar: [
    async ({}, run) => {
      const { jar, supabase } = await signUpAndIn(newTestUser("shell"));
      await createFlat(supabase);
      await run(jar);
    },
    { scope: "worker" },
  ],
  context: async ({ context, sessionJar, baseURL }, run) => {
    await addSessionCookies(context, sessionJar, baseURL!);
    await run(context);
  },
});

export { expect } from "@playwright/test";
