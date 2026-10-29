import { readFileSync } from "node:fs";
import path from "node:path";

import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";

/**
 * Signs a throwaway person in against the LOCAL Supabase stack (email sign-in is enabled there
 * only) and hands the browser the same cookies the real app would set. Production never uses
 * this path: it has Google sign-in only.
 */

function localSupabase(): { url: string; key: string } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    // Local runs: read .env.local, which Playwright does not load by itself.
    try {
      const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
      const read = (name: string) =>
        text
          .match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]
          ?.trim()
          .replace(/^"|"$/g, "");
      url ||= read("NEXT_PUBLIC_SUPABASE_URL");
      key ||= read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    } catch {
      // handled below
    }
  }
  if (!url || !key) throw new Error("Supabase URL and publishable key are needed for e2e sign-in.");

  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing to create test users on a non-local Supabase (${hostname}).`);
  }
  return { url, key };
}

export type CookieJar = Map<string, { value: string; options: Record<string, unknown> }>;

function clientWithJar(jar: CookieJar) {
  const { url, key } = localSupabase();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, { value }]) => ({ name, value })),
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          if (value) jar.set(name, { value, options: options ?? {} });
          else jar.delete(name);
        }
      },
    },
  });
}

export interface TestUser {
  email: string;
  password: string;
}

export function newTestUser(prefix = "e2e"): TestUser {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { email: `${prefix}-${id}@example.test`, password: `pw-${id}-Aa1!` };
}

/** Creates the user and returns a signed-in client plus the session cookies. */
export async function signUpAndIn(user: TestUser = newTestUser()) {
  const jar: CookieJar = new Map();
  const supabase = clientWithJar(jar);

  const { error } = await supabase.auth.signUp(user);
  if (error) throw error;
  // Local confirmation is off, so signUp already signed the person in; make sure either way.
  if (jar.size === 0) {
    const signedIn = await supabase.auth.signInWithPassword(user);
    if (signedIn.error) throw signedIn.error;
  }
  return { user, supabase, jar };
}

/** A second, independent session for an existing user (another "device"). */
export async function signInAgain(user: TestUser) {
  const jar: CookieJar = new Map();
  const supabase = clientWithJar(jar);
  const { error } = await supabase.auth.signInWithPassword(user);
  if (error) throw error;
  return { supabase, jar };
}

export async function addSessionCookies(context: BrowserContext, jar: CookieJar, baseURL: string) {
  const { hostname } = new URL(baseURL);
  await context.addCookies(
    [...jar].map(([name, { value }]) => ({
      name,
      value,
      domain: hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );
}
