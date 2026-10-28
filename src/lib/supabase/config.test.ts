import { describe, expect, it } from "vitest";

import { readSupabaseConfig } from "./config";

describe("readSupabaseConfig", () => {
  it("returns the URL and publishable key when both are set", () => {
    expect(
      readSupabaseConfig({
        url: "http://127.0.0.1:54321",
        publishableKey: "sb_publishable_abc",
      }),
    ).toEqual({ url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_abc" });
  });

  it("names every missing variable in the error", () => {
    expect(() => readSupabaseConfig({ url: undefined, publishableKey: "" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("names only the variable that is missing", () => {
    try {
      readSupabaseConfig({ url: "http://127.0.0.1:54321", publishableKey: undefined });
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      expect(message).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    }
  });

  it("mentions .env.example so the fix is obvious", () => {
    expect(() => readSupabaseConfig({})).toThrow(/\.env\.example/);
  });
});
